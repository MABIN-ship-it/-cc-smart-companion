/**
 * GraphTraversal — 知识图谱遍历查询工具。
 *
 * 提供更高级的图查询：按维度聚合、时间线、关联度排序。
 */

import { getKnowledgeGraph } from './KnowledgeGraph.js';
import { NODE_TYPES, EDGE_TYPES } from './NodeTypes.js';

class GraphTraversal {
  constructor(graph) {
    this._graph = graph || getKnowledgeGraph();
  }

  /**
   * 按时间线获取记忆（从新到旧）。
   * @param {number} limit - 返回数量
   * @param {string} level - 过滤级别：hot/warm/cold
   */
  getMemoryTimeline(limit = 50, level = null) {
    const filter = { type: NODE_TYPES.MEMORY };
    let memories = this._graph._storage.queryEntities(filter);

    if (level) {
      memories = memories.filter(m => m.level === level);
    }

    return memories
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, limit);
  }

  /**
   * 获取用户画像的演化历史。
   * 通过 EVOLVED_TO 边追踪字段变化。
   */
  getProfileEvolution(profileKey) {
    const nodeId = `profile_${profileKey}`;
    const node = this._graph.getNode(nodeId);
    if (!node) return [];

    const evolution = [{
      value: node.value,
      confidence: node.confidence,
      timestamp: node._createdAt || node._updatedAt,
      evidence: node.evidence,
    }];

    // 查找 EVOLVED_TO 边
    const edges = this._graph.getEdges(nodeId, EDGE_TYPES.EVOLVED_TO);
    for (const edge of edges) {
      evolution.push({
        previousValue: edge.previousValue,
        newValue: edge.newValue,
        timestamp: edge._updatedAt,
      });
    }

    return evolution.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  /**
   * 按维度聚合心理观察。
   * @returns {Record<string, object[]>}
   */
  getPsychObservationsByDimension() {
    const observations = this._graph._storage.queryEntities({
      type: NODE_TYPES.PSYCH_OBSERVATION,
      minConfidence: 0.4,
    });

    const byDimension = {};
    for (const obs of observations) {
      const dim = obs.dimension || 'unknown';
      if (!byDimension[dim]) byDimension[dim] = [];
      byDimension[dim].push({
        trait: obs.trait,
        confidence: obs.confidence,
        evidence: obs.evidence,
        timestamp: obs._updatedAt,
      });
    }

    // 每个维度按时间降序
    for (const dim of Object.keys(byDimension)) {
      byDimension[dim].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    return byDimension;
  }

  /**
   * 按类别聚合经验教训。
   */
  getLessonsByCategory() {
    const lessons = this._graph._storage.queryEntities({ type: NODE_TYPES.LESSON });

    const byCategory = {};
    for (const l of lessons) {
      const cat = l.category || 'general';
      if (!byCategory[cat]) byCategory[cat] = { successes: [], mistakes: [], total: 0 };
      byCategory[cat].total++;
      if (l.isMistake) {
        byCategory[cat].mistakes.push(l);
      } else {
        byCategory[cat].successes.push(l);
      }
    }

    return byCategory;
  }

  /**
   * 获取兴趣域强度排序。
   */
  getInterestRankings() {
    const interests = this._graph._storage.queryEntities({ type: NODE_TYPES.INTEREST_DOMAIN });
    return interests
      .sort((a, b) => (b.strength || 0) - (a.strength || 0));
  }

  /**
   * 查找与新记忆最相关的现有实体（用于自动建立关联）。
   * 基于内容关键词的简单匹配。
   * @param {string} content - 新记忆内容
   * @param {number} limit - 返回最多N个关联
   */
  findRelatedEntities(content, limit = 3) {
    if (!content) return [];

    const tokens = this._tokenize(content);
    if (tokens.length === 0) return [];

    const allEntities = this._graph.getAllNodes();
    const scored = [];

    for (const entity of allEntities) {
      const entityText = this._getEntityText(entity);
      if (!entityText) continue;

      let score = 0;
      const entityTokens = this._tokenize(entityText);
      const entityTextLower = entityText.toLowerCase();

      for (const t of tokens) {
        if (entityTokens.includes(t)) {
          score += 2;
        } else {
          // 子串匹配：检查是否有entity token是query token的子串
          let partialMatch = false;
          for (const et of entityTokens) {
            if (t.includes(et) || et.includes(t)) {
              score += 1;
              partialMatch = true;
              break;
            }
          }
          if (!partialMatch && entityTextLower.includes(t)) {
            score += 1;
          }
        }
      }

      if (score > 0) {
        scored.push({ entity, score });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.entity);
  }

  /** 简单分词 */
  _tokenize(text) {
    const cleaned = text.toLowerCase().replace(/[^\w一-鿿]/g, ' ');
    const tokens = [];

    // CJK bigram
    let cjkBuf = [];
    for (const char of cleaned) {
      if (/[一-鿿]/.test(char)) {
        cjkBuf.push(char);
        if (cjkBuf.length === 2) {
          tokens.push(cjkBuf.join(''));
          cjkBuf.shift();
        }
      } else {
        if (cjkBuf.length > 0) {
          tokens.push(cjkBuf.join(''));
          cjkBuf = [];
        }
      }
    }
    if (cjkBuf.length > 0) tokens.push(cjkBuf.join(''));

    // 英文词
    const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
    tokens.push(...words);

    return tokens;
  }

  /** 获取实体可搜索的文本 */
  _getEntityText(entity) {
    switch (entity.type) {
      case NODE_TYPES.PROFILE_FACT:
        return `${entity.key} ${entity.value}`;
      case NODE_TYPES.MEMORY:
        return entity.content || '';
      case NODE_TYPES.LESSON:
        return `${entity.context || ''} ${entity.pattern || ''}`;
      case NODE_TYPES.PSYCH_OBSERVATION:
        return `${entity.dimension} ${entity.trait}`;
      case NODE_TYPES.PROJECT_ENTITY:
        return entity.entity || '';
      case NODE_TYPES.INTEREST_DOMAIN:
        return entity.name || '';
      default:
        return '';
    }
  }
}

export { GraphTraversal };
export default GraphTraversal;
