import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeGraph } from '../KnowledgeGraph.js';
import { GraphTraversal } from '../GraphTraversal.js';
import { NODE_TYPES, EDGE_TYPES } from '../NodeTypes.js';
import { getStorageEngine } from '../../storage/StorageEngine.js';

describe('KnowledgeGraph', () => {
  let graph;
  let storage;

  beforeEach(() => {
    localStorage.clear();
    storage = getStorageEngine();
    storage.clearAll();
    graph = new KnowledgeGraph(storage);
  });

  describe('节点操作', () => {
    it('添加和获取节点', () => {
      graph.addNode('test_1', {
        type: NODE_TYPES.MEMORY,
        content: '用户喜欢Python',
        importance: 8,
      });

      const node = graph.getNode('test_1');
      expect(node).toBeTruthy();
      expect(node.type).toBe(NODE_TYPES.MEMORY);
      expect(node.content).toBe('用户喜欢Python');
      expect(node.importance).toBe(8);
    });

    it('删除节点同时删除关联边', () => {
      graph.addNode('a', { type: NODE_TYPES.MEMORY, content: 'A' });
      graph.addNode('b', { type: NODE_TYPES.PROFILE_FACT, key: 'skill', value: 'Python' });
      graph.addEdge('e1', 'a', 'b', EDGE_TYPES.SUPPORTS);

      graph.removeNode('a');
      expect(graph.getNode('a')).toBeNull();
      expect(graph.getEdges('a').length).toBe(0);
      // b节点应仍然存在
      expect(graph.getNode('b')).toBeTruthy();
    });

    it('按类型查询节点', () => {
      graph.addNode('m1', { type: NODE_TYPES.MEMORY, content: 'M1' });
      graph.addNode('m2', { type: NODE_TYPES.MEMORY, content: 'M2' });
      graph.addNode('p1', { type: NODE_TYPES.PROFILE_FACT, key: 'name', value: '张三' });

      const memories = graph.getNodesByType(NODE_TYPES.MEMORY);
      expect(memories.length).toBe(2);
      expect(memories.every(n => n.type === NODE_TYPES.MEMORY)).toBe(true);
    });

    it('统计节点数', () => {
      graph.addNode('a', { type: NODE_TYPES.MEMORY });
      graph.addNode('b', { type: NODE_TYPES.LESSON });

      expect(graph.nodeCount(NODE_TYPES.MEMORY)).toBe(1);
      expect(graph.nodeCount(NODE_TYPES.LESSON)).toBe(1);
      expect(graph.nodeCount()).toBe(2);
    });
  });

  describe('边操作', () => {
    beforeEach(() => {
      graph.addNode('m1', { type: NODE_TYPES.MEMORY, content: '记忆1' });
      graph.addNode('p1', { type: NODE_TYPES.PROFILE_FACT, key: 'skill', value: 'Python' });
    });

    it('添加和查询边', () => {
      graph.addEdge('e1', 'm1', 'p1', EDGE_TYPES.SUPPORTS);

      const edges = graph.getEdges('m1');
      expect(edges.length).toBe(1);
      expect(edges[0].type).toBe(EDGE_TYPES.SUPPORTS);
      expect(edges[0].source).toBe('m1');
      expect(edges[0].target).toBe('p1');
    });

    it('按边类型过滤', () => {
      graph.addEdge('e1', 'm1', 'p1', EDGE_TYPES.SUPPORTS);
      graph.addEdge('e2', 'm1', 'p1', EDGE_TYPES.RELATED_TO);

      expect(graph.getEdges('m1', EDGE_TYPES.SUPPORTS).length).toBe(1);
      expect(graph.getEdges('m1', EDGE_TYPES.RELATED_TO).length).toBe(1);
    });

    it('获取两个节点间的边', () => {
      graph.addEdge('e1', 'm1', 'p1', EDGE_TYPES.SUPPORTS);

      const edge = graph.getEdgeBetween('m1', 'p1');
      expect(edge).toBeTruthy();
      expect(edge.type).toBe(EDGE_TYPES.SUPPORTS);
      expect(graph.getEdgeBetween('p1', 'm1')).toBeNull();
    });
  });

  describe('邻居查询', () => {
    beforeEach(() => {
      graph.addNode('center', { type: NODE_TYPES.MEMORY, content: '中心' });
      graph.addNode('n1', { type: NODE_TYPES.PROFILE_FACT, key: 'skill', value: 'Python' });
      graph.addNode('n2', { type: NODE_TYPES.LESSON, context: '用户喜欢简洁' });
      graph.addNode('n3', { type: NODE_TYPES.MEMORY, content: '远节点' });

      graph.addEdge('e1', 'center', 'n1', EDGE_TYPES.SUPPORTS);
      graph.addEdge('e2', 'center', 'n2', EDGE_TYPES.RELATED_TO);
      graph.addEdge('e3', 'n1', 'n3', EDGE_TYPES.RELATED_TO); // 2跳：center→n1→n3
    });

    it('获取1跳邻居', () => {
      const neighbors = graph.getNeighbors('center');
      expect(neighbors.length).toBe(2);
      const ids = neighbors.map(n => n.node.id);
      expect(ids).toContain('n1');
      expect(ids).toContain('n2');
    });

    it('获取2跳子图', () => {
      const subgraph = graph.getSubgraph('center', 2);
      expect(subgraph.nodes.length).toBe(4); // center + n1 + n2 + n3
      expect(subgraph.edges.length).toBe(3);
    });

    it('按节点类型过滤子图', () => {
      const subgraph = graph.getSubgraph('center', 2, [NODE_TYPES.PROFILE_FACT]);
      expect(subgraph.nodes.some(n => n.type === NODE_TYPES.PROFILE_FACT)).toBe(true);
      expect(subgraph.nodes.some(n => n.type === NODE_TYPES.LESSON)).toBe(false);
    });
  });

  describe('路径查找', () => {
    beforeEach(() => {
      graph.addNode('a', { type: NODE_TYPES.MEMORY, content: 'A' });
      graph.addNode('b', { type: NODE_TYPES.MEMORY, content: 'B' });
      graph.addNode('c', { type: NODE_TYPES.MEMORY, content: 'C' });
      graph.addNode('d', { type: NODE_TYPES.MEMORY, content: 'D' });

      graph.addEdge('ab', 'a', 'b', EDGE_TYPES.RELATED_TO);
      graph.addEdge('bc', 'b', 'c', EDGE_TYPES.RELATED_TO);
      graph.addEdge('cd', 'c', 'd', EDGE_TYPES.RELATED_TO);
    });

    it('找到最短路径', () => {
      const path = graph.findPath('a', 'd');
      expect(path).toEqual(['a', 'b', 'c', 'd']);
    });

    it('同节点路径', () => {
      const path = graph.findPath('a', 'a');
      expect(path).toEqual(['a']);
    });

    it('无路径时返回null', () => {
      graph.addNode('isolated', { type: NODE_TYPES.MEMORY, content: '孤立' });
      const path = graph.findPath('a', 'isolated');
      expect(path).toBeNull();
    });
  });

  describe('聚合查询', () => {
    it('获取支撑记忆', () => {
      graph.addNode('pf', { type: NODE_TYPES.PROFILE_FACT, key: 'skill', value: 'Python' });
      graph.addNode('m1', { type: NODE_TYPES.MEMORY, content: '用户用Python写脚本' });
      graph.addNode('m2', { type: NODE_TYPES.MEMORY, content: '用户喜欢Django' });
      graph.addEdge('s1', 'm1', 'pf', EDGE_TYPES.SUPPORTS);
      graph.addEdge('s2', 'm2', 'pf', EDGE_TYPES.SUPPORTS);

      const supporting = graph.getSupportingMemories('pf');
      expect(supporting.length).toBe(2);
      expect(supporting.every(s => s.node.type === NODE_TYPES.MEMORY)).toBe(true);
    });
  });

  describe('导出可视化数据', () => {
    it('导出格式正确', () => {
      graph.addNode('n1', { type: NODE_TYPES.MEMORY, content: '测试记忆', importance: 8 });
      graph.addNode('n2', { type: NODE_TYPES.PROFILE_FACT, key: 'name', value: '张三', confidence: 0.9 });
      graph.addEdge('e1', 'n1', 'n2', EDGE_TYPES.SUPPORTS);

      const viz = graph.exportForVisualization();
      expect(viz.nodes.length).toBeGreaterThanOrEqual(2);
      expect(viz.edges.length).toBeGreaterThanOrEqual(1);

      // 检查节点格式
      const node = viz.nodes.find(n => n.id === 'n1');
      expect(node).toBeTruthy();
      expect(node.type).toBe(NODE_TYPES.MEMORY);
      expect(node.label).toBeTruthy();
      expect(node.display).toBeTruthy();
    });
  });
});

describe('GraphTraversal', () => {
  let graph;
  let traversal;

  beforeEach(() => {
    localStorage.clear();
    const storage = getStorageEngine();
    storage.clearAll();
    graph = new KnowledgeGraph(storage);
    traversal = new GraphTraversal(graph);
  });

  describe('时间线', () => {
    it('按时间排序返回记忆', () => {
      const old = Date.now() - 10000;
      const newer = Date.now();

      graph.addNode('m1', { type: NODE_TYPES.MEMORY, content: '旧记忆', createdAt: old, _updatedAt: old });
      graph.addNode('m2', { type: NODE_TYPES.MEMORY, content: '新记忆', createdAt: newer, _updatedAt: newer });

      const timeline = traversal.getMemoryTimeline();
      expect(timeline.length).toBe(2);
      expect(timeline[0].content).toBe('新记忆');
      expect(timeline[1].content).toBe('旧记忆');
    });

    it('按级别过滤', () => {
      graph.addNode('m1', { type: NODE_TYPES.MEMORY, content: '热', level: 'hot', createdAt: Date.now() });
      graph.addNode('m2', { type: NODE_TYPES.MEMORY, content: '冷', level: 'cold', createdAt: Date.now() });

      const hot = traversal.getMemoryTimeline(50, 'hot');
      expect(hot.length).toBe(1);
      expect(hot[0].content).toBe('热');
    });
  });

  describe('心理观察聚合', () => {
    it('按维度分组', () => {
      graph.addNode('p1', {
        type: NODE_TYPES.PSYCH_OBSERVATION, dimension: 'communication_style',
        trait: '简洁', confidence: 0.8, _updatedAt: Date.now(),
      });
      graph.addNode('p2', {
        type: NODE_TYPES.PSYCH_OBSERVATION, dimension: 'cognitive_style',
        trait: '系统化', confidence: 0.7, _updatedAt: Date.now(),
      });

      const byDim = traversal.getPsychObservationsByDimension();
      expect(byDim['communication_style']).toBeTruthy();
      expect(byDim['communication_style'].length).toBe(1);
      expect(byDim['cognitive_style']).toBeTruthy();
      expect(byDim['unknown']).toBeFalsy();
    });
  });

  describe('经验教训聚合', () => {
    it('按类别分组', () => {
      graph.addNode('l1', {
        type: NODE_TYPES.LESSON, category: 'communication_style',
        context: '太啰嗦', isMistake: true, _updatedAt: Date.now(),
      });
      graph.addNode('l2', {
        type: NODE_TYPES.LESSON, category: 'communication_style',
        context: '简洁明了', isMistake: false, _updatedAt: Date.now(),
      });

      const byCat = traversal.getLessonsByCategory();
      expect(byCat['communication_style']).toBeTruthy();
      expect(byCat['communication_style'].total).toBe(2);
      expect(byCat['communication_style'].mistakes.length).toBe(1);
      expect(byCat['communication_style'].successes.length).toBe(1);
    });
  });

  describe('关联实体查找', () => {
    it('通过关键词匹配找到相关实体', () => {
      graph.addNode('pf', {
        type: NODE_TYPES.PROFILE_FACT, key: 'skill', value: 'Python',
      });
      graph.addNode('m', {
        type: NODE_TYPES.MEMORY, content: '用户使用Python做数据分析',
      });

      const related = traversal.findRelatedEntities('Python编程', 3);
      expect(related.length).toBeGreaterThanOrEqual(1);
    });

    it('无匹配时返回空', () => {
      const related = traversal.findRelatedEntities('XYZ完全不相关的内容');
      expect(related.length).toBe(0);
    });
  });
});
