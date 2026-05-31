/**
 * ProfileModel — 多维度用户画像模型。
 *
 * 替代 userProfile.js 的扁平 key-value 结构，
 * 提供 identity / psychological / preferences / interests 四维画像，
 * 每个维度带置信度和证据计数。
 */

import { getStorageEngine } from '../storage/StorageEngine.js';
import { getKnowledgeGraph } from '../graph/KnowledgeGraph.js';
import { NODE_TYPES } from '../graph/NodeTypes.js';

/**
 * 画像维度定义
 */
export const PROFILE_DIMENSIONS = {
  identity: {
    label: '身份信息',
    fields: ['name', 'preferred_name', 'gender', 'birthday', 'location', 'occupation', 'organization'],
  },
  psychological: {
    label: '心理画像',
    subDimensions: {
      communication_style: {
        label: '沟通风格',
        traits: ['verbosity', 'directness', 'formality', 'use_of_emoji', 'question_style'],
      },
      emotional_patterns: {
        label: '情绪模式',
        traits: ['stress_triggers', 'positive_triggers', 'emotional_expressiveness', 'dominant_emotions'],
      },
      cognitive_style: {
        label: '认知风格',
        traits: ['thinking', 'detail_orientation', 'learning_preference'],
      },
      motivation: {
        label: '动机与目标',
        traits: ['short_term_goals', 'long_term_aspirations', 'professional_domain', 'values_signaled'],
      },
      wellbeing: {
        label: '健康关注',
        traits: ['concerns_mentioned', 'opt_in_wellness_prompts'],
      },
    },
  },
  preferences: {
    label: '偏好设置',
    subDimensions: {
      explicit: { label: '明确偏好' },
      implicit: { label: '行为推断' },
      cc_interaction: {
        label: 'CC交互偏好',
        traits: ['response_length', 'technical_depth', 'humor_tolerance', 'initiative_level'],
      },
    },
  },
  interests: {
    label: '兴趣领域',
    fields: ['domains', 'technical_skills', 'hobbies'],
  },
};

class ProfileModel {
  constructor(storage, graph) {
    this._storage = storage || getStorageEngine();
    this._graph = graph || getKnowledgeGraph(this._storage);
  }

  /* ---------- 身份信息 ---------- */

  /** 获取所有身份字段 */
  getIdentity() {
    const facts = this._storage.queryEntities({
      type: NODE_TYPES.PROFILE_FACT,
      category: 'identity',
      minConfidence: 0.3,
    });

    const identity = {};
    for (const fact of facts) {
      identity[fact.key] = {
        value: fact.value,
        label: fact.label || '',
        confidence: fact.confidence || 0.5,
        evidence: fact.evidence || '',
      };
    }
    return identity;
  }

  /** 获取单个身份字段 */
  getIdentityField(key) {
    const fact = this._storage.getEntity(`profile_${key}`);
    if (fact && fact.type === NODE_TYPES.PROFILE_FACT) {
      return {
        value: fact.value,
        confidence: fact.confidence || 0.5,
        evidence: fact.evidence || '',
      };
    }
    return null;
  }

  /* ---------- 心理画像 ---------- */

  /** 获取心理画像摘要 */
  getPsychologicalProfile() {
    const observations = this._storage.queryEntities({
      type: NODE_TYPES.PSYCH_OBSERVATION,
      minConfidence: 0.4,
    });

    const profile = {};
    for (const obs of observations) {
      const dim = obs.dimension || 'unknown';
      if (!profile[dim]) profile[dim] = [];

      profile[dim].push({
        trait: obs.trait,
        confidence: obs.confidence,
        evidence: obs.evidence,
        evidenceCount: obs._evidenceCount || 1,
        lastUpdated: obs._updatedAt,
      });
    }

    // 每个维度按置信度排序
    for (const dim of Object.keys(profile)) {
      profile[dim].sort((a, b) => b.confidence - a.confidence);
    }

    return profile;
  }

  /** 获取沟通风格摘要 */
  getCommunicationStyle() {
    const obs = this._storage.queryEntities({
      type: NODE_TYPES.PSYCH_OBSERVATION,
      minConfidence: 0.4,
    }).filter(o => o.dimension === 'communication_style');

    if (obs.length === 0) return null;

    const style = {};
    for (const o of obs) {
      style[o.trait] = {
        confidence: o.confidence,
        evidence: o.evidence,
        evidenceCount: o._evidenceCount || 1,
      };
    }
    return style;
  }

  /* ---------- 偏好 ---------- */

  /** 获取所有偏好 */
  getPreferences() {
    return this._storage.queryEntities({
      type: NODE_TYPES.PROFILE_FACT,
      category: 'preference',
      minConfidence: 0.3,
    }).map(f => ({
      key: f.key,
      value: f.value,
      label: f.label || '',
      confidence: f.confidence,
      evidence: f.evidence,
    }));
  }

  /** 获取CC交互偏好 */
  getCCInteractionPreferences() {
    const prefs = this._storage.queryEntities({
      type: NODE_TYPES.PROFILE_FACT,
      category: 'preference',
    }).filter(f =>
      f.key.startsWith('prefer_') ||
      f.key.startsWith('cc_') ||
      f.key.includes('response') ||
      f.key.includes('reply') ||
      f.key.includes('detail') ||
      f.key.includes('humor') ||
      f.key.includes('technical')
    );

    const result = {};
    for (const p of prefs) {
      result[p.key] = {
        value: p.value,
        confidence: p.confidence || 0.5,
        evidence: p.evidence || '',
      };
    }
    return result;
  }

  /* ---------- 兴趣 ---------- */

  /** 获取兴趣域 */
  getInterests() {
    return this._storage.queryEntities({
      type: NODE_TYPES.PROFILE_FACT,
      category: 'interest',
    }).map(f => ({
      name: f.value,
      label: f.label || '',
      key: f.key || '',
      confidence: f.confidence,
      evidence: f.evidence,
    })).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  }

  /** 获取技能 */
  getSkills() {
    return this._storage.queryEntities({
      type: NODE_TYPES.PROFILE_FACT,
      category: 'skill',
      minConfidence: 0.4,
    }).map(f => ({
      name: f.value,
      label: f.label || '',
      key: f.key || '',
      confidence: f.confidence,
      evidence: f.evidence,
    }));
  }

  /* ---------- 画像DASHBOARD（用于UI展示） ---------- */

  /** 构建完整的画像仪表板数据 */
  getDashboard() {
    const identity = this.getIdentity();
    const psych = this.getPsychologicalProfile();
    const preferences = this.getPreferences();
    const interests = this.getInterests();
    const skills = this.getSkills();

    // 计算整体信心分
    let overallConfidence = 0;
    let confidenceItems = 0;
    for (const [, v] of Object.entries(identity)) {
      overallConfidence += v.confidence || 0;
      confidenceItems++;
    }
    for (const [, obsList] of Object.entries(psych)) {
      for (const obs of obsList) {
        overallConfidence += obs.confidence || 0;
        confidenceItems++;
      }
    }
    const avgConfidence = confidenceItems > 0
      ? (overallConfidence / confidenceItems * 100).toFixed(0)
      : 0;

    // 心理观察计数
    let psychObsCount = 0;
    for (const [, obsList] of Object.entries(psych)) {
      psychObsCount += obsList.length;
    }
    // 高置信度身份字段 (confidence >= 0.8)
    const highConfFields = Object.values(identity).filter(v => v.confidence >= 0.8).length;
    // 画像事实总数（仅统计profile_fact类型）
    const totalFacts = this._storage.countEntities(NODE_TYPES.PROFILE_FACT);

    return {
      identity,
      psychological: psych,
      preferences,
      interests,
      skills,
      stats: {
        totalFacts,
        psychObservations: psychObsCount,
        highConfidenceFields: highConfFields,
        averageConfidence: avgConfidence,
        lastUpdated: this._getLastUpdated(),
        dimensionsCovered: Object.keys(psych).length,
      },
    };
  }

  /* ---------- 提示词注入 ---------- */

  /**
   * 构建注入LLM上下文的画像文本。
   * 仅包含 confidence >= threshold 的字段。
   */
  getPromptSection(threshold = 0.6) {
    const dashboard = this.getDashboard();
    const sections = [];

    // 身份信息
    const identityParts = [];
    for (const [key, info] of Object.entries(dashboard.identity)) {
      if (info.confidence >= threshold) {
        identityParts.push(`${key}: ${info.value}`);
      }
    }
    if (identityParts.length > 0) {
      sections.push('## 用户画像\n' + identityParts.map(p => `- ${p}`).join('\n'));
    }

    // 心理画像（仅高置信度摘要）
    const psychParts = [];
    for (const [dim, obsList] of Object.entries(dashboard.psychological)) {
      const highConf = obsList.filter(o => o.confidence >= threshold);
      if (highConf.length > 0) {
        const dimLabel = PROFILE_DIMENSIONS.psychological.subDimensions[dim]?.label || dim;
        psychParts.push(`### ${dimLabel}`);
        for (const obs of highConf.slice(0, 3)) { // 每维度最多3条
          psychParts.push(`- ${obs.trait} (置信度:${(obs.confidence * 100).toFixed(0)}%)`);
        }
      }
    }
    if (psychParts.length > 0) {
      sections.push('## 用户心理特征\n' + psychParts.join('\n'));
    }

    // 偏好
    const prefParts = [];
    for (const p of dashboard.preferences) {
      if (p.confidence >= threshold) {
        prefParts.push(`- 偏好: ${p.key.replace('prefer_', '').replace(/_/g, ' ')} → ${p.value}`);
      }
    }
    if (prefParts.length > 0) {
      sections.push('## 用户偏好\n' + prefParts.join('\n'));
    }

    // 兴趣和技能
    const interestParts = [];
    if (dashboard.interests.length > 0) {
      interestParts.push('兴趣领域: ' + dashboard.interests.slice(0, 5).map(i => i.name).join('、'));
    }
    if (dashboard.skills.length > 0) {
      interestParts.push('技能: ' + dashboard.skills.slice(0, 5).map(s => s.name).join('、'));
    }
    if (interestParts.length > 0) {
      sections.push('## 用户兴趣与技能\n' + interestParts.map(p => `- ${p}`).join('\n'));
    }

    return sections.join('\n\n');
  }

  /** 最后更新时间 */
  _getLastUpdated() {
    const entities = this._storage.queryEntities();
    let latest = 0;
    for (const e of entities) {
      const t = e._updatedAt || 0;
      if (t > latest) latest = t;
    }
    return latest;
  }
}

/** 单例 */
let _instance = null;

export function getProfileModel(storage, graph) {
  if (!_instance) {
    _instance = new ProfileModel(storage, graph);
  }
  return _instance;
}

/** @internal 测试用：重置单例 */
export function _resetProfileModelForTest() {
  _instance = null;
}

export { ProfileModel };
export default ProfileModel;
