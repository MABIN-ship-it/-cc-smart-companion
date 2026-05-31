import { describe, it, expect, beforeEach } from 'vitest';
import { StorageEngine } from '../StorageEngine.js';

describe('StorageEngine', () => {
  let engine;

  beforeEach(() => {
    localStorage.clear();
    engine = new StorageEngine();
    engine.initialize();
  });

  describe('initialize', () => {
    it('初始化后所有 store 存在', () => {
      engine.initialize();
      const stats = engine.getStats();
      expect(stats.entityCount).toBe(0);
      expect(stats.relationCount).toBe(0);
    });

    it('从已持久化的数据中恢复', () => {
      engine.putEntity('test_1', { type: 'memory', content: '测试记忆' });
      engine.persist();

      const engine2 = new StorageEngine();
      engine2.initialize();
      const entity = engine2.getEntity('test_1');
      expect(entity).toBeTruthy();
      expect(entity.content).toBe('测试记忆');
      expect(entity.type).toBe('memory');
    });

    it('损坏的数据自动重置为空存储', () => {
      localStorage.setItem('cc_knowledge_v2', 'not-valid-json{{');
      const engine2 = new StorageEngine();
      engine2.initialize();
      expect(engine2.getStats().entityCount).toBe(0);
    });
  });

  describe('putEntity + getEntity', () => {
    it('写入并读取实体', () => {
      engine.putEntity('profile_name', {
        type: 'profile_fact',
        category: 'identity',
        key: 'name',
        value: '张三',
        confidence: 0.95,
      });

      const entity = engine.getEntity('profile_name');
      expect(entity.type).toBe('profile_fact');
      expect(entity.key).toBe('name');
      expect(entity.value).toBe('张三');
      expect(entity.confidence).toBe(0.95);
      expect(entity.id).toBe('profile_name');
      expect(entity._updatedAt).toBeGreaterThan(0);
    });

    it('读取不存在的实体返回 null', () => {
      expect(engine.getEntity('nonexistent')).toBeNull();
    });

    it('覆盖写入更新实体', () => {
      engine.putEntity('test', { type: 'memory', content: 'v1' });
      engine.putEntity('test', { type: 'memory', content: 'v2' });

      const entity = engine.getEntity('test');
      expect(entity.content).toBe('v2');
    });
  });

  describe('removeEntity', () => {
    it('删除实体并清理关联边', () => {
      engine.putEntity('node1', { type: 'memory' });
      engine.putEntity('node2', { type: 'profile_fact' });
      engine.putRelation('edge1', { source: 'node1', target: 'node2', type: 'SUPPORTS' });

      const deleted = engine.removeEntity('node1');
      expect(deleted).toBe(true);
      expect(engine.getEntity('node1')).toBeNull();

      // 关联边也应被清除
      const edges = engine.queryRelations('node1');
      expect(edges.length).toBe(0);
    });

    it('删除不存在的实体返回 false', () => {
      expect(engine.removeEntity('nope')).toBe(false);
    });
  });

  describe('queryEntities', () => {
    beforeEach(() => {
      engine.putEntity('m1', { type: 'memory', level: 'hot', importance: 9, _updatedAt: 1000 });
      engine.putEntity('m2', { type: 'memory', level: 'cold', importance: 2, _updatedAt: 2000 });
      engine.putEntity('p1', { type: 'profile_fact', category: 'identity', confidence: 0.9, _updatedAt: 3000 });
      engine.putEntity('p2', { type: 'profile_fact', category: 'preference', confidence: 0.3, _updatedAt: 4000 });
    });

    it('按类型过滤', () => {
      const results = engine.queryEntities({ type: 'memory' });
      expect(results.length).toBe(2);
      expect(results.every(e => e.type === 'memory')).toBe(true);
    });

    it('按category过滤', () => {
      const results = engine.queryEntities({ type: 'profile_fact', category: 'identity' });
      expect(results.length).toBe(1);
      expect(results[0].category).toBe('identity');
    });

    it('按最低置信度过滤', () => {
      const results = engine.queryEntities({ type: 'profile_fact', minConfidence: 0.5 });
      expect(results.length).toBe(1);
      expect(results[0].confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('无过滤条件返回全部实体', () => {
      expect(engine.queryEntities().length).toBe(4);
    });

    it('结果按更新时间降序排列', () => {
      const results = engine.queryEntities();
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]._updatedAt).toBeGreaterThanOrEqual(results[i]._updatedAt);
      }
    });
  });

  describe('countEntities', () => {
    it('统计各类型数量', () => {
      engine.putEntity('m1', { type: 'memory' });
      engine.putEntity('m2', { type: 'memory' });
      engine.putEntity('p1', { type: 'profile_fact' });

      expect(engine.countEntities('memory')).toBe(2);
      expect(engine.countEntities('profile_fact')).toBe(1);
      expect(engine.countEntities('lesson')).toBe(0);
    });
  });

  describe('relations', () => {
    beforeEach(() => {
      engine.putEntity('a', { type: 'memory', content: '张三提到喜欢Python' });
      engine.putEntity('b', { type: 'profile_fact', key: 'skill', value: 'Python' });
    });

    it('写入和查询边', () => {
      engine.putRelation('rel1', {
        source: 'a',
        target: 'b',
        type: 'SUPPORTS',
      });

      const edges = engine.queryRelations('a');
      expect(edges.length).toBe(1);
      expect(edges[0].type).toBe('SUPPORTS');
      expect(edges[0].source).toBe('a');
      expect(edges[0].target).toBe('b');
    });

    it('按边类型过滤', () => {
      engine.putRelation('rel1', { source: 'a', target: 'b', type: 'SUPPORTS' });
      engine.putRelation('rel2', { source: 'a', target: 'b', type: 'RELATED_TO' });

      expect(engine.queryRelations('a', 'SUPPORTS').length).toBe(1);
      expect(engine.queryRelations('a', 'RELATED_TO').length).toBe(1);
      expect(engine.queryRelations('a', 'CONTRADICTS').length).toBe(0);
    });

    it('查找两个节点间的关系', () => {
      engine.putRelation('rel1', { source: 'a', target: 'b', type: 'SUPPORTS' });

      const found = engine.findRelation('a', 'b');
      expect(found).toBeTruthy();
      expect(found.type).toBe('SUPPORTS');

      expect(engine.findRelation('b', 'a')).toBeNull();
    });

    it('删除边', () => {
      engine.putRelation('rel1', { source: 'a', target: 'b', type: 'SUPPORTS' });
      expect(engine.removeRelation('rel1')).toBe(true);
      expect(engine.queryRelations('a').length).toBe(0);
      expect(engine.removeRelation('rel1')).toBe(false);
    });
  });

  describe('meta', () => {
    it('读写 meta 值', () => {
      engine.setMeta('legacy_migrated', true);
      expect(engine.getMeta('legacy_migrated')).toBe(true);

      engine.setMeta('test_number', 42);
      expect(engine.getMeta('test_number')).toBe(42);
    });

    it('读取不存在的 meta 返回 undefined', () => {
      expect(engine.getMeta('nonexistent')).toBeUndefined();
    });
  });

  describe('persist', () => {
    it('persist 后数据可恢复', () => {
      engine.putEntity('test', { type: 'memory', content: '持久化测试' });
      engine.persist();

      const engine2 = new StorageEngine();
      engine2.initialize();
      expect(engine2.getEntity('test').content).toBe('持久化测试');
    });

    it('无变更时 persist 不写入', () => {
      engine.putEntity('test', { type: 'memory' });
      engine.persist();

      // 第二次 persist 应该跳过（dirty=false）
      const before = localStorage.getItem('cc_knowledge_v2');
      engine.persist();
      const after = localStorage.getItem('cc_knowledge_v2');
      expect(after).toBe(before);
    });
  });

  describe('raw observations', () => {
    it('追加和读取原始观察（环形缓冲）', () => {
      engine.appendRawObservation({ userMsg: '你好', aiResp: '你好！' });
      engine.appendRawObservation({ userMsg: '今天天气不错', aiResp: '是的呢' });

      const obs = engine.getRawObservations();
      expect(obs.length).toBe(2);
      expect(obs[0].userMsg).toBe('你好');
      expect(obs[1].userMsg).toBe('今天天气不错');
    });

    it('超过50条时最旧的被移除', () => {
      for (let i = 0; i < 55; i++) {
        engine.appendRawObservation({ index: i });
      }

      const obs = engine.getRawObservations();
      expect(obs.length).toBe(50);
      expect(obs[0].index).toBe(5);  // 最旧的5条被移除
      expect(obs[49].index).toBe(54);
    });
  });

  describe('exportData / importData', () => {
    it('导出再导入保持数据一致', () => {
      engine.putEntity('e1', { type: 'memory', content: '测试' });
      engine.putRelation('r1', { source: 'e1', target: 'e2', type: 'RELATED_TO' });
      engine.setMeta('test', 'value');

      const exported = engine.exportData();

      const engine2 = new StorageEngine();
      engine2.initialize();
      engine2.importData(exported);

      expect(engine2.getEntity('e1').content).toBe('测试');
      expect(engine2.queryRelations('e1').length).toBe(1);
      expect(engine2.getMeta('test')).toBe('value');
    });

    it('导入版本不匹配时抛出错误', () => {
      expect(() => engine.importData({ _version: 99 })).toThrow('版本不匹配');
    });
  });

  describe('clearAll', () => {
    it('清空所有数据', () => {
      engine.putEntity('test', { type: 'memory' });
      engine.putRelation('r1', { source: 'test', target: 'x', type: 'RELATED_TO' });
      engine.setMeta('flag', true);

      engine.clearAll();

      expect(engine.getStats().entityCount).toBe(0);
      expect(engine.getStats().relationCount).toBe(0);
    });
  });

  describe('getStats', () => {
    it('正确统计各类型数量', () => {
      engine.putEntity('m1', { type: 'memory' });
      engine.putEntity('m2', { type: 'memory' });
      engine.putEntity('p1', { type: 'profile_fact' });
      engine.putEntity('l1', { type: 'lesson' });

      const stats = engine.getStats();
      expect(stats.entityCount).toBe(4);
      expect(stats.typeCounts.memory).toBe(2);
      expect(stats.typeCounts.profile_fact).toBe(1);
      expect(stats.typeCounts.lesson).toBe(1);
    });
  });
});
