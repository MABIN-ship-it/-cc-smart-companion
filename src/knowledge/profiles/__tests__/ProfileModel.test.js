import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileModel } from '../ProfileModel.js';
import { getStorageEngine } from '../../storage/StorageEngine.js';
import { NODE_TYPES } from '../../graph/NodeTypes.js';

describe('ProfileModel', () => {
  let model;
  let storage;

  beforeEach(() => {
    localStorage.clear();
    storage = getStorageEngine();
    storage.clearAll();
    model = new ProfileModel(storage);
  });

  describe('getIdentity', () => {
    it('返回空对象如果无身份数据', () => {
      const identity = model.getIdentity();
      expect(typeof identity).toBe('object');
      expect(Object.keys(identity).length).toBe(0);
    });

    it('返回过滤后的身份字段', () => {
      storage.putEntity('profile_name', {
        type: NODE_TYPES.PROFILE_FACT,
        category: 'identity',
        key: 'name',
        value: '张三',
        confidence: 0.95,
        evidence: '我叫张三',
      });

      storage.putEntity('profile_location', {
        type: NODE_TYPES.PROFILE_FACT,
        category: 'identity',
        key: 'location',
        value: '北京',
        confidence: 0.7,
        evidence: '我在北京',
      });

      // 这个不属于 identity 类别
      storage.putEntity('profile_skill', {
        type: NODE_TYPES.PROFILE_FACT,
        category: 'skill',
        key: 'skill',
        value: 'Python',
        confidence: 0.9,
      });

      const identity = model.getIdentity();
      expect(Object.keys(identity).length).toBe(2);
      expect(identity['name'].value).toBe('张三');
      expect(identity['name'].confidence).toBe(0.95);
      expect(identity['location'].value).toBe('北京');
    });

    it('过滤低置信度字段', () => {
      storage.putEntity('profile_name', {
        type: NODE_TYPES.PROFILE_FACT,
        category: 'identity',
        key: 'name',
        value: '不确定的名字',
        confidence: 0.2,
      });

      const identity = model.getIdentity();
      expect(Object.keys(identity).length).toBe(0);
    });
  });

  describe('getIdentityField', () => {
    it('获取单个字段', () => {
      storage.putEntity('profile_name', {
        type: NODE_TYPES.PROFILE_FACT,
        key: 'name',
        value: '李四',
        confidence: 0.9,
      });

      const field = model.getIdentityField('name');
      expect(field).toBeTruthy();
      expect(field.value).toBe('李四');
    });

    it('不存在的字段返回null', () => {
      expect(model.getIdentityField('unknown')).toBeNull();
    });
  });

  describe('getPsychologicalProfile', () => {
    it('返回按维度分组的心理观察', () => {
      storage.putEntity('psych_1', {
        type: NODE_TYPES.PSYCH_OBSERVATION,
        dimension: 'communication_style',
        trait: '简洁直接',
        confidence: 0.8,
        evidence: '用户多次说"别啰嗦"',
      });

      storage.putEntity('psych_2', {
        type: NODE_TYPES.PSYCH_OBSERVATION,
        dimension: 'communication_style',
        trait: '不喜欢emoji',
        confidence: 0.5,
        evidence: '从未使用emoji',
      });

      storage.putEntity('psych_3', {
        type: NODE_TYPES.PSYCH_OBSERVATION,
        dimension: 'cognitive_style',
        trait: '系统性思考',
        confidence: 0.7,
        evidence: '逐步分析问题',
      });

      const psych = model.getPsychologicalProfile();
      expect(psych['communication_style']).toBeTruthy();
      expect(psych['communication_style'].length).toBe(2);
      expect(psych['cognitive_style']).toBeTruthy();
      expect(psych['cognitive_style'].length).toBe(1);
    });

    it('过滤低置信度观察', () => {
      storage.putEntity('psych_low', {
        type: NODE_TYPES.PSYCH_OBSERVATION,
        dimension: 'emotional_pattern',
        trait: '疑似焦虑',
        confidence: 0.3,
      });

      const psych = model.getPsychologicalProfile();
      expect(psych['emotional_pattern']).toBeFalsy();
    });
  });

  describe('getPreferences', () => {
    it('返回所有偏好', () => {
      storage.putEntity('pref_1', {
        type: NODE_TYPES.PROFILE_FACT,
        category: 'preference',
        key: 'prefer_response_length',
        value: 'short',
        confidence: 0.8,
      });

      const prefs = model.getPreferences();
      expect(prefs.length).toBe(1);
      expect(prefs[0].key).toBe('prefer_response_length');
    });
  });

  describe('getDashboard', () => {
    it('构建完整仪表板数据', () => {
      storage.putEntity('profile_name', {
        type: NODE_TYPES.PROFILE_FACT, category: 'identity',
        key: 'name', value: '王五', confidence: 0.95,
      });
      storage.putEntity('psych_1', {
        type: NODE_TYPES.PSYCH_OBSERVATION,
        dimension: 'communication_style', trait: '偏好详细解释',
        confidence: 0.75,
      });
      storage.putEntity('skill_1', {
        type: NODE_TYPES.PROFILE_FACT, category: 'skill',
        key: 'skill', value: 'JavaScript', confidence: 0.9,
      });

      const dashboard = model.getDashboard();
      expect(dashboard.identity).toBeTruthy();
      expect(dashboard.identity['name'].value).toBe('王五');
      expect(dashboard.psychological['communication_style']).toBeTruthy();
      expect(dashboard.skills.length).toBe(1);
      expect(dashboard.stats.totalFacts).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getPromptSection', () => {
    it('仅包含高置信度字段', () => {
      storage.putEntity('profile_name', {
        type: NODE_TYPES.PROFILE_FACT, category: 'identity',
        key: 'name', value: '赵六', confidence: 0.95,
      });
      storage.putEntity('profile_low', {
        type: NODE_TYPES.PROFILE_FACT, category: 'identity',
        key: 'cc_feeling', value: '你好', confidence: 0.3,
      });

      const prompt = model.getPromptSection(0.6);

      // name >= 0.6 应包含
      expect(prompt).toContain('赵六');

      // cc_feeling 0.3 < 0.6 不应包含
      expect(prompt).not.toContain('你好');
    });

    it('无数据时返回空字符串', () => {
      const prompt = model.getPromptSection();
      expect(prompt).toBe('');
    });
  });
});
