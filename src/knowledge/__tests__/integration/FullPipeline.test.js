/**
 * 端到端集成测试：完整知识系统管道
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getStorageEngine, _resetStorageEngineForTest } from '../../storage/StorageEngine.js';
import { _resetExtractionEngineForTest } from '../../extraction/ExtractionEngine.js';
import { _resetKnowledgeGraphForTest } from '../../graph/KnowledgeGraph.js';
import { _resetProfileModelForTest } from '../../profiles/ProfileModel.js';
import { KnowledgeSystem, _resetKnowledgeSystemForTest } from '../../KnowledgeSystem.js';
import { NODE_TYPES } from '../../graph/NodeTypes.js';

function resetAllSingletons() {
  _resetKnowledgeSystemForTest();
  _resetExtractionEngineForTest();
  _resetKnowledgeGraphForTest();
  _resetProfileModelForTest();
  _resetStorageEngineForTest();
}

function createMockAdapter(responses) {
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

const turn1 = JSON.stringify({
  profile_updates: [
    { key: 'name', value: '王五', confidence: 0.95, evidence: '我叫王五', category: 'identity' },
    { key: 'occupation', value: '后端开发', confidence: 0.9, evidence: '我是后端开发', category: 'identity' },
  ],
  memories: [
    { content: '用户在做微服务项目', importance: 'high', type: 'project', level: 'hot' },
    { content: '使用Go和Python', importance: 'medium', type: 'skill', level: 'warm' },
  ],
  lessons: [],
  psychological_observations: [
    { dimension: 'communication_style', trait: '直接提出问题', confidence: 0.7, evidence: '直接说需求' },
  ],
  project_updates: [],
  conversation_summary: '用户介绍了自己的技术背景和当前项目',
});

const turn2 = JSON.stringify({
  profile_updates: [
    { key: 'prefer_response_length', value: 'short', confidence: 0.85, evidence: '用户说"简短的就行"', category: 'preference' },
    { key: 'cc_interaction_style', value: '不喜欢啰嗦', confidence: 0.8, evidence: '多次要求简洁', category: 'cc_perception' },
  ],
  memories: [
    { content: '用户不喜欢长篇大论', importance: 'high', type: 'preference', level: 'hot' },
  ],
  lessons: [
    { pattern: '回复尽量控制在3段以内', category: 'communication_style', type: 'negative_feedback', isMistake: true },
  ],
  psychological_observations: [
    { dimension: 'communication_style', trait: '偏好极致精简', confidence: 0.85, evidence: '明确要求简短' },
  ],
  project_updates: [],
  conversation_summary: '用户表达了对话风格的偏好',
});

const turn3 = JSON.stringify({
  profile_updates: [
    { key: 'location', value: '深圳', confidence: 0.9, evidence: '我刚搬到深圳', category: 'identity' },
    { key: 'occupation', value: '全栈开发', confidence: 0.8, evidence: '我其实也写前端，算全栈吧', category: 'identity' },
  ],
  memories: [
    { content: '用户在考虑迁移到Rust', importance: 'medium', type: 'interest', level: 'warm' },
    { content: '微服务项目即将上线', importance: 'high', type: 'project', level: 'hot' },
  ],
  lessons: [],
  psychological_observations: [
    { dimension: 'cognitive_style', trait: '喜欢尝鲜新技术', confidence: 0.7, evidence: '考虑迁移到Rust' },
  ],
  project_updates: [
    { entity: 'project:微服务重构', relationship: 'discussed', context: '讨论了Rust迁移方案' },
  ],
  conversation_summary: '用户更新了个人信息并讨论技术方向',
});

describe('全管道端到端测试', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllSingletons();
  });

  it('多轮对话 → 画像逐步累积', async () => {
    const mockAdapter = createMockAdapter([turn1, turn2, turn3]);
    const ks = new KnowledgeSystem(mockAdapter);
    await ks.initialize();

    // 第1轮
    await ks.onConversationTurn(
      '我叫王五，是后端开发，在做微服务项目',
      '好的王五，后端微服务开发对吧？'
    );
    let dashboard = ks.getProfileDashboard();
    expect(dashboard.identity['name'].value).toBe('王五');
    expect(dashboard.identity['occupation'].value).toBe('后端开发');

    // 第2轮
    await ks.onConversationTurn(
      '太啰嗦了，以后简短的就行，不要长篇大论',
      '好的，记住了，以后简短回复。'
    );
    dashboard = ks.getProfileDashboard();
    const prefs = dashboard.preferences || [];
    const shortPref = prefs.find(p => p.key === 'prefer_response_length');
    expect(shortPref).toBeTruthy();

    // 第3轮
    await ks.onConversationTurn(
      '我刚搬到深圳生活了，其实我也会写前端，可以算全栈开发吧',
      '深圳不错！全栈开发者很厉害～'
    );
    dashboard = ks.getProfileDashboard();
    expect(dashboard.identity['location'].value).toBe('深圳');

    // 心理画像累积
    const psych = dashboard.psychological;
    expect(psych['communication_style']).toBeTruthy();
    expect(psych['communication_style'].some(t =>
      (t.trait || '').includes('精简') || (t.trait || '').includes('直接')
    )).toBe(true);

    expect(dashboard.stats).toBeTruthy();
    expect(dashboard.stats.totalFacts).toBeGreaterThanOrEqual(3);
  }, 10000);

  it('图谱可视化导出正确', async () => {
    const mockAdapter = createMockAdapter([turn1, turn2]);
    const ks = new KnowledgeSystem(mockAdapter);
    await ks.initialize();

    await ks.onConversationTurn('我叫王五，我是后端开发工程师', '好的，后端开发王五');
    await ks.onConversationTurn('简短的就行，别啰嗦，以后注意', '记住了');

    const vis = ks.getGraphVisualization(100);
    expect(vis.nodes).toBeTruthy();
    expect(vis.edges).toBeTruthy();
    expect(vis.nodes.length).toBeGreaterThan(0);

    for (const n of vis.nodes) {
      expect(n.id).toBeTruthy();
      expect(n.type).toBeTruthy();
      expect(n.display).toBeTruthy();
      expect(n.display.color).toBeTruthy();
    }

    const types = vis.nodes.map(n => n.type);
    expect(types).toContain(NODE_TYPES.PROFILE_FACT);
    expect(types).toContain(NODE_TYPES.MEMORY);
    expect(types).toContain(NODE_TYPES.PSYCH_OBSERVATION);
  }, 10000);

  it('数据导出/导入往返保持完整性', async () => {
    const mockAdapter = createMockAdapter([turn1, turn2]);
    const ks = new KnowledgeSystem(mockAdapter);
    await ks.initialize();

    await ks.onConversationTurn('我叫王五，我是后端开发工程师', '好的，后端开发王五');
    await ks.onConversationTurn('以后说话简短的就行，别啰嗦了', '记住了');

    const exported = ks.exportData();
    expect(exported).toBeTruthy();
    expect(exported.entities).toBeTruthy();
    expect(exported.relations).toBeTruthy();
    expect(exported._version).toBeTruthy();

    // 清空
    ks.clearAll();
    expect(ks.getStats().totalEntities).toBe(0);

    // 导入
    ks.importData(exported);

    const stats = ks.getStats();
    expect(stats.totalEntities).toBeGreaterThan(0);

    const dashboard = ks.getProfileDashboard();
    expect(dashboard.identity['name'].value).toBe('王五');
    expect(dashboard.identity['occupation'].value).toBe('后端开发');
  }, 10000);

  it('大量冷记忆不导致系统崩溃', async () => {
    const bulkResult = JSON.stringify({
      profile_updates: [
        { key: 'name', value: '测试用户', confidence: 0.9, evidence: 'test', category: 'identity' },
      ],
      memories: Array.from({ length: 50 }, (_, i) => ({
        content: `这是记忆条目${i + 1}的内容描述`,
        importance: 'low',
        type: 'event',
        level: 'cold',
      })),
      lessons: [],
      psychological_observations: [],
      project_updates: [],
      conversation_summary: '',
    });

    const mockAdapter = createMockAdapter([bulkResult]);
    const ks = new KnowledgeSystem(mockAdapter);
    await ks.initialize();

    const result = await ks.onConversationTurn(
      '今天我们来做一个批量测试，看看系统处理大量数据时的表现如何',
      '好的，开始测试吧'
    );

    expect(result).toBeTruthy();
    const stats = ks.getStats();
    expect(stats.estimatedSize).toBeDefined();
    const dashboard = ks.getProfileDashboard();
    expect(dashboard).toBeTruthy();
  }, 10000);

  it('图谱摘要提供正确统计', async () => {
    const mockAdapter = createMockAdapter([turn1, turn2, turn3]);
    const ks = new KnowledgeSystem(mockAdapter);
    await ks.initialize();

    await ks.onConversationTurn('我叫王五，我是后端开发', '好的王五');
    await ks.onConversationTurn('简短点回复，别说得太多废话', 'OK，简短回复');

    const summary = ks.getGraphSummary();
    expect(summary.totalNodes).toBeGreaterThan(0);
    expect(summary.totalEdges).toBeDefined();
    expect(summary.typeBreakdown).toBeTruthy();
    expect(summary.typeBreakdown.profile_facts).toBeGreaterThan(0);
    expect(summary.typeBreakdown.memories).toBeGreaterThan(0);
  }, 10000);
});
