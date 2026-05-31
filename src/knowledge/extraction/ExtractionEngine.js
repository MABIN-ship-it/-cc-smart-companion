/**
 * ExtractionEngine — LLM驱动的知识提取编排器。
 *
 * 替代 ChatInterface.jsx 中5个分散的正则提取，
 * 一次LLM调用提取所有维度，支持去抖批处理、缓存、降级。
 */

import { buildExtractionSystemPrompt, buildExtractionUserMessage, buildBatchExtractionMessage } from './ExtractionPrompt.js';
import { buildExtractionSchema } from './schemas/ExtractionSchema.js';
import { getExtractionCache } from './ExtractionCache.js';
import { getStorageEngine } from '../storage/StorageEngine.js';
import { getCapacityManager } from '../storage/CapacityManager.js';
import { normalizeProfileKey } from '../graph/KnowledgeGraph.js';

/** 降级提取的最小正则集合（仅关键字段） */
const FALLBACK_PATTERNS = [
  { regex: /我(?:的?名字?|叫)\s*([^\s，。！？、,.!?\n]{1,10})/g, key: 'name', category: 'identity', confidence: 0.6 },
  { regex: /我是\s*([^\s，。！？、,.!?\n]{1,20}(?:工程师|设计师|学生|产品经理|运营|开发|程序员|老师|医生|律师|[^\s，。！？、,.!?\n]{1,2}师)?)/g, key: 'occupation', category: 'identity', confidence: 0.5 },
  { regex: /我在\s*([^\s，。！？、,.!?\n]{1,10})/g, key: 'location', category: 'identity', confidence: 0.4 },
  { regex: /我(?:喜欢|爱|偏好)\s*([^\s，。！？、,.!?\n]{1,30}?)(?:，|。|,|\.|\s|$)/g, key: 'preference_general', category: 'preference', confidence: 0.5 },
];

class ExtractionEngine {
  /**
   * @param {object} modelAdapter - modelAdapter 模块（用于调用LLM）
   */
  constructor(modelAdapter) {
    this._modelAdapter = modelAdapter;
    this._cache = getExtractionCache();
    this._storage = getStorageEngine();
    this._capacityManager = getCapacityManager(this._storage);
  }

  /**
   * 从一对用户消息+AI回复中提取知识。
   *
   * @param {string} userMessage - 用户消息
   * @param {string} aiResponse - AI最终回复
   * @param {object} options
   * @param {object} options.currentProfile - 当前已知画像（避免重复提取）
   * @param {string} options.currentProject - 当前项目路径
   * @param {string} options.model - 使用的模型ID（默认 deepseek-chat）
   * @returns {Promise<object|null>} 提取结果，失败时返回null
   */
  async extract(userMessage, aiResponse, options = {}) {
    // 跳过太短的消息（纯问候等）
    if (this._shouldSkip(userMessage, aiResponse)) {
      return null;
    }

    // 检查缓存
    const cached = this._cache.getCached(userMessage, aiResponse);
    if (cached) return cached;

    // 去抖批处理
    return this._cache.debouncedExtract(userMessage, aiResponse, async (pairs) => {
      return this._extractBatch(pairs, options);
    });
  }

  /**
   * 批量提取（被debouncedExtract回调调用）
   */
  async _extractBatch(pairs, options) {
    // 检查token预算
    if (this._cache.isOverBudget()) {
      console.warn('ExtractionEngine: 超出每日token预算，使用降级提取');
      return this._fallbackExtract(pairs);
    }

    try {
      const result = await this._callLLM(pairs, options);
      if (result) {
        // 将提取结果写入存储
        this._applyExtraction(result, pairs);
        return result;
      }
    } catch (e) {
      console.warn('ExtractionEngine: LLM提取失败，使用降级提取:', e.message);
    }

    // 降级
    return this._fallbackExtract(pairs);
  }

  /**
   * 调用LLM执行提取
   */
  async _callLLM(pairs, options) {
    const currentProfile = options.currentProfile || {};
    // 从存储引擎获取现有画像作为上下文
    const profileEntities = this._storage.queryEntities({ type: 'profile_fact', minConfidence: 0.4 });
    const profileMap = {};
    for (const e of profileEntities.slice(0, 30)) {
      if (e.key && e.value) profileMap[e.key] = e.value;
    }

    const systemPrompt = buildExtractionSystemPrompt({
      currentProfile: Object.keys(profileMap).length > 0 ? profileMap : currentProfile,
      currentProject: options.currentProject || '',
    });

    const userMessage = pairs.length === 1
      ? buildExtractionUserMessage(pairs[0])
      : buildBatchExtractionMessage(pairs);

    const schema = buildExtractionSchema();
    const model = options.model || this._getCurrentModel();

    // 使用 tool calling 实现结构化输出
    const tools = [{
      name: 'extract_knowledge',
      description: '从对话中提取结构化知识',
      input_schema: schema,
    }];

    const { sendModelRequest } = this._modelAdapter;
    const response = await sendModelRequest({
      model,
      messages: [{ role: 'user', content: userMessage }],
      systemPrompt,
      tools,
      maxTokens: 2048,
      temperature: 0.3, // 低温度保证一致性
    });

    // 估算token用量并跟踪
    const estimatedTokens = (systemPrompt.length + userMessage.length) / 3;
    this._cache.trackTokenUsage(estimatedTokens);

    if (response.error) {
      throw new Error(`LLM调用失败: ${response.error}`);
    }

    // 尝试从 tool_use 或文本中解析JSON
    const extracted = this._parseResponse(response);
    return extracted;
  }

  /**
   * 从LLM响应中解析提取结果（支持 tool_use 和纯文本JSON两种格式）
   */
  _parseResponse(response) {
    // 优先从 tool_use 中获取
    if (response.toolUses?.length > 0) {
      const toolUse = response.toolUses[0];
      if (toolUse.input) {
        return this._validateAndNormalize(toolUse.input);
      }
    }

    // 从文本中提取JSON
    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return this._validateAndNormalize(parsed);
      } catch {}
    }

    return null;
  }

  /**
   * 验证并规范化提取结果
   */
  _validateAndNormalize(raw) {
    const normalized = {
      profile_updates: [],
      memories: [],
      lessons: [],
      psychological_observations: [],
      project_updates: [],
      conversation_summary: { summary: '', sentiment: 'neutral' },
    };

    // 规范化各字段
    if (Array.isArray(raw.profile_updates)) {
      normalized.profile_updates = raw.profile_updates
        .filter(p => p.key && p.value && this._isMeaningfulValue(p.value))
        // cc_perception 额外验证：值必须是实质性评价，不是问候语
        .filter(p => {
          if (p.category === 'cc_perception') {
            return this._isMeaningfulValue(p.value);
          }
          return true;
        })
        .map(p => ({ ...p, confidence: p.confidence || 0.5 }));
    }

    if (Array.isArray(raw.memories)) {
      normalized.memories = raw.memories
        .filter(m => m.content && this._isMeaningfulValue(m.content));
    }

    if (Array.isArray(raw.lessons)) {
      // 过滤无意义的礼貌用语pattern和过短的pattern
      const trivialPatterns = ['谢谢', '多谢', '感谢', '不客气', '不用谢', '客气了',
        'thanks', 'thank you', 'thankyou'];
      normalized.lessons = raw.lessons.filter(l => {
        if (!l.pattern) return false;
        const clean = l.pattern.trim();
        if (clean.length < 5) return false;
        if (trivialPatterns.some(t => clean.includes(t) && clean.length < 10)) return false;
        return true;
      });
    }

    if (Array.isArray(raw.psychological_observations)) {
      normalized.psychological_observations = raw.psychological_observations
        .filter(p => p.trait && p.confidence >= 0.5);
    }

    if (Array.isArray(raw.project_updates)) {
      normalized.project_updates = raw.project_updates.filter(p => p.entity);
    }

    if (raw.conversation_summary) {
      normalized.conversation_summary = raw.conversation_summary;
    }

    return normalized;
  }

  /**
   * 判断值是否有实际信息量（排除问候语、感叹词等垃圾数据）
   */
  _isMeaningfulValue(value) {
    if (!value || value.trim().length < 1) return false;

    const trimmed = value.trim();

    // 排除纯标点/emoji
    if (/^[\s\p{Emoji}\p{P}]+$/u.test(trimmed)) return false;

    // 去掉标点后检查（处理"嘿，"、"你好！"等变体）
    const stripped = trimmed.replace(/[\s,，、。！？!?.～~]+/g, '');

    // 排除问候语（支持带标点和后缀的变体）
    const greetings = ['你好', '嗨', '嘿', '哈喽', 'hello', 'hi', 'hey', '早上好', '下午好', '晚上好',
      '早安', '午安', '晚安', '再见', '拜拜', 'bye', '88', '回头见', '下次见'];
    for (const g of greetings) {
      if (stripped === g || stripped.startsWith(g + '～') || stripped.startsWith(g + '呀') || stripped.startsWith(g + '啊')) {
        return false;
      }
    }

    // 排除多词拼接的纯问候（"你好 嘿 你好呀" → ["你好","嘿","你好呀"] → 全部是问候 = 排除）
    // 也处理粘连的问候（"嘿你好呀" — strip后无分隔符但由多个问候拼成）
    if (stripped.length < 30 && !/[a-zA-Z]{3,}/.test(stripped)) {
      // 先尝试按空白/标点分词
      let tokens = stripped.split(/[\s,，、。！？]+/).filter(Boolean);
      // 如果只有一个token，尝试将其拆分为已知问候词的组合
      if (tokens.length === 1) {
        let remaining = tokens[0];
        const parts = [];
        const greetingSuffixes = ['呀', '啊', '～', '~', '！', '!', '呢', '嘛', '吧', '哦', '哟'];
        while (remaining.length > 0) {
          let matched = false;
          // 按长度降序匹配
          for (const g of [...greetings].sort((a, b) => b.length - a.length)) {
            if (remaining.startsWith(g)) {
              parts.push(g);
              remaining = remaining.slice(g.length);
              matched = true;
              break;
            }
          }
          if (!matched) {
            // 检查是否只是后缀/语气词
            const ch = remaining[0];
            if (greetingSuffixes.includes(ch)) {
              remaining = remaining.slice(1);
              matched = true;
              continue;
            }
            // 非问候非后缀，保留剩余
            break;
          }
        }
        if (remaining.length === 0) {
          // 全部由问候词和后缀组成 = 无意义
          return false;
        }
        tokens = [remaining]; // 剩余的非问候内容
      }
      if (tokens.length > 0) {
        const allGreetings = tokens.every(t => {
          const clean = t.trim();
          if (!clean) return true;
          for (const g of greetings) {
            if (clean === g || clean.startsWith(g + '～') || clean.startsWith(g + '呀') || clean.startsWith(g + '啊')
                || clean.startsWith(g + '！') || clean.startsWith(g + '!')) {
              return true;
            }
          }
          // 也检查纯标点token
          return /^[\s\p{P}\p{Emoji}]+$/u.test(clean);
        });
        if (allGreetings) return false;
      }
    }

    // 排除纯感叹
    const exclamations = ['太好了', '太棒了', '好厉害', '真棒', '绝了', '6', '666', '牛逼', '牛',
      '哈哈', '嘿嘿', '嘻嘻', '呵呵', '嗯嗯', '哦哦', '对对'];
    if (exclamations.includes(stripped)) return false;

    // 排除纯礼貌用语（单独出现不构成有意义的profile事实）
    const politenessOnly = ['谢谢', '多谢', '感谢', '不客气', '不用谢', '客气了', '哪里哪里',
      'thanks', 'thankyou', 'thank you'];
    if (politenessOnly.includes(stripped)) return false;

    return true;
  }

  /**
   * 判断是否跳过提取（消息太短、无信息量）
   */
  _shouldSkip(userMessage, aiResponse) {
    const combined = (userMessage + aiResponse).trim();
    if (combined.length < 8) return true;

    // 纯问候/道别消息
    const trivialMessages = ['你好', '嗨', '在吗', '再见', '拜拜', '谢谢', '多谢', '好的', 'ok', '嗯', '哦',
      '哈哈', '呵呵', '早', '晚安', 'okay', 'thanks', 'thank you', 'bye'];
    const trimmed = userMessage.trim().toLowerCase();
    if (trivialMessages.includes(trimmed)) return true;

    return false;
  }

  /**
   * 将提取结果写入存储引擎（实体+关系）
   */
  _applyExtraction(result, pairs) {
    if (!result) return;

    const now = Date.now();
    let entityCount = 0;
    const batchEntityIds = []; // 收集本批次写入的真实ID

    // 写入画像更新
    for (const p of result.profile_updates) {
      // 标准化key为英文（防止LLM返回中文key导致重复实体）
      const stdKey = normalizeProfileKey(p.key);
      const id = `profile_${stdKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      this._storage.putEntity(id, {
        type: 'profile_fact',
        category: p.category || 'general',
        key: stdKey,
        value: p.value,
        label: p.label || '',  // LLM提供的中文显示名，未提供则回退到UI字典翻译
        confidence: p.confidence || 0.5,
        evidence: p.evidence || '',
        _updatedAt: now,
      });
      batchEntityIds.push(id);
      entityCount++;

      // 检查是否有现有画像字段被更新，创建 EVOLVED_TO 边
      const existing = this._storage.getEntity(id);
      if (existing && existing.value !== p.value) {
        this._storage.putRelation(`evolve_${id}_${now}`, {
          source: id,
          target: id,
          type: 'EVOLVED_TO',
          previousValue: existing.value,
          newValue: p.value,
          _updatedAt: now,
        });
      }
    }

    // 写入记忆
    for (const m of result.memories) {
      const id = `mem_${now}_${entityCount}`;
      this._storage.putEntity(id, {
        type: 'memory',
        content: m.content,
        level: m.importance === 'high' ? 'hot' : (m.importance === 'medium' ? 'warm' : 'cold'),
        importance: m.importance === 'high' ? 9 : (m.importance === 'medium' ? 5 : 2),
        memoryType: m.type || 'fact',
        mentions: 1,
        source: 'llm_extraction',
        createdAt: now,
        expiresAt: m.expires_at ? new Date(m.expires_at).getTime() : null,
        _updatedAt: now,
      });
      batchEntityIds.push(id);
      entityCount++;

      // 关联到画像实体
      if (m.related_entities?.length) {
        for (const targetId of m.related_entities) {
          if (this._storage.getEntity(targetId)) {
            this._storage.putRelation(`rel_${id}_${targetId}`, {
              source: id,
              target: targetId,
              type: 'SUPPORTS',
              _updatedAt: now,
            });
          }
        }
      }
    }

    // 写入经验教训
    for (const l of result.lessons) {
      const id = `lesson_${now}_${entityCount}`;
      this._storage.putEntity(id, {
        type: 'lesson',
        category: l.category || 'general',
        context: l.pattern,
        approach: '',
        result: l.type === 'negative_feedback' ? '需要改进' : '保持此做法',
        isMistake: l.type === 'negative_feedback',
        createdAt: now,
        _updatedAt: now,
      });
      batchEntityIds.push(id);
      entityCount++;
    }

    // 写入心理观察
    for (const p of result.psychological_observations) {
      const id = `psych_${p.dimension}_${now}_${entityCount}`;
      this._storage.putEntity(id, {
        type: 'psych_observation',
        dimension: p.dimension,
        trait: p.trait,
        confidence: p.confidence || 0.5,
        evidence: p.evidence || '',
        _updatedAt: now,
      });
      batchEntityIds.push(id);
      entityCount++;
    }

    // 写入项目更新
    for (const p of result.project_updates) {
      const sanitized = p.entity.replace(/[^a-zA-Z0-9一-鿿_./-]/g, '_');
      const id = `proj_${sanitized}_${now}`;
      this._storage.putEntity(id, {
        type: 'project_entity',
        entity: p.entity,
        relationship: p.relationship,
        context: p.context || '',
        _updatedAt: now,
      });
      batchEntityIds.push(id);
      entityCount++;
    }

    // 为本批次实体创建关联边（精选少量边，避免"毛线球"）
    if (batchEntityIds.length > 1) {
      const memIds = batchEntityIds.filter(id => id.startsWith('mem_'));
      const profileIdsInBatch = batchEntityIds.filter(id => id.startsWith('profile_'));
      const psychIds = batchEntityIds.filter(id => id.startsWith('psych_'));
      const lessonIds = batchEntityIds.filter(id => id.startsWith('lesson_'));

      // 每条记忆 → 1个最相关的画像事实
      for (let mi = 0; mi < memIds.length; mi++) {
        if (profileIdsInBatch.length > 0) {
          const pi = mi % profileIdsInBatch.length;
          this._storage.putRelation(`sup_${memIds[mi]}_${profileIdsInBatch[pi]}`, {
            source: memIds[mi],
            target: profileIdsInBatch[pi],
            type: 'SUPPORTS',
            _updatedAt: now,
          });
        }
      }

      // 每个心理观察 → 1条记忆
      for (let si = 0; si < psychIds.length && memIds.length > 0; si++) {
        const mi = si % memIds.length;
        this._storage.putRelation(`rel_${psychIds[si]}_${memIds[mi]}`, {
          source: psychIds[si],
          target: memIds[mi],
          type: 'RELATED_TO',
          _updatedAt: now,
        });
      }

      // 每个教训 → 1条记忆
      for (let li = 0; li < lessonIds.length && memIds.length > 0; li++) {
        const mi = li % memIds.length;
        this._storage.putRelation(`rel_${lessonIds[li]}_${memIds[mi]}`, {
          source: lessonIds[li],
          target: memIds[mi],
          type: 'RELATED_TO',
          _updatedAt: now,
        });
      }
    }

    // 存储原始对话观察（用于后续重新分析）
    for (const pair of pairs) {
      this._storage.appendRawObservation({
        userMsg: pair.userMessage.slice(0, 500),
        aiResp: pair.aiResponse.slice(0, 1000),
        timestamp: now,
      });
    }

    // 写入前检查容量
    const capacityGuard = this._capacityManager.beforeWrite();
    if (!capacityGuard.allowed) {
      this._capacityManager.evict();
    }

    // 持久化
    const persisted = this._storage.tryPersist();
    if (!persisted) {
      this._capacityManager.compact();
      this._storage.tryPersist();
    }
  }

  /**
   * 降级提取：当LLM不可用时使用最小正则匹配
   */
  _fallbackExtract(pairs) {
    const result = {
      profile_updates: [],
      memories: [],
      lessons: [],
      psychological_observations: [],
      project_updates: [],
      conversation_summary: { summary: '', sentiment: 'neutral' },
      _fallback: true,
    };

    for (const pair of pairs) {
      const text = pair.userMessage;

      for (const pattern of FALLBACK_PATTERNS) {
        pattern.regex.lastIndex = 0;
        let match;
        while ((match = pattern.regex.exec(text)) !== null) {
          const value = match[1].trim();
          if (this._isMeaningfulValue(value)) {
            result.profile_updates.push({
              key: pattern.key,
              value,
              confidence: pattern.confidence,
              evidence: match[0],
              category: pattern.category,
            });
          }
        }
        pattern.regex.lastIndex = 0; // 重置
      }
    }

    // 降级提取也写入存储
    if (result.profile_updates.length > 0) {
      this._applyExtraction(result, pairs);
    }

    return result;
  }

  /** 获取当前模型 */
  _getCurrentModel() {
    try {
      return localStorage.getItem('cc_current_model') || 'deepseek-chat';
    } catch {
      return 'deepseek-chat';
    }
  }

  /** 获取缓存统计 */
  getStats() {
    return this._cache.getStats();
  }
}

/** 单例 */
let _instance = null;

export function getExtractionEngine(modelAdapter) {
  if (!_instance && modelAdapter) {
    _instance = new ExtractionEngine(modelAdapter);
  }
  return _instance;
}

/** @internal 测试用：重置单例 */
export function _resetExtractionEngineForTest() {
  _instance = null;
}

export { ExtractionEngine };
export default ExtractionEngine;
