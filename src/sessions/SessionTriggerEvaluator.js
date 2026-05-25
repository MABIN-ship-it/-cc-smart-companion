/**
 * SessionTriggerEvaluator — 智能触发决策引擎
 *
 * 替代固定时间的主动分享，基于上下文决定何时互动：
 *   1. 上下文关联 — 当前话题匹配到历史记忆时引用
 *   2. 目标追踪 — deadline/goal临近时提醒
 *   3. 情绪感知 — 检测压力标记后温和询问（仅在用户授权时）
 *   4. 频率限制 — 每10条消息最多1次主动互动，每会话最多3次
 *   5. 去重 — 不重复提醒已提醒过的内容
 */

import { NODE_TYPES } from '../knowledge/graph/NodeTypes.js';

class SessionTriggerEvaluator {
  constructor(getKnowledgeSystem) {
    this._getKS = getKnowledgeSystem;
    this._triggeredThisSession = 0;
    this._messageSinceLastTrigger = 0;
    this._remindedItems = new Set();
    this._sessionMessageCount = 0;
  }

  /** 重置会话状态 */
  resetSession() {
    this._triggeredThisSession = 0;
    this._messageSinceLastTrigger = 0;
    this._sessionMessageCount = 0;
    this._remindedItems.clear();
  }

  /** 收到新消息时调用 */
  onMessage(userMessage) {
    this._messageSinceLastTrigger++;
    this._sessionMessageCount++;
  }

  /** 触发后调用，通知触发成功 */
  onTriggered(type, itemId = null) {
    this._triggeredThisSession++;
    this._messageSinceLastTrigger = 0;
    if (itemId) this._remindedItems.add(itemId);
  }

  /**
   * 评估是否应该主动互动，以及互动内容。
   * @returns {{ shouldTrigger: boolean, content?: string, type?: string }}
   */
  evaluate(userMessage, aiResponse) {
    // 频率限制：每10条消息最多1次
    if (this._messageSinceLastTrigger < 10) {
      return { shouldTrigger: false };
    }

    // 每会话最多3次主动互动
    if (this._triggeredThisSession >= 3) {
      return { shouldTrigger: false };
    }

    const ks = this._getKS?.();
    if (!ks) return { shouldTrigger: false };

    try {
      // 1. 检查目标/截止日
      const deadlineResult = this._checkDeadlines(ks);
      if (deadlineResult) return deadlineResult;

      // 2. 检查上下文关联
      const contextResult = this._checkContextRelevance(ks, userMessage);
      if (contextResult) return contextResult;

      // 3. 检查情绪感知
      const emotionResult = this._checkEmotion(ks, userMessage);
      if (emotionResult) return emotionResult;

    } catch (err) {
      console.warn('[TriggerEvaluator] 评估失败:', err);
    }

    return { shouldTrigger: false };
  }

  /* ---------- 私有方法 ---------- */

  _checkDeadlines(ks) {
    const storage = ks._storage;
    if (!storage) return null;

    const memories = storage.queryEntities({ type: NODE_TYPES.MEMORY });
    const now = Date.now();

    for (const m of memories) {
      if (this._remindedItems.has(m.id)) continue;

      const isGoal = m.type === 'goal' || (m.content && m.content.includes('目标'));
      const isDeadline = m.type === 'deadline' || (m.content && /截止|deadline|due|到期/.test(m.content));

      if (!isGoal && !isDeadline) continue;

      // 检查是否临近（7天内）
      const expiresAt = m.expiresAt || m.expires_at;
      if (expiresAt) {
        const daysLeft = Math.ceil((expiresAt - now) / 86400000);
        if (daysLeft >= 0 && daysLeft <= 7) {
          return {
            shouldTrigger: true,
            type: 'reminder',
            content: this._formatDeadlineReminder(m, daysLeft),
            itemId: m.id,
          };
        }
      }
    }
    return null;
  }

  _formatDeadlineReminder(memory, daysLeft) {
    const content = memory.content || '';
    const name = content.length > 40 ? content.slice(0, 40) + '...' : content;

    if (daysLeft === 0) {
      return `📅 提醒一下，「${name}」就是今天了哦～`;
    } else if (daysLeft === 1) {
      return `📅 「${name}」明天就是了，准备好了吗？`;
    } else {
      return `📅 「${name}」还有${daysLeft}天，别忘了提前准备～`;
    }
  }

  _checkContextRelevance(ks, userMessage) {
    if (!userMessage) return null;

    const storage = ks._storage;
    if (!storage) return null;

    // 搜索与当前消息关键词相关的记忆
    const tokens = this._tokenize(userMessage.toLowerCase());
    if (tokens.length < 2) return null;

    const memories = storage.queryEntities({ type: NODE_TYPES.MEMORY });
    let bestMatch = null;
    let bestScore = 0;

    for (const m of memories) {
      if (this._remindedItems.has(m.id)) continue;
      if (m.level !== 'hot') continue;

      const content = (m.content || '').toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (content.includes(t)) score += t.length;
      }

      if (score > bestScore && score > 6) {
        bestScore = score;
        bestMatch = m;
      }
    }

    if (bestMatch) {
      const content = bestMatch.content || '';
      const snippet = content.length > 60 ? content.slice(0, 60) + '...' : content;
      return {
        shouldTrigger: true,
        type: 'context',
        content: `说到这个，让我想起你之前提到过「${snippet}」～`,
        itemId: bestMatch.id,
      };
    }
    return null;
  }

  _checkEmotion(ks, userMessage) {
    if (!userMessage) return null;

    const psych = ks._profileModel?.getPsychologicalProfile() || {};

    // 检测用户消息中的负面情绪信号
    const stressWords = /累死了|好累|压力|焦虑|烦|崩溃|难受|不开心|生气|沮丧|疲惫/;
    if (!stressWords.test(userMessage)) return null;

    // 检查用户是否允许健康关怀（从画像中查找 wellbeing opt-in）
    const identity = ks._profileModel?.getIdentity() || {};
    const wellbeing = identity['wellbeing_opt_in'];
    if (wellbeing && wellbeing.value === false) return null;

    // 检查是否已经在这轮会话中关怀过
    const stressPatterns = psych['emotional_patterns'] || [];
    const stressTraits = Array.isArray(stressPatterns)
      ? stressPatterns.map(t => typeof t === 'string' ? t : t.trait).filter(Boolean)
      : [];

    if (stressTraits.length > 0 && Math.random() < 0.4) {
      return {
        shouldTrigger: true,
        type: 'care',
        content: '听你这么一说，感觉你最近压力不小呢。有什么想聊聊的吗？',
      };
    }
    return null;
  }

  /** 简单中文分词 */
  _tokenize(text) {
    // CJK bigram + word boundary tokens
    const tokens = [];
    const cleaned = text.replace(/[，。！？、,.!?\n]/g, ' ');
    const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
    for (const w of words) {
      // 中文bigram
      if (/[一-鿿]/.test(w)) {
        for (let i = 0; i < w.length - 1; i++) {
          tokens.push(w.slice(i, i + 2));
        }
      }
      // 英文/数字原样
      if (/[a-z0-9]/.test(w)) {
        tokens.push(w);
      }
    }
    return tokens;
  }
}

export { SessionTriggerEvaluator };
export default SessionTriggerEvaluator;
