import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExtractionEngine } from '../ExtractionEngine.js';
import { getExtractionCache } from '../ExtractionCache.js';
import { getStorageEngine } from '../../storage/StorageEngine.js';

// Mock modelAdapter
const mockModelAdapter = {
  sendModelRequest: vi.fn(),
};

describe('ExtractionEngine', () => {
  let engine;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // 重置单例
    getExtractionCache().clear();
    const storage = getStorageEngine();
    storage.clearAll();

    engine = new ExtractionEngine(mockModelAdapter);
  });

  describe('_shouldSkip', () => {
    it('跳过纯问候消息', () => {
      expect(engine._shouldSkip('你好', '你好！')).toBe(true);
      expect(engine._shouldSkip('嗨', '嗨～')).toBe(true);
      expect(engine._shouldSkip('在吗', '在的')).toBe(true);
    });

    it('跳过纯道别消息', () => {
      expect(engine._shouldSkip('再见', '再见！')).toBe(true);
      expect(engine._shouldSkip('拜拜', '拜～')).toBe(true);
    });

    it('跳过太短的消息', () => {
      expect(engine._shouldSkip('哦', '嗯')).toBe(true);
      expect(engine._shouldSkip('好', 'ok')).toBe(true);
    });

    it('不跳过长消息', () => {
      expect(engine._shouldSkip('我今天学了Python，感觉很不错', 'Python是一门很棒的编程语言')).toBe(false);
    });

    it('不跳过有信息量的中等消息', () => {
      expect(engine._shouldSkip('帮我看看这个bug', '好的，我来分析一下这段代码')).toBe(false);
    });
  });

  describe('_isMeaningfulValue', () => {
    it('排除问候语', () => {
      expect(engine._isMeaningfulValue('你好')).toBe(false);
      expect(engine._isMeaningfulValue('你好呀～')).toBe(false);
      expect(engine._isMeaningfulValue('嘿～你好呀！')).toBe(false);
      expect(engine._isMeaningfulValue('早安呀～😊')).toBe(false);
    });

    it('排除纯感叹', () => {
      expect(engine._isMeaningfulValue('哈哈')).toBe(false);
      expect(engine._isMeaningfulValue('太好了')).toBe(false);
      expect(engine._isMeaningfulValue('嘿嘿')).toBe(false);
    });

    it('排除纯标点/emoji', () => {
      expect(engine._isMeaningfulValue('😂😂😂')).toBe(false);
      expect(engine._isMeaningfulValue('！！！')).toBe(false);
    });

    it('接受有意义的值', () => {
      expect(engine._isMeaningfulValue('张三')).toBe(true);
      expect(engine._isMeaningfulValue('Python')).toBe(true);
      expect(engine._isMeaningfulValue('3年经验的前端工程师')).toBe(true);
      expect(engine._isMeaningfulValue('喜欢详细解释')).toBe(true);
    });

    it('排除空值和纯空格', () => {
      expect(engine._isMeaningfulValue('')).toBe(false);
      expect(engine._isMeaningfulValue('  ')).toBe(false);
      expect(engine._isMeaningfulValue(null)).toBe(false);
    });
  });

  describe('_validateAndNormalize', () => {
    it('规范化完整提取结果', () => {
      const raw = {
        profile_updates: [
          { key: 'name', value: '张三', confidence: 0.95, evidence: '我叫张三', category: 'identity' },
        ],
        memories: [
          { content: '用户下周三有项目汇报', importance: 'high', type: 'event' },
        ],
        lessons: [
          { pattern: '用户喜欢简短回答', category: 'communication_style', type: 'negative_feedback' },
        ],
        psychological_observations: [
          { dimension: 'communication_style', trait: '简洁直接', confidence: 0.7, evidence: '多次要求简短回答' },
        ],
        project_updates: [
          { entity: 'src/login.ts', relationship: 'discussed', context: '讨论登录逻辑' },
        ],
        conversation_summary: { summary: '项目汇报安排', sentiment: 'neutral' },
      };

      const result = engine._validateAndNormalize(raw);
      expect(result.profile_updates.length).toBe(1);
      expect(result.memories.length).toBe(1);
      expect(result.lessons.length).toBe(1);
      expect(result.psychological_observations.length).toBe(1);
      expect(result.project_updates.length).toBe(1);
      expect(result.conversation_summary.summary).toBe('项目汇报安排');
    });

    it('过滤掉无意义的画像更新', () => {
      const raw = {
        profile_updates: [
          { key: 'name', value: '你好', confidence: 0.3, evidence: '你好', category: 'identity' },
          { key: 'skill', value: 'Python', confidence: 0.9, evidence: '我用Python写', category: 'skill' },
        ],
        memories: [],
        lessons: [],
        psychological_observations: [],
        project_updates: [],
        conversation_summary: { summary: '', sentiment: 'neutral' },
      };

      const result = engine._validateAndNormalize(raw);
      // "你好"应被过滤，"Python"应保留
      expect(result.profile_updates.length).toBe(1);
      expect(result.profile_updates[0].value).toBe('Python');
    });

    it('过滤低置信度的心理观察', () => {
      const raw = {
        profile_updates: [],
        memories: [],
        lessons: [],
        psychological_observations: [
          { dimension: 'communication_style', trait: '偏好emoji', confidence: 0.3, evidence: '用了emoji' },
          { dimension: 'cognitive_style', trait: '系统性思考', confidence: 0.8, evidence: '逐步分析' },
        ],
        project_updates: [],
        conversation_summary: { summary: '', sentiment: 'neutral' },
      };

      const result = engine._validateAndNormalize(raw);
      expect(result.psychological_observations.length).toBe(1);
      expect(result.psychological_observations[0].trait).toBe('系统性思考');
    });

    it('处理空字段的回退', () => {
      const raw = {};
      const result = engine._validateAndNormalize(raw);
      expect(result.profile_updates).toEqual([]);
      expect(result.memories).toEqual([]);
      expect(result.conversation_summary.sentiment).toBe('neutral');
    });
  });

  describe('_fallbackExtract', () => {
    it('降级提取姓名', () => {
      const pairs = [{ userMessage: '你好，我叫张三，很高兴认识你', aiResponse: '你好张三！' }];
      const result = engine._fallbackExtract(pairs);
      expect(result._fallback).toBe(true);
      expect(result.profile_updates.some(p => p.key === 'name' && p.value === '张三')).toBe(true);
    });

    it('降级提取职业', () => {
      const pairs = [{ userMessage: '我是前端工程师', aiResponse: '好的' }];
      const result = engine._fallbackExtract(pairs);
      expect(result.profile_updates.some(p => p.key === 'occupation' && p.value.includes('前端'))).toBe(true);
    });

    it('降级提取不记录"你好"为姓名', () => {
      const pairs = [{ userMessage: '你好你好！', aiResponse: '你好呀～' }];
      const result = engine._fallbackExtract(pairs);
      // 正则"我叫"不会匹配"你好"
      const nameUpdates = result.profile_updates.filter(p => p.key === 'name');
      expect(nameUpdates.length).toBe(0);
    });
  });

  describe('_applyExtraction', () => {
    it('将提取结果写入StorageEngine', () => {
      const result = {
        profile_updates: [
          { key: 'name', value: '张三', confidence: 0.95, evidence: '我叫张三', category: 'identity' },
          { key: 'skill', value: 'Python', confidence: 0.9, evidence: '我用Python', category: 'skill' },
        ],
        memories: [
          { content: '用户下周三有项目汇报', importance: 'high', type: 'event' },
        ],
        lessons: [
          { pattern: '用户喜欢简短回答', category: 'communication_style', type: 'negative_feedback' },
        ],
        psychological_observations: [],
        project_updates: [],
        conversation_summary: { summary: '测试', sentiment: 'neutral' },
      };

      engine._applyExtraction(result, [{ userMessage: '测试', aiResponse: '测试' }]);

      const storage = getStorageEngine();
      const profileFacts = storage.queryEntities({ type: 'profile_fact' });
      const memories = storage.queryEntities({ type: 'memory' });
      const lessons = storage.queryEntities({ type: 'lesson' });

      expect(profileFacts.length).toBeGreaterThanOrEqual(2);
      expect(memories.length).toBeGreaterThanOrEqual(1);
      expect(lessons.length).toBeGreaterThanOrEqual(1);

      // 验证画像事实
      const nameFact = profileFacts.find(p => p.key === 'name');
      expect(nameFact).toBeTruthy();
      expect(nameFact.value).toBe('张三');
      expect(nameFact.confidence).toBe(0.95);
    });

    it('写入原始观察到环形缓冲', () => {
      const result = {
        profile_updates: [],
        memories: [],
        lessons: [],
        psychological_observations: [],
        project_updates: [],
        conversation_summary: { summary: '', sentiment: 'neutral' },
      };

      engine._applyExtraction(result, [{ userMessage: '测试消息', aiResponse: '测试回复' }]);

      const storage = getStorageEngine();
      const observations = storage.getRawObservations();
      expect(observations.length).toBeGreaterThanOrEqual(1);
      expect(observations[observations.length - 1].userMsg).toBe('测试消息');
    });
  });

  describe('extract with LLM', () => {
    it('成功提取时返回结构化结果', async () => {
      const mockResult = {
        error: null,
        text: '',
        toolUses: [{
          id: 'tool_1',
          name: 'extract_knowledge',
          input: {
            profile_updates: [
              { key: 'name', value: '李四', confidence: 0.95, evidence: '我叫李四', category: 'identity' },
            ],
            memories: [],
            lessons: [],
            psychological_observations: [],
            project_updates: [],
            conversation_summary: { summary: '自我介绍', sentiment: 'neutral' },
          },
        }],
      };

      mockModelAdapter.sendModelRequest.mockResolvedValueOnce(mockResult);

      const result = await engine.extract('我叫李四', '你好李四！');

      expect(result).toBeTruthy();
      expect(result.profile_updates.length).toBe(1);
      expect(result.profile_updates[0].value).toBe('李四');
      expect(mockModelAdapter.sendModelRequest).toHaveBeenCalledTimes(1);
    });

    it('LLM失败时降级到正则提取', async () => {
      mockModelAdapter.sendModelRequest.mockRejectedValueOnce(new Error('API error'));

      const result = await engine.extract('我叫王五，很高兴认识你', '你好王五！');

      // 降级提取应该通过正则捕获到名字
      expect(result).toBeTruthy();
      if (result._fallback) {
        expect(result.profile_updates.some(p => p.key === 'name')).toBe(true);
      }
    });
  });
});
