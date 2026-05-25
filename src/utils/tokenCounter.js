/**
 * Token 估算工具
 *
 * 中文 ≈ 1.5 字符/token
 * 英文 ≈ 4 字符/token
 * 混合文本按比例估算
 */

import { getModelConfig } from '../services/modelAdapter';

/** 将消息content（可能是字符串或数组）规范化为纯文本用于token估算 */
function normalizeContentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(block => {
      if (block.type === 'text' && block.text) return block.text;
      if (block.type === 'tool_use') return block.name + ' ' + JSON.stringify(block.input || {});
      if (block.type === 'tool_result') return String(block.content || '').slice(0, 200);
      return '';
    }).join(' ');
  }
  return '';
}

/** 估算单条文本的token数 */
export function estimateTextTokens(text) {
  if (!text) return 0;
  const str = typeof text === 'string' ? text : normalizeContentToText(text);
  const chars = str.length;
  const chineseChars = (str.match(/[一-鿿㐀-䶿]/g) || []).length;
  const otherChars = chars - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

/** 估算消息数组的总token数 */
export function estimateMessagesTokens(messages) {
  if (!messages?.length) return 0;
  let total = 0;
  for (const msg of messages) {
    total += estimateTextTokens(msg.content || '');
    total += estimateTextTokens(msg.role || '');
  }
  return total;
}

/** 估算system prompt的token数 */
export function estimateSystemPromptTokens(systemPrompt) {
  return estimateTextTokens(systemPrompt);
}

/** 获取模型上下文窗口大小 */
export function getContextWindowSize(modelId) {
  try {
    const cfg = getModelConfig(modelId);
    return cfg.contextWindow || 128000;
  } catch {
    return 128000;
  }
}

/** 计算上下文使用比例 (0-1) */
export function getContextUsageRatio(messages, systemPrompt, modelId) {
  const msgTokens = estimateMessagesTokens(messages);
  const sysTokens = estimateSystemPromptTokens(systemPrompt);
  const total = msgTokens + sysTokens;
  const window = getContextWindowSize(modelId);
  return Math.min(total / window, 1);
}

/** 判断是否应该触发压缩（超过上下文窗口的60%） */
export function shouldCompact(messages, systemPrompt, modelId) {
  return getContextUsageRatio(messages, systemPrompt, modelId) >= 0.6;
}

/** 判断上下文是否接近极限（超过85%） */
export function isNearLimit(messages, systemPrompt, modelId) {
  return getContextUsageRatio(messages, systemPrompt, modelId) >= 0.85;
}

/** 获取上下文使用摘要（用于日志和调试） */
export function getContextSummary(messages, systemPrompt, modelId) {
  const msgTokens = estimateMessagesTokens(messages);
  const sysTokens = estimateSystemPromptTokens(systemPrompt);
  const total = msgTokens + sysTokens;
  const window = getContextWindowSize(modelId);
  return {
    messageTokens: msgTokens,
    systemPromptTokens: sysTokens,
    totalTokens: total,
    contextWindow: window,
    usageRatio: Math.round((total / window) * 100) + '%',
  };
}
