/**
 * SmartSessionManager — 智能会话管理器
 *
 * 替代旧的proactive.js中的固定时间定时器。
 * 基于SessionTriggerEvaluator实现上下文感知的主动互动。
 *
 * 接口兼容旧的 startProactiveEngine：
 *   startSmartSessionManager({ onReminder, onWellbeing, onShare })
 *   返回 stop 函数
 */

import { SessionTriggerEvaluator } from './SessionTriggerEvaluator.js';
import { loadMemories } from '../services/memory.js';
import { addSessionMinute } from '../services/relationshipTracker.js';

let globalEvaluator = null;

/**
 * 启动智能会话管理器
 * @param {object} callbacks - { onReminder, onWellbeing, onShare }
 * @param {function} getKnowledgeSystem - 返回KS实例的工厂函数
 * @returns {function} stop函数
 */
export function startSmartSessionManager(callbacks, getKnowledgeSystem) {
  const evaluator = new SessionTriggerEvaluator(getKnowledgeSystem);
  globalEvaluator = evaluator;

  // 分钟计时器（维护会话时长）
  const sessionTimer = setInterval(() => {
    addSessionMinute();
  }, 60000);

  // 主动互动检查（每3分钟，而非旧的5分钟）
  const checkInterval = setInterval(() => {
    const result = evaluator.evaluate('', '');

    if (result.shouldTrigger) {
      switch (result.type) {
        case 'reminder':
          callbacks.onReminder?.(result.content);
          break;
        case 'context':
          callbacks.onShare?.(result.content);  // 上下文引用用share通道
          break;
        case 'care':
          callbacks.onWellbeing?.(result.content);
          break;
        default:
          callbacks.onShare?.(result.content);
      }
      evaluator.onTriggered(result.type, result.itemId);
    }
  }, 3 * 60 * 1000);

  // 保留旧的每日分享（每天最多1次随机轻分享，非固定时间）
  const dailyShareCheck = setInterval(() => {
    checkDailyShare(callbacks.onShare);
  }, 30 * 60 * 1000); // 30分钟检查一次，避免过于频繁

  return () => {
    clearInterval(sessionTimer);
    clearInterval(checkInterval);
    clearInterval(dailyShareCheck);
  };
}

/**
 * 通知有新消息（用于频率限制计数）
 */
export function notifyNewMessage(userMessage) {
  if (globalEvaluator) {
    globalEvaluator.onMessage(userMessage);
  }
}

/**
 * 评估当前是否应该触发
 */
export function evaluateNow(userMessage, aiResponse) {
  if (!globalEvaluator) return null;
  return globalEvaluator.evaluate(userMessage, aiResponse);
}

/**
 * 手动触发后的通知
 */
export function notifyTriggered(type, itemId) {
  if (globalEvaluator) {
    globalEvaluator.onTriggered(type, itemId);
  }
}

/**
 * 重置会话（新对话开始时调用）
 */
export function resetSmartSession() {
  if (globalEvaluator) {
    globalEvaluator.resetSession();
  }
}

/* ---------- 每日轻分享（保留但克制） ---------- */

let didShareToday = false;
let lastShareDate = '';

function checkDailyShare(callback) {
  if (!callback) return;

  const today = new Date().toDateString();
  if (today === lastShareDate) return;
  if (didShareToday) return;

  const hour = new Date().getHours();
  // 只在工作时间段分享，且每天仅1次
  if (hour < 10 || hour > 20) return;

  didShareToday = true;
  lastShareDate = today;

  // 从知识系统获取上下文感知的分享（TODO：集成KS后替换）
  const shares = [
    '今天有什么新想法吗？有的话直接告诉我～ 💡',
    '有什么想做的项目吗？我可以帮你动手实现！',
    '遇到什么问题了吗？我随时在这儿～',
  ];
  const share = shares[Math.floor(Math.random() * shares.length)];
  callback(share);
}

/** 兼容旧API的别名 */
export function startProactiveEngine(callbacks, getKnowledgeSystem) {
  return startSmartSessionManager(callbacks, getKnowledgeSystem);
}
