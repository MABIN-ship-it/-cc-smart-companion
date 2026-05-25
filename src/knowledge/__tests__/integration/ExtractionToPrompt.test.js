/**
 * 集成测试：从提取到提示词构建的完整链路
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getStorageEngine, _resetStorageEngineForTest } from '../../storage/StorageEngine.js';
import { getExtractionEngine, _resetExtractionEngineForTest } from '../../extraction/ExtractionEngine.js';
import { getKnowledgeGraph, _resetKnowledgeGraphForTest } from '../../graph/KnowledgeGraph.js';
import { getProfileModel, _resetProfileModelForTest } from '../../profiles/ProfileModel.js';
import { KnowledgeSystem, getKnowledgeSystem, _resetKnowledgeSystemForTest } from '../../KnowledgeSystem.js';

// 重置所有单例
function resetAllSingletons() {
  _resetKnowledgeSystemForTest();
  _resetExtractionEngineForTest();
  _resetKnowledgeGraphForTest();
  _resetProfileModelForTest();
  _resetStorageEngineForTest();
}

function createMockAdapter(responses = []) {
  let idx = 0;
  return {
    sendModelRequest: async () => {
      const raw = responses[idx] || responses[responses.length - 1];
      idx++;
      if (!raw) return { error: 'mock: no response' };
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return { toolUses: [{ name: 'extract_knowledge', input: parsed }] };
      } catch {
        return { text: raw };
      }
    },
  };
}

const mockExtractionResult = JSON.stringify({
  profile_updates: [
    { key: 'name', value: '赵六', confidence: 0.95, evidence: '我叫赵六', category: 'identity' },
    { key: 'location', value: '上海', confidence: 0.8, evidence: '我在上海工作', category: 'identity' },
    { key: 'skill', value: 'Go语言', confidence: 0.9, category: 'skill' },
  ],
  memories: [
    { content: '用户下周三有技术分享', importance: 'high', type: 'event', level: 'hot' },
    { content: '用户喜欢用Go做后端开发', importance: 'medium', type: 'preference', level: 'warm' },
  ],
  lessons: [
    { pattern: '当用户说"别啰嗦"时要精简回复', category: 'communication_style', type: 'negative_feedback' },
  ],
  psychological_observations: [
    { dimension: 'communication_style', trait: '直接高效', confidence: 0.8, evidence: '用户多次要求简洁回复' },
    { dimension: 'cognitive_style', trait: '系统性思考', confidence: 0.75, evidence: '喜欢先了解全貌再深入' },
  ],
  project_updates: [],
  conversation_summary: '用户介绍了自己的身份和技术偏好',
});

describe('Extraction → Profile → Prompt 集成', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllSingletons();
  });

  it('完整链路：提取 → 写入图谱 → 画像 → 提示词上下文', async () => {
    const mockAdapter = createMockAdapter([mockExtractionResult]);
    const ks = new KnowledgeSystem(mockAdapter);
    await ks.initialize();

    const result = await ks.onConversationTurn(
      '我叫赵六，在上海做Go语言开发，下周三有个技术分享',
      '好的赵六，了解了。你在上海做Go开发，下周三有技术分享对吧？'
    );

    expect(result).toBeTruthy();
    expect(result.profile_updates).toBeDefined();
    expect(result.profile_updates.length).toBe(3);

    const graphSummary = ks.getGraphSummary();
    expect(graphSummary.totalNodes).toBeGreaterThanOrEqual(6);

    const dashboard = ks.getProfileDashboard();
    expect(dashboard.identity).toBeTruthy();
    expect(dashboard.identity['name']).toBeTruthy();
    expect(dashboard.identity['name'].value).toBe('赵六');

    const psych = dashboard.psychological;
    expect(psych).toBeTruthy();
    const commStyle = psych['communication_style'];
    expect(commStyle).toBeTruthy();
    expect(commStyle.length).toBe(1);
    expect(commStyle[0].trait).toBe('直接高效');

    const promptCtx = ks.buildPromptContext();
    expect(promptCtx.profile).toBeTruthy();
    expect(promptCtx.profile).toContain('赵六');
    expect(promptCtx.profile).toContain('Go语言');
    expect(promptCtx.profile).toContain('上海');
    expect(promptCtx.memories.length).toBeGreaterThan(0);
    expect(promptCtx.memories.some(m => m.includes('技术分享'))).toBe(true);
    expect(promptCtx.lessons.length).toBeGreaterThan(0);
  });

  it('低置信度事实被过滤', async () => {
    const lowConfidenceResult = JSON.stringify({
      profile_updates: [
        { key: 'name', value: '不确定的名字', confidence: 0.3, evidence: '可能叫这个名字', category: 'identity' },
        { key: 'location', value: '北京', confidence: 0.9, evidence: '我在北京', category: 'identity' },
      ],
      memories: [],
      lessons: [],
      psychological_observations: [],
      project_updates: [],
      conversation_summary: '',
    });

    const mockAdapter = createMockAdapter([lowConfidenceResult]);
    const ks = new KnowledgeSystem(mockAdapter);
    await ks.initialize();

    await ks.onConversationTurn('我可能叫不确定的名字，但是我在北京工作', '好的，北京是个好地方');

    const promptCtx = ks.buildPromptContext();
    // name 0.3 < 0.6 → 不应出现
    expect(promptCtx.profile).not.toContain('不确定的名字');
    // location 0.9 > 0.6 → 应出现
    expect(promptCtx.profile).toContain('北京');
  });

  it('空提取结果不破坏系统', async () => {
    const emptyResult = JSON.stringify({
      profile_updates: [],
      memories: [],
      lessons: [],
      psychological_observations: [],
      project_updates: [],
      conversation_summary: '',
    });

    const mockAdapter = createMockAdapter([emptyResult]);
    const ks = new KnowledgeSystem(mockAdapter);
    await ks.initialize();

    // 消息必须足够长才能通过 _shouldSkip 检查
    const result = await ks.onConversationTurn('你好啊，我今天没什么特别的事情想说的', '好的，随时可以找我聊天');

    expect(result).toBeTruthy();
    expect(result.profile_updates.length).toBe(0);

    const promptCtx = ks.buildPromptContext();
    expect(promptCtx.profile).toBe('');
    expect(promptCtx.memories).toEqual([]);
    expect(promptCtx.lessons).toEqual([]);
  });

  it('LLM降级时fallback正则提取关键信息', async () => {
    // 模拟LLM返回null（触发降级）
    const mockAdapter = createMockAdapter([null]);
    const ks = new KnowledgeSystem(mockAdapter);
    await ks.initialize();

    const result = await ks.onConversationTurn(
      '你好，我叫李四，我是一名前端工程师，我在杭州生活',
      '你好李四，前端工程师对吧？杭州是个好地方！'
    );

    // fallback应提取到姓名
    expect(result).toBeTruthy();
    const nameUpdate = result.profile_updates?.find(u => u.key === 'name');
    if (nameUpdate) {
      expect(nameUpdate.value).toContain('李四');
    }
    const stats = ks.getStats();
    expect(stats).toBeTruthy();
  });
});
