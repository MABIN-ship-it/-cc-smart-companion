/**
 * ReAct (Reasoning + Acting) 循环引擎
 *
 * Think → Act → Observe 循环：
 * 1. 发送消息+工具定义到模型API（通过modelAdapter）
 * 2. 如果模型返回tool_use → 执行工具 → 结果反馈 → 回到步骤1
 * 3. 如果模型返回纯文本 → 返回给用户
 * 4. 最多迭代10轮，每轮有60秒超时
 *
 * 关键改进（v2.0）：
 * - 多模型支持（通过modelAdapter，不再硬编码DeepSeek）
 * - tools字段传递给API（标准的JSON Schema tool_use协议）
 * - Token计数+对话压缩（防止上下文溢出）
 * - 工具并行执行（独立工具PRomise.all）
 * - 改进的消息格式（避免JSON.stringify污染content）
 * - 智能错误恢复
 */

import { sendModelRequestStream, sendModelRequest, getCurrentModel, getModelConfig, buildToolResultsMessage, buildToolResultMessage, buildToolUseMessage } from './modelAdapter';
import { executeTool, getToolDefinitions, toolExists } from './toolRegistry';
import { estimateMessagesTokens, getContextUsageRatio, shouldCompact, isNearLimit } from '../utils/tokenCounter';
import { microCleanMessages, smartTruncateMessages } from './conversationCompactor';
import { categorizeError, isRetryable } from './errorHandler';
import { describeImages } from './visionProxy';

const MAX_ITERATIONS = 10;
const MAX_TOOL_OUTPUT = 3000;

// ─── 流式请求辅助：既流式输出到UI，又返回统一格式供工具处理 ───

async function streamingRequest({ model, messages, systemPrompt, tools, onProgress, signal }) {
  let fullText = '';
  let fullThinking = '';
  const toolUses = [];
  let stopReason = null;

  try {
    for await (const frame of sendModelRequestStream({
      model,
      messages,
      systemPrompt,
      tools,
      maxTokens: 4096,
      temperature: 0.7,
      signal,
    })) {
      if (frame.type === 'text') {
        fullText = frame.accumulated;
        onProgress?.({ type: 'text', data: fullText });
      } else if (frame.type === 'think') {
        fullThinking = frame.accumulated;
        onProgress?.({ type: 'think', data: fullThinking });
      } else if (frame.type === 'tool_use') {
        toolUses.push(frame.toolUse);
      } else if (frame.type === 'done') {
        fullText = frame.text || fullText;
        stopReason = frame.stopReason;
      } else if (frame.type === 'error') {
        return { error: frame.error };
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    return { error: categorizeError(e) };
  }

  return { text: fullText, thinking: fullThinking, toolUses, stopReason };
}

// ─── 非流式请求（400回退用）──────────────────────────────

async function nonStreamingRequest({ model, messages, systemPrompt, tools, onProgress, signal }) {
  try {
    const result = await sendModelRequest({
      model,
      messages,
      systemPrompt,
      tools,
      maxTokens: 4096,
      temperature: 0.7,
      signal,
    });

    if (result.error) {
      return { error: result.error };
    }

    if (result.thinking) {
      onProgress?.({ type: 'think', data: result.thinking });
    }

    if (result.text) {
      onProgress?.({ type: 'text', data: result.text });
    }

    return {
      text: result.text || '',
      thinking: result.thinking || '',
      toolUses: result.toolUses || [],
      stopReason: result.stopReason || null,
    };
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    return { error: categorizeError(e) };
  }
}

/**
 * 运行ReAct循环。
 *
 * @param {string} userMessage - 用户消息
 * @param {object} state - 应用状态
 * @param {string} apiKey - API密钥（向后兼容，modelAdapter内部自行获取）
 * @param {function} onProgress - 进度回调
 * @param {AbortSignal} signal - 中断信号
 * @returns {Promise<string>} 最终回复文本
 */
export async function runReActLoop(userMessage, state, apiKey, systemPrompt, onProgress, signal, images) {
  const model = getCurrentModel();
  const tools = getToolDefinitions();

  // ── 构建初始消息 ──────────────────────────────────────
  const messages = [];
  const recentHistory = state.messages.slice(-20); // 从15增加到20

  for (const m of recentHistory) {
    if (m.role === 'user' || m.role === 'assistant') {
      // 如果是带图片的用户消息，构建 content 数组（含 image blocks）
      if (m.role === 'user' && m.images?.length > 0) {
        const blocks = [];
        for (const img of m.images) {
          const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
          if (match) {
            blocks.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } });
          }
        }
        const textContent = typeof m.content === 'string' ? m.content : '';
        if (textContent) blocks.push({ type: 'text', text: textContent });
        messages.push({ role: 'user', content: blocks });
      } else {
        // 保留原始 content 格式：字符串直接传，数组保留全部 blocks（含 thinking/tool_use）
        if (typeof m.content === 'string') {
          messages.push({ role: m.role, content: m.content });
        } else if (Array.isArray(m.content)) {
          messages.push({ role: m.role, content: m.content });
        } else {
          messages.push({ role: m.role, content: String(m.content) });
        }
      }
    }
  }

  // 避免重复添加：如果最后一条消息已经是相同的用户消息，不再追加
  const lastMsg = messages[messages.length - 1];
  const lastText = Array.isArray(lastMsg?.content)
    ? lastMsg.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
    : lastMsg?.content;
  if (lastMsg?.role === 'user' && lastText === userMessage) {
    // userMessage 已在 state.messages 中存在，无需重复
  } else if (images && images.length > 0) {
    const blocks = [];
    for (const img of images) {
      const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } });
      }
    }
    if (userMessage) blocks.push({ type: 'text', text: userMessage });
    messages.push({ role: 'user', content: blocks });
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  // ── 视觉代理：非视觉模型用 OCR 提取图片文字 ──────────────
  const modelCfg = getModelConfig(model);
  if (!modelCfg?.vision) {
    const lastUserMsg = messages[messages.length - 1];
    const content = lastUserMsg?.content;
    if (lastUserMsg?.role === 'user' && Array.isArray(content)) {
      const imageBlocks = content.filter(b => b.type === 'image');
      const textBlocks = content.filter(b => b.type === 'text');
      if (imageBlocks.length > 0) {
        onProgress?.({ type: 'status', data: '正在提取图片文字...' });
        const ocrText = await describeImages(imageBlocks);
        const textContent = textBlocks.map(b => b.text).join('\n');
        const combined = ocrText
          ? `${textContent}\n\n[以下为图片中提取的文字内容，供你参考：]\n${ocrText}\n[注：当前模型不支持图像识别，以上为OCR文字提取结果]`
          : `${textContent}\n\n[注：用户发送了${imageBlocks.length}张图片，但当前模型不支持图像识别，图中也未检测到文字。建议切换至视觉模型。]`;
        lastUserMsg.content = combined;
      }
    }
    // 历史消息中的图片也做同样处理
    for (let i = 0; i < messages.length - 1; i++) {
      const m = messages[i];
      if (m.role === 'user' && Array.isArray(m.content)) {
        const imgBlocks = m.content.filter(b => b.type === 'image');
        if (imgBlocks.length > 0) {
          const txtBlocks = m.content.filter(b => b.type === 'text');
          const ocrText = await describeImages(imgBlocks);
          const txt = txtBlocks.map(b => b.text).join('\n');
          m.content = ocrText
            ? `${txt}\n\n[历史图片文字]:\n${ocrText}`
            : `${txt}\n[历史图片: ${imgBlocks.length}张]`;
        }
      }
    }
  }

  // ── 第1级压缩：微清理 ──────────────────────────────────
  const cleanedMessages = microCleanMessages(messages);

  let conversation = cleanedMessages;
  let iteration = 0;
  let finalResponse = '';
  let roundPrefix = ''; // 跨轮累积文本

  // 包装 onProgress：跨轮文本带上历史前缀
  const wrapProgress = (event) => {
    if (event.type === 'text' && roundPrefix) {
      onProgress?.({ type: 'text', data: roundPrefix + '\n\n' + event.data });
    } else {
      onProgress?.(event);
    }
  };

  // ── ReAct循环 ──────────────────────────────────────────
  while (iteration < MAX_ITERATIONS) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    iteration++;

    onProgress?.({
      type: 'status',
      data: iteration === 1 ? '正在分析你的请求...' : '正在继续处理...',
    });

    // ── 压缩检查 ────────────────────────────────────────
    if (shouldCompact(conversation, systemPrompt, model)) {
      onProgress?.({ type: 'status', data: '对话较长，正在整理上下文...' });
      conversation = smartTruncateMessages(conversation, systemPrompt, model);
    }

    // 如果接近极限，尝试更激进截断
    if (isNearLimit(conversation, systemPrompt, model)) {
      conversation = smartTruncateMessages(conversation, systemPrompt, model);
    }

    // ── 调用模型API（流式，文本实时输出）─────────────────
    const timeoutSignal = AbortSignal.timeout(60000);
    const fetchSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    let result = await streamingRequest({
      model,
      messages: conversation,
      systemPrompt,
      tools,
      onProgress: wrapProgress,
      signal: fetchSignal,
    });

    // 流式400时回退到非流式（DeepSeek Anthropic兼容层已知问题）
    if (result.error && result.error.includes('400')) {
      onProgress?.({ type: 'status', data: '正在切换通信方式...' });
      result = await nonStreamingRequest({
        model,
        messages: conversation,
        systemPrompt,
        tools,
        onProgress: wrapProgress,
        signal: fetchSignal,
      });
    }

    // ── 处理API错误 ──────────────────────────────────────
    if (result.error) {
      return `API错误: ${result.error}`;
    }

    // ── 没有tool_use：返回文本给用户 ──────────────────────
    if (!result.toolUses || result.toolUses.length === 0) {
      if (result.text) {
        const finalText = roundPrefix ? roundPrefix + '\n\n' + result.text : result.text;
        onProgress?.({ type: 'text', data: finalText });
        return finalText;
      }
      // 空响应：让模型继续
      conversation.push({ role: 'assistant', content: '请继续。' });
      continue;
    }

    // ── 有tool_use：执行工具 ──────────────────────────────
    // 构建assistant消息（保留原始的content blocks用于消息历史）
    const assistantBlocks = [];
    if (result.thinking) {
      assistantBlocks.push({ type: 'thinking', thinking: result.thinking });
    }
    if (result.text) {
      assistantBlocks.push({ type: 'text', text: result.text });
    }
    for (const tu of result.toolUses) {
      assistantBlocks.push({
        type: 'tool_use',
        id: tu.id,
        name: tu.name,
        input: tu.input,
      });
    }
    conversation.push(buildToolUseMessage(assistantBlocks));

    // ── 区分独立工具和依赖工具 ────────────────────────────
    const independentTools = [];
    const dependentTools = [];
    const fileSystemTools = ['read_file', 'write_file', 'list_dir', 'delete_file', 'read_document'];

    for (const tu of result.toolUses) {
      if (!toolExists(tu.name)) {
        onProgress?.({ type: 'tool_call', data: { id: tu.id, name: tu.name, input: tu.input, displayName: `未知工具: ${tu.name}` } });
        conversation.push(buildToolResultMessage(tu.id, `未知工具: ${tu.name}。可用工具: ${tools.map(t => t.name).join(', ')}`));
        continue;
      }

      // 文件系统工具和shell工具可能有依赖关系，串行执行更安全
      if (fileSystemTools.includes(tu.name) || tu.name === 'execute_shell') {
        dependentTools.push(tu);
      } else {
        independentTools.push(tu);
      }
    }

    // ── 收集所有工具结果（最后合并为一条 user 消息）──────
    const allToolResults = [];

    // ── 并行执行独立工具 ──────────────────────────────────
    if (independentTools.length > 0) {
      const parallelResults = await Promise.all(
        independentTools.map(async (tu) => {
          const displayName = tu.name;
          onProgress?.({ type: 'tool_call', data: { id: tu.id, name: tu.name, input: tu.input, displayName } });

          const startTime = Date.now();
          let toolResult;
          try {
            toolResult = await executeTool(tu.name, tu.input);
          } catch (e) {
            toolResult = `工具执行异常: ${e.message}`;
          }
          const duration = Date.now() - startTime;

          const truncated = typeof toolResult === 'string' ? toolResult.slice(0, MAX_TOOL_OUTPUT) : toolResult;
          onProgress?.({ type: 'tool_result', data: { id: tu.id, name: tu.name, result: truncated, duration } });

          return { tu, result: truncated };
        })
      );

      for (const { tu, result: toolResult } of parallelResults) {
        allToolResults.push({ tool_use_id: tu.id, content: toolResult });
      }
    }

    // ── 串行执行依赖工具 ──────────────────────────────────
    for (const tu of dependentTools) {
      const displayName = tu.name;
      onProgress?.({ type: 'tool_call', data: { id: tu.id, name: tu.name, input: tu.input, displayName } });

      const startTime = Date.now();
      let toolResult;
      try {
        toolResult = await executeTool(tu.name, tu.input);
      } catch (e) {
        toolResult = `工具执行异常: ${e.message}`;
      }
      const duration = Date.now() - startTime;

      const truncated = typeof toolResult === 'string' ? toolResult.slice(0, MAX_TOOL_OUTPUT) : toolResult;
      onProgress?.({ type: 'tool_result', data: { id: tu.id, name: tu.name, result: truncated, duration } });

      allToolResults.push({ tool_use_id: tu.id, content: truncated });
    }

    // 将所有 tool_result 合并到一条 user 消息中（Anthropic API 要求）
    if (allToolResults.length > 0) {
      conversation.push(buildToolResultsMessage(allToolResults));
    }

    // 保存本轮文本到跨轮前缀，防止下一轮覆盖
    if (result.text) {
      roundPrefix = roundPrefix ? roundPrefix + '\n\n' + result.text : result.text;
    }

    // 继续循环
  }

  // ── 达到最大迭代次数：请求模型总结（流式输出）──────────
  conversation.push({
    role: 'user',
    content: '请基于上述工具执行结果，给我一个简洁的总结回复，说明完成了什么、结果如何。',
  });

  const timeoutSignal2 = AbortSignal.timeout(60000);
  const fetchSignal2 = signal
    ? AbortSignal.any([signal, timeoutSignal2])
    : timeoutSignal2;

  const finalResult = await streamingRequest({
    model,
    messages: conversation,
    systemPrompt,
    tools: [],
    onProgress: wrapProgress,
    signal: fetchSignal2,
  });

  if (finalResult.text) {
    const finalText = roundPrefix ? roundPrefix + '\n\n' + finalResult.text : finalResult.text;
    return finalText;
  }
  if (finalResult.error) {
    return finalResult.error;
  }

  return finalResponse || '抱歉，处理过程中遇到了问题，请尝试简化你的请求。';
}
