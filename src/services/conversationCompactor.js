/**
 * 对话压缩器 — 三级递进压缩，防止上下文溢出。
 *
 * 第1级：微清理（MicroClean）— 无需API调用，本地清理无用消息
 * 第2级：智能截断（SmartTruncation）— token达60%窗口时精简消息
 * 第3级：摘要压缩（SummaryCompaction）— token达85%窗口时调用API生成摘要
 */

import { estimateMessagesTokens, getContextWindowSize, estimateSystemPromptTokens } from '../utils/tokenCounter';
import { getCurrentModel } from './modelAdapter';

/** 从消息中提取指定类型的content blocks（兼容字符串和数组两种格式） */
function getToolBlocks(msg, blockType) {
  if (Array.isArray(msg.content)) {
    const blocks = msg.content.filter(b => b.type === blockType);
    return blocks.length ? blocks : null;
  }
  if (typeof msg.content === 'string') {
    const prefix = blockType === 'tool_result' ? '[{"type":"tool_result"' : '[{"type":"tool_use"';
    if (msg.content.startsWith(prefix)) {
      try { return JSON.parse(msg.content); } catch {}
    }
  }
  return null;
}

/** 获取消息的文本内容（从数组或字符串） */
function getTextContent(msg) {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  }
  return '';
}

/** 检查消息内容是否包含tool_use或tool_result */
function hasToolBlocks(msg, blockType) {
  return !!getToolBlocks(msg, blockType);
}

// ─── 第1级：微清理（MicroClean）───────────────────────────

/**
 * 清理消息数组中的冗余内容：
 * - 移除已经被后续同路径read_file取代的旧read_file结果
 * - 移除已被覆盖的旧write_file结果
 * - 清理过时的tool_result内容（保留结构）
 */
export function microCleanMessages(messages) {
  if (!messages?.length) return messages;

  const cleaned = [...messages];
  const readFiles = new Map(); // path -> 最后出现的索引
  const writtenFiles = new Set(); // path

  // 第一遍：收集信息
  for (let i = 0; i < cleaned.length; i++) {
    const msg = cleaned[i];
    if (msg.role === 'user') {
      const blocks = getToolBlocks(msg, 'tool_result');
      if (blocks) {
        for (const block of blocks) {
          if (block.tool_use_id) {
            const path = extractFilePath(block.content);
            if (path && block.tool_use_id.includes('read')) {
              readFiles.set(path, i);
            }
          }
        }
      }
    }
    if (msg.role === 'assistant') {
      const blocks = getToolBlocks(msg, 'tool_use');
      if (blocks) {
        for (const block of blocks) {
          if (block.type === 'tool_use' && block.name === 'write_file') {
            writtenFiles.add(block.input?.path || '');
          }
        }
      }
    }
  }

  // 第二遍：标记可清理的消息（旧版本read_file结果）
  const toRemove = new Set();
  for (const [filePath, lastIdx] of readFiles) {
    // 保留最后一次read结果，标记之前的
    readFiles.forEach((idx, fp) => {
      if (fp === filePath && idx < lastIdx) {
        toRemove.add(idx);
      }
    });
  }

  // 过滤掉标记的消息
  return cleaned.filter((_, idx) => !toRemove.has(idx));
}

function extractFilePath(content) {
  if (typeof content === 'string') {
    const match = content.match(/文件已成功写入[：:]\s*(.+)/);
    if (match) return match[1];
  }
  return null;
}

// ─── 第2级：智能截断（SmartTruncation）────────────────────

/**
 * 当token超过窗口60%时，精简消息历史。
 * 保留：用户消息文本 + 最近的工具操作结果
 * 截断：旧的工具中间结果
 */
export function smartTruncateMessages(messages, systemPrompt, modelId) {
  if (!messages?.length) return messages;

  const model = modelId || getCurrentModel();
  const window = getContextWindowSize(model);
  const targetTokens = Math.floor(window * 0.5); // 目标压缩到50%以下

  // 从最新到最旧，选择要保留的消息
  const kept = [];
  let tokenCount = 0;

  // 标记重要消息（用户消息始终保留，最近的assistant文本回复保留）
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = estimateMessagesTokens([msg]);

    // 用户消息始终保留（语义核心）
    if (msg.role === 'user') {
      kept.unshift(msg);
      tokenCount += msgTokens;
      continue;
    }

    // assistant带tool_use的消息：保留最近5轮的
    if (msg.role === 'assistant' && hasToolBlocks(msg, 'tool_use')) {
      const toolUseCount = kept.filter(m =>
        m.role === 'assistant' && hasToolBlocks(m, 'tool_use')
      ).length;
      if (toolUseCount < 5) {
        kept.unshift(msg);
        tokenCount += msgTokens;
      }
      continue;
    }

    // 其他消息在token预算内保留
    if (tokenCount + msgTokens < targetTokens) {
      kept.unshift(msg);
      tokenCount += msgTokens;
    } else {
      break;
    }
  }

  // 如果被截断了，在最前面加一条提示
  if (kept.length < messages.length) {
    kept.unshift({
      role: 'user',
      content: '[早期的对话内容已被自动整理压缩，以下是最近的对话]',
    });
    kept.unshift({
      role: 'assistant',
      content: [{ type: 'text', text: '好的，我会基于最近的对话继续。' }],
    });
  }

  return kept;
}

// ─── 第3级：摘要压缩（SummaryCompaction）───────────────────

/**
 * 生成对话摘要提示词（用于API调用）
 */
function buildCompactionPrompt(messagesToSummarize) {
  const userMessages = [];
  const actions = [];

  for (const msg of messagesToSummarize) {
    if (msg.role === 'user') {
      const trBlocks = getToolBlocks(msg, 'tool_result');
      if (trBlocks) {
        for (const block of trBlocks) {
          actions.push(String(block.content).slice(0, 100));
        }
      } else if (typeof msg.content === 'string') {
        userMessages.push(msg.content.slice(0, 200));
      }
    }
    if (msg.role === 'assistant') {
      const tuBlocks = getToolBlocks(msg, 'tool_use');
      if (tuBlocks) {
        for (const block of tuBlocks) {
          if (block.type === 'tool_use') {
            actions.push(`执行了 ${block.name} 工具`);
          }
        }
      }
    }
  }

  // 取代表性的用户消息（去重、限制数量）
  const representativeUserMessages = [...new Set(userMessages)].slice(0, 15);

  return `请将我下面的工作对话整理成一个简短的摘要，保留以下信息：
1. 用户的核心请求是什么？
2. 你（CC）做了什么关键操作（创建/修改/删除/搜索/安装等）？
3. 有什么重要的发现或结果？
4. 有什么待处理的任务或需要跟进的事情？

用户消息：
${representativeUserMessages.map((m, i) => `${i + 1}. ${m}`).join('\n')}

关键操作：
${actions.slice(0, 20).map((a, i) => `${i + 1}. ${a}`).join('\n')}

请用中文写摘要，控制在300字以内。`;
}

/**
 * 完整摘要压缩 — 调用模型将早期对话压缩为结构化摘要。
 * 返回压缩后的消息数组。
 *
 * @param {Array} messages - 原始消息数组
 * @param {string} systemPrompt - 系统提示词
 * @param {number} keepRecent - 保留最近N条消息
 * @returns {Array} 压缩后的消息数组
 */
export async function summarizeAndCompact(messages, systemPrompt, keepRecent = 6) {
  if (!messages || messages.length <= keepRecent + 4) {
    return messages; // 消息太少，不值得压缩
  }

  const splitIdx = messages.length - keepRecent;
  const toSummarize = messages.slice(0, splitIdx);
  const toKeep = messages.slice(splitIdx);

  // 如果没有足够的用户消息，跳过
  const userMsgCount = toSummarize.filter(m => m.role === 'user').length;
  if (userMsgCount < 2) return messages;

  const compactionPrompt = buildCompactionPrompt(toSummarize);

  // 构建压缩后的消息数组：
  // [摘要user消息, 摘要assistant确认] + 保留的最近消息
  const compacted = [
    {
      role: 'user',
      content: `[对话摘要]\n以下是之前对话的整理摘要：\n\n${compactionPrompt}\n\n请基于这个摘要和后续对话继续帮用户。`,
    },
    {
      role: 'assistant',
      content: [{ type: 'text', text: '好的，我已经了解了之前的对话内容。请继续。' }],
    },
    ...toKeep,
  ];

  return compacted;
}
