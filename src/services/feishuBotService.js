/**
 * 飞书 Bot 服务 — CC 以机器人身份在飞书中响应
 *
 * 当飞书用户给 CC 发消息或在群中 @CC 时，Bot 自动用 AI 回复。
 * 支持配置：启用/禁用、监控群列表、回复模式、对话上下文。
 */
import {
  sendMessage, sendCardMessage, getChatList,
  extractTextFromEvent, extractSenderOpenId,
  isFeishuConfigured, getMyOpenId,
  setDefaultReceiveContext, getDefaultReceiveContext,
} from './feishu';
import { sendModelRequest, getCurrentModel, getApiKey } from './modelAdapter';
import { getTaskExecutionHints } from './feishuTaskExecutor';

const BOT_CONFIG_KEY = 'cc_feishu_bot_config';
const BOT_CONTEXT_KEY = 'cc_feishu_bot_contexts';

// ─── Bot 配置 ─────────────────────────────────────

const DEFAULT_CONFIG = {
  enabled: true,
  autoReply: true,          // 自动AI回复
  replyToGroups: true,      // 回复群聊 @mention
  replyToPrivate: true,     // 回复私聊消息
  maxContextMessages: 10,   // 每个会话保留最近N条消息作为上下文
  replyStyle: 'friendly',   // friendly/professional/concise
  monitoredChatIds: [],     // 限定监控的群ID（空=全部）
  ignoreChatIds: [],        // 忽略的群ID
};

export function getBotConfig() {
  try {
    const raw = localStorage.getItem(BOT_CONFIG_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch { return { ...DEFAULT_CONFIG }; }
}

export function saveBotConfig(updates) {
  const config = { ...getBotConfig(), ...updates };
  localStorage.setItem(BOT_CONFIG_KEY, JSON.stringify(config));
  return config;
}

// ─── 对话上下文管理 ───────────────────────────────

function getContextStore() {
  try {
    return JSON.parse(localStorage.getItem(BOT_CONTEXT_KEY) || '{}');
  } catch { return {}; }
}

function saveContextStore(store) {
  // 只保留最近 20 个会话
  const keys = Object.keys(store).slice(-20);
  const trimmed = {};
  keys.forEach(k => { trimmed[k] = store[k]; });
  localStorage.setItem(BOT_CONTEXT_KEY, JSON.stringify(trimmed));
}

function getConversationContext(chatId) {
  const store = getContextStore();
  return store[chatId] || { messages: [], lastActive: 0 };
}

function addToContext(chatId, role, content) {
  const store = getContextStore();
  const ctx = store[chatId] || { messages: [], lastActive: 0 };
  const config = getBotConfig();
  ctx.messages.push({ role, content, time: Date.now() });
  if (ctx.messages.length > config.maxContextMessages * 2) {
    ctx.messages = ctx.messages.slice(-config.maxContextMessages * 2);
  }
  ctx.lastActive = Date.now();
  store[chatId] = ctx;
  saveContextStore(store);
}

// ─── 消息解析 ───────────────────────────────────

/**
 * 从 WebSocket 事件数据中提取消息内容和元数据
 */
export function parseIncomingMessage(eventData) {
  try {
    const event = eventData?.event || eventData;
    const msg = event?.message || eventData?.message || {};
    const sender = event?.sender || eventData?.sender || {};

    const messageId = msg.message_id || '';
    const chatId = msg.chat_id || '';
    const chatType = msg.chat_type || 'private'; // 'private' | 'group'
    const senderId = sender?.sender_id?.open_id || '';
    const senderName = sender?.sender_id?.name || '';
    const rootId = msg.root_id || ''; // 被回复的消息ID
    const parentId = msg.parent_id || '';

    // 提取文本
    let text = '';
    const content = msg.content || '';
    try {
      const parsed = JSON.parse(content);
      if (parsed.text) {
        text = parsed.text;
      } else if (parsed.elements) {
        text = parsed.elements.map(e => {
          if (e.text_run?.content) return e.text_run.content;
          if (e.mention?.name) return `@${e.mention.name}`;
          return '';
        }).join('');
      }
      // 检测是否 @了机器人
      const mentions = parsed.entities || [];
      const atIds = mentions
        .filter(e => e.type === 'mention' || e.mention)
        .map(e => e.mention?.open_id || e.user_id || '')
        .filter(Boolean);
      return { messageId, chatId, chatType, senderId, senderName, text, rootId, parentId, mentionedUserIds: atIds, rawContent: parsed };
    } catch {
      text = content.slice(0, 500);
    }

    return { messageId, chatId, chatType, senderId, senderName, text, rootId, parentId, mentionedUserIds: [], rawContent: null };
  } catch {
    return null;
  }
}

/**
 * 判断是否应该回复此消息
 */
export async function shouldReply(parsed) {
  if (!parsed) return false;
  const config = getBotConfig();
  if (!config.enabled || !config.autoReply) return false;

  const { chatId, chatType, senderId, text } = parsed;

  // 忽略来自自己的消息
  try {
    const myId = await getMyOpenId();
    if (myId && senderId === myId) return false;
  } catch {}

  // 忽略列表中的群
  if (config.ignoreChatIds.includes(chatId)) return false;

  // 如果有限定监控群，只回复这些群
  if (config.monitoredChatIds.length > 0 && chatType === 'group') {
    if (!config.monitoredChatIds.includes(chatId)) return false;
  }

  // 如果消息太短 (< 3 字符)，不回复
  if (text.length < 3) return false;

  if (chatType === 'private') {
    return config.replyToPrivate;
  }

  if (chatType === 'group') {
    // 群聊中需要确认 @了 CC 或在提问
    if (!config.replyToGroups) return false;
    const isAtMention = parsed.mentionedUserIds?.length > 0;
    const isQuestion = /[？?]$/.test(text) || /^(帮|请|帮帮|来来|说下|解释|分析|查|找|写|做)/.test(text);
    return isAtMention || isQuestion;
  }

  return false;
}

// ─── AI 回复生成 ────────────────────────────────

const BOT_SYSTEM_PROMPT = `你是 CC，飞书助手机器人。你在飞书中代表用户回复消息。

## 你的身份
你是用户在飞书中的 AI 代表。用户授权你替他回复消息、处理任务。

## 回复规则
1. 如果消息是任务安排（写报告、填表、审批等），告诉对方你会处理，并说明预计完成时间
2. 如果是简单问题，直接回答
3. 如果是闲聊，友好回复
4. 回复用中文，自然亲切
5. 保持简短（50-150字），非必要不展开
6. 如果有人问用户在不在，说"在忙，有什么事先跟我说，我帮你转达"`;

/**
 * 生成 AI 回复
 */
async function generateAIReply(messageText, chatId, senderName) {
  const model = getCurrentModel();
  const apiKey = getApiKey(model);
  if (!apiKey) {
    return `收到"${messageText.slice(0, 50)}"，已通知用户，稍后回复你。`;
  }

  // 获取对话上下文
  const ctx = getConversationContext(chatId);
  const contextMessages = ctx.messages.slice(-6).map(m =>
    `${m.role === 'user' ? `${senderName || '对方'}` : 'CC'}: ${m.content.slice(0, 150)}`
  ).join('\n');

  try {
    const result = await sendModelRequest({
      model,
      messages: [{
        role: 'user',
        content: `对方（${senderName || '未知'}）发来消息：${messageText}
        ${contextMessages ? `\n最近对话上下文：\n${contextMessages}` : ''}

        请生成一个简短友好的回复。如果你判断这是一个需要用户本人处理的重要事务（如法律、财务审批等），回复说收到并转达。`,
      }],
      systemPrompt: BOT_SYSTEM_PROMPT,
      tools: [],
      maxTokens: 500,
      temperature: 0.7,
      signal: AbortSignal.timeout(15000),
    });

    return result?.text?.trim() || `收到，我已转达给用户。`;
  } catch {
    return `收到，我会帮你处理。`;
  }
}

// ─── 主要接口 ────────────────────────────────────

/**
 * 处理收到的飞书消息（由 ChatInterface 的 onFeishuMessage 调用）
 * @returns {object|null} 处理结果
 */
export async function handleIncomingMessage(eventData) {
  if (!isFeishuConfigured()) return null;

  const parsed = parseIncomingMessage(eventData);
  if (!parsed) return null;

  // 首次联系 → 记住这个会话
  if (!getDefaultReceiveContext()) {
    if (parsed.chatType === 'group' && parsed.chatId) {
      setDefaultReceiveContext('chat_id', parsed.chatId);
    } else if (parsed.chatType === 'private' && parsed.senderId) {
      setDefaultReceiveContext('open_id', parsed.senderId);
    }
  }

  const should = await shouldReply(parsed);
  if (!should) return null;

  try {
    // 记录消息到对话上下文
    addToContext(parsed.chatId, 'user', parsed.text);

    // 生成 AI 回复
    const reply = await generateAIReply(parsed.text, parsed.chatId, parsed.senderName);

    // 发送回复
    let result;
    if (parsed.chatType === 'group') {
      // 群聊中回复（使用 chat_id）
      result = await sendMessage('chat_id', parsed.chatId, reply);
    } else {
      // 私聊回复（使用 open_id）
      result = await sendMessage('open_id', parsed.senderId, reply);
    }

    // 记录回复到上下文
    addToContext(parsed.chatId, 'assistant', reply);

    return {
      handled: true,
      messageId: result?.messageId,
      reply,
      chatId: parsed.chatId,
      senderName: parsed.senderName,
    };
  } catch (e) {
    console.error('[BotService] 回复失败:', e.message);
    return { handled: false, error: e.message };
  }
}

/**
 * Bot 主动向用户/群发消息
 */
export async function botSendToChat(chatId, chatType, content) {
  const receiveIdType = chatType === 'group' ? 'chat_id' : 'open_id';
  return sendMessage(receiveIdType, chatId, content);
}

/**
 * Bot 主动发送互动卡片
 */
export async function botSendCard(chatId, chatType, cardJson) {
  const receiveIdType = chatType === 'group' ? 'chat_id' : 'open_id';
  return sendCardMessage(receiveIdType, chatId, cardJson);
}

/**
 * 获取 Bot 可以监控的群列表
 */
export async function getMonitorableChats() {
  if (!isFeishuConfigured()) return [];
  try {
    const chats = await getChatList({ pageSize: 100 });
    const config = getBotConfig();
    return chats.map(c => ({
      chatId: c.chat_id,
      name: c.name || '未命名群',
      monitored: config.monitoredChatIds.length === 0 || config.monitoredChatIds.includes(c.chat_id),
      ignored: config.ignoreChatIds.includes(c.chat_id),
    }));
  } catch { return []; }
}

/**
 * 清除指定会话的上下文
 */
export function clearBotContext(chatId) {
  const store = getContextStore();
  delete store[chatId];
  saveContextStore(store);
}

/**
 * 获取Bot统计
 */
export function getBotStats() {
  const store = getContextStore();
  const chats = Object.keys(store);
  const totalMessages = chats.reduce((sum, k) => sum + (store[k]?.messages?.length || 0), 0);
  const activeChats = chats.filter(k => {
    const ctx = store[k];
    return ctx?.lastActive && (Date.now() - ctx.lastActive < 86400000);
  });

  return {
    totalChats: chats.length,
    activeChats: activeChats.length,
    totalMessages,
    lastActive: Math.max(...chats.map(k => store[k]?.lastActive || 0), 0),
  };
}
