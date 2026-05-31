/**
 * KnowledgeGraph — 知识图谱数据结构。
 *
 * 基于 StorageEngine 的 entities + relations 存储，
 * 提供图视角的 CRUD、邻居查询、子图提取。
 */

import { getStorageEngine } from '../storage/StorageEngine.js';
import { NODE_TYPES, EDGE_TYPES, NODE_DISPLAY } from './NodeTypes.js';

// Profile字段key → 中文
const PROFILE_KEY_CN = {
  name: '姓名', preferred_name: '偏好称呼', nickname: '昵称', alias: '别名',
  role: '角色', occupation: '职位', title: '头衔', job: '工作',
  location: '城市', city: '城市', country: '国家', region: '地区',
  organization: '组织', company: '公司', team: '团队', department: '部门',
  gender: '性别', age: '年龄', birthday: '生日', zodiac: '星座',
  language: '语言', timezone: '时区', education: '学历', background: '背景',
  prefer_response_length: '回复长度', prefer_detail_level: '详细程度',
  prefer_tone: '语气风格', prefer_code_style: '代码风格',
  prefer_explanation_depth: '解释深度', prefer_language: '偏好语言',
  prefer_examples: '偏好举例', prefer_humor: '幽默程度',
  prefer_emoji: 'Emoji使用', prefer_formality: '正式程度',
  prefer_initiative: '主动程度', prefer_brevity: '简洁度',
  prefer_proactive_assistant: '偏好主动助手',
  cc_interaction_style: '交互风格', cc_response_style: '回复风格',
  cc_perception: '对CC感受', creator_of_cc: 'CC的创作者',
  dislike_verbose: '厌恶啰嗦',
  dislike_vague: '厌恶模糊', dislike_repetition: '厌恶重复',
  need_technical_detail: '需求技术细节', need_quick_answer: '需求快速回答',
  need_step_by_step: '需求分步指导', skill: '技能', interest: '兴趣',
  // 扩展 —— LLM可能生成的各种key（与ProfileDashboard保持同步）
  interests: '兴趣领域', workplace: '工作地点',
  project_focus: '项目重点', project_focus_detail: '项目重点详情',
  technical_approach: '技术方案', technical_depth: '技术深度',
  proactive_assistant: '主动助手', assistant_mode: '助手模式',
  code_assistance: '代码协助', work_style: '工作风格',
  communication_preference: '沟通偏好', task_preference: '任务偏好',
  profession: '职业', expertise: '专长', domain: '领域',
  personality: '性格', work_mode: '工作模式',
  feedback_style: '反馈风格', response_style: '回复风格',
  autonomy_level: '自主程度',
};

// 反向映射：中文 → 英文（用于标准化LLM可能返回的中文key）
const REVERSE_CN_KEY = {};
for (const [en, cn] of Object.entries(PROFILE_KEY_CN)) {
  REVERSE_CN_KEY[cn] = en;
}

// 心理维度 → 中文
const DIM_CN = {
  communication_style: '沟通风格', emotional_pattern: '情绪模式',
  emotional_patterns: '情绪模式', cognitive_style: '认知方式',
  motivation: '动机驱力', wellbeing: '身心健康',
};

/** profile key → 中文（支持前缀匹配） */
function translateProfileKey(key) {
  if (!key) return '';
  if (PROFILE_KEY_CN[key]) return PROFILE_KEY_CN[key];
  if (key.startsWith('interest_')) return '兴趣';
  if (key.startsWith('skill_')) return '技能';
  if (key.startsWith('hobby_')) return '爱好';
  if (key.startsWith('prefer_')) return key.slice(7).replace(/_/g, ' ');
  if (key.startsWith('need_')) return '需求';
  if (key.startsWith('dislike_')) return '厌恶';
  if (key.startsWith('cc_')) return `CC${key.slice(3)}`;
  return key;
}

/** 标准化profile key为英文（LLM可能返回中文key） */
export function normalizeProfileKey(key) {
  if (!key) return '';
  // 如果已经是标准英文key
  if (PROFILE_KEY_CN[key]) return key;
  // 如果是中文key，反向映射
  if (REVERSE_CN_KEY[key]) return REVERSE_CN_KEY[key];
  // 尝试trim后匹配
  const trimmed = key.trim();
  if (PROFILE_KEY_CN[trimmed]) return trimmed;
  if (REVERSE_CN_KEY[trimmed]) return REVERSE_CN_KEY[trimmed];
  return key;
}

class KnowledgeGraph {
  constructor(storage) {
    this._storage = storage || getStorageEngine();
  }

  /* ---------- 节点操作 ---------- */

  /** 添加节点 */
  addNode(id, data) {
    const node = {
      id,
      type: data.type || 'unknown',
      ...data,
      _updatedAt: data._updatedAt || Date.now(),
      _createdAt: data._createdAt || Date.now(),
    };
    this._storage.putEntity(id, node);
    return node;
  }

  /** 获取节点 */
  getNode(id) {
    return this._storage.getEntity(id);
  }

  /** 删除节点及其所有边 */
  removeNode(id) {
    return this._storage.removeEntity(id);
  }

  /** 按类型查询节点 */
  getNodesByType(type, options = {}) {
    const filter = { type };
    if (options.minConfidence !== undefined) filter.minConfidence = options.minConfidence;
    return this._storage.queryEntities(filter);
  }

  /** 获取所有节点 */
  getAllNodes() {
    return this._storage.queryEntities();
  }

  /** 统计节点数 */
  nodeCount(type = null) {
    if (type) return this._storage.countEntities(type);
    return this._storage.getStats().entityCount;
  }

  /* ---------- 边操作 ---------- */

  /** 添加边 */
  addEdge(id, sourceId, targetId, edgeType, metadata = {}) {
    const edge = {
      id,
      source: sourceId,
      target: targetId,
      type: edgeType,
      ...metadata,
      _updatedAt: Date.now(),
    };
    this._storage.putRelation(id, edge);
    return edge;
  }

  /** 删除边 */
  removeEdge(id) {
    return this._storage.removeRelation(id);
  }

  /** 获取节点的所有邻边 */
  getEdges(nodeId, edgeType = null) {
    return this._storage.queryRelations(nodeId, edgeType);
  }

  /** 获取两个节点间的边 */
  getEdgeBetween(sourceId, targetId, edgeType = null) {
    return this._storage.findRelation(sourceId, targetId, edgeType);
  }

  /* ---------- 图遍历 ---------- */

  /**
   * 获取节点的邻居（1跳）。
   * @returns {{ node: object, edge: object }[]} 邻居节点和连接边
   */
  getNeighbors(nodeId, edgeType = null) {
    const edges = this.getEdges(nodeId, edgeType);
    const neighbors = [];

    for (const edge of edges) {
      const neighborId = edge.source === nodeId ? edge.target : edge.source;
      const neighbor = this.getNode(neighborId);
      if (neighbor) {
        neighbors.push({ node: neighbor, edge });
      }
    }

    return neighbors;
  }

  /**
   * 提取以指定节点为中心的子图（N跳）。
   * @param {string} centerId - 中心节点ID
   * @param {number} hops - 跳数（默认1）
   * @param {string[]} nodeTypes - 限制节点类型（可选）
   * @returns {{ nodes: object[], edges: object[] }}
   */
  getSubgraph(centerId, hops = 1, nodeTypes = null) {
    const visited = new Set();
    const nodes = [];
    const edges = [];
    const queue = [{ id: centerId, hop: 0 }];
    visited.add(centerId);

    const centerNode = this.getNode(centerId);
    if (centerNode) nodes.push(centerNode);

    const edgeIds = new Set();

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.hop >= hops) continue;

      const neighbors = this._storage.queryRelations(current.id);
      for (const edge of neighbors) {
        if (!edgeIds.has(edge.id)) {
          edgeIds.add(edge.id);
          edges.push(edge);
        }
        const neighborId = edge.source === current.id ? edge.target : edge.source;

        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          const neighbor = this.getNode(neighborId);
          if (neighbor) {
            if (!nodeTypes || nodeTypes.includes(neighbor.type)) {
              nodes.push(neighbor);
              queue.push({ id: neighborId, hop: current.hop + 1 });
            }
          }
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * 查找两个节点间的最短路径（BFS，最多6跳）。
   * @returns {string[]|null} 节点ID路径数组
   */
  findPath(fromId, toId, maxHops = 6) {
    if (fromId === toId) return [fromId];

    const visited = new Set();
    const queue = [{ id: fromId, path: [fromId] }];
    visited.add(fromId);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.path.length > maxHops + 1) continue;

      const edges = this._storage.queryRelations(current.id);
      for (const edge of edges) {
        const neighborId = edge.source === current.id ? edge.target : edge.source;

        if (neighborId === toId) {
          return [...current.path, toId];
        }

        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push({ id: neighborId, path: [...current.path, neighborId] });
        }
      }
    }

    return null; // 未找到路径
  }

  /* ---------- 聚合查询 ---------- */

  /**
   * 获取支撑某个画像事实的所有记忆。
   */
  getSupportingMemories(profileNodeId) {
    const edges = this.getEdges(profileNodeId, EDGE_TYPES.SUPPORTS);
    const memories = [];
    for (const edge of edges) {
      const otherId = edge.source === profileNodeId ? edge.target : edge.source;
      const node = this.getNode(otherId);
      if (node && node.type === NODE_TYPES.MEMORY) {
        memories.push({ node, edge });
      }
    }
    return memories;
  }

  /**
   * 获取与某个兴趣域关联的所有项目实体。
   */
  getRelatedProjects(interestNodeId) {
    const edges = this.getEdges(interestNodeId, EDGE_TYPES.BELONGS_TO);
    const projects = [];
    for (const edge of edges) {
      const otherId = edge.source === interestNodeId ? edge.target : edge.source;
      const node = this.getNode(otherId);
      if (node && node.type === NODE_TYPES.PROJECT_ENTITY) {
        projects.push({ node, edge });
      }
    }
    return projects;
  }

  /**
   * 获取从某个观察衍生出的所有归纳结果。
   */
  getDerivedEntities(rawNodeId) {
    const edges = this.getEdges(rawNodeId, EDGE_TYPES.DERIVED_FROM);
    const derived = [];
    for (const edge of edges) {
      const otherId = edge.source === rawNodeId ? edge.target : edge.source;
      const node = this.getNode(otherId);
      if (node) derived.push({ node, edge });
    }
    return derived;
  }

  /* ---------- 统计与导出 ---------- */

  /** 获取图谱摘要 */
  getSummary() {
    const stats = this._storage.getStats();
    const memoryCount = this._storage.countEntities(NODE_TYPES.MEMORY);
    const hotMemories = this._storage.queryEntities({ type: NODE_TYPES.MEMORY })
      .filter(m => m.level === 'hot').length;
    const profileCount = this._storage.countEntities(NODE_TYPES.PROFILE_FACT);
    const psychCount = this._storage.countEntities(NODE_TYPES.PSYCH_OBSERVATION);
    const lessonCount = this._storage.countEntities(NODE_TYPES.LESSON);

    return {
      totalNodes: stats.entityCount,
      totalEdges: stats.relationCount,
      typeBreakdown: {
        profile_facts: profileCount,
        memories: memoryCount,
        hot_memories: hotMemories,
        lessons: lessonCount,
        psych_observations: psychCount,
      },
    };
  }

  /** 导出图谱数据（用于可视化面板） */
  exportForVisualization(maxNodes = 500) {
    const allNodes = this.getAllNodes();
    const allEdges = [];

    // 收集所有边
    for (const node of allNodes.slice(0, maxNodes)) {
      const edges = this.getEdges(node.id);
      for (const edge of edges) {
        // 避免重复边
        if (!allEdges.find(e => e.id === edge.id)) {
          allEdges.push(edge);
        }
      }
    }

    // 限制节点数量，优先保留高重要性的
    const prioritizedNodes = allNodes
      .sort((a, b) => {
        const importanceA = a.importance || a.confidence || 0;
        const importanceB = b.importance || b.confidence || 0;
        return importanceB - importanceA;
      })
      .slice(0, maxNodes);

    return {
      nodes: prioritizedNodes.map(n => ({
        id: n.id,
        type: n.type,
        label: this._getNodeLabel(n),
        display: NODE_DISPLAY[n.type] || NODE_DISPLAY.unknown,
        importance: n.importance || n.confidence || 0.5,
        data: n,
      })),
      edges: allEdges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type,
        weight: e.weight || 1,
      })),
    };
  }

/** 生成节点标签 */
  _getNodeLabel(node) {
    switch (node.type) {
      case NODE_TYPES.PROFILE_FACT: {
        const cnKey = node.label || translateProfileKey(node.key);
        const displayVal = (node.value || '').slice(0, 20);
        return `${cnKey}: ${displayVal}`;
      }
      case NODE_TYPES.MEMORY:
        return (node.content || '').slice(0, 30);
      case NODE_TYPES.LESSON:
        return (node.context || node.pattern || '').slice(0, 30);
      case NODE_TYPES.PSYCH_OBSERVATION: {
        const dimCn = DIM_CN[node.dimension] || node.dimension || '';
        const trait = (node.trait || '').slice(0, 20);
        return dimCn ? `${dimCn}: ${trait}` : trait;
      }
      case NODE_TYPES.PROJECT_ENTITY:
        return (node.entity || '').split('/').pop()?.slice(0, 30) || '';
      case NODE_TYPES.INTEREST_DOMAIN:
        return (node.name || '').slice(0, 20);
      case NODE_TYPES.CONVERSATION:
        return (node.summary || '').slice(0, 30);
      default:
        return (node.id || '').slice(0, 20);
    }
  }
}

/** 单例 */
let _instance = null;

export function getKnowledgeGraph(storage) {
  if (!_instance) {
    _instance = new KnowledgeGraph(storage);
  }
  return _instance;
}

/** @internal 测试用：重置单例 */
export function _resetKnowledgeGraphForTest() {
  _instance = null;
}

export { KnowledgeGraph, NODE_TYPES, EDGE_TYPES };
export default KnowledgeGraph;
