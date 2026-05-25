/**
 * KnowledgeSystem — 知识系统统一门面。
 *
 * 初始化并连接所有知识模块，提供唯一入口：
 * - StorageEngine（持久化）
 * - CapacityManager（配额管理）
 * - Migration（数据迁移）
 * - ExtractionEngine（LLM提取）
 * - KnowledgeGraph（图数据模型）
 * - ProfileModel（用户画像）
 * - AnalysisScheduler（分析归纳）
 *
 * 使用方式：
 *   const ks = getKnowledgeSystem(modelAdapter);
 *   await ks.initialize();
 *   // 每轮对话后：
 *   ks.onConversationTurn(userMsg, aiResp);
 *   // 构建提示词：
 *   const ctx = ks.buildPromptContext();
 */

import { getStorageEngine } from './storage/StorageEngine.js';
import { getCapacityManager } from './storage/CapacityManager.js';
import { isMigrationNeeded, runMigration } from './storage/Migration.js';
import { getExtractionEngine } from './extraction/ExtractionEngine.js';
import { getKnowledgeGraph } from './graph/KnowledgeGraph.js';
import { getProfileModel } from './profiles/ProfileModel.js';
import { AnalysisScheduler } from './analysis/AnalysisScheduler.js';

class KnowledgeSystem {
  constructor(modelAdapter) {
    this._modelAdapter = modelAdapter;
    this._storage = getStorageEngine();
    this._capacityManager = getCapacityManager(this._storage);
    this._graph = getKnowledgeGraph(this._storage);
    this._profileModel = getProfileModel(this._storage, this._graph);
    this._extractionEngine = null; // 延迟初始化，需要 modelAdapter
    this._scheduler = new AnalysisScheduler(this._storage);
    this._initialized = false;
  }

  /** 初始化知识系统 */
  async initialize() {
    if (this._initialized) return;

    // 1. 确保存储引擎已加载
    this._storage.initialize();

    // 2. 检查并执行数据迁移
    if (isMigrationNeeded()) {
      console.log('[KnowledgeSystem] 检测到旧版数据，开始迁移...');
      const result = runMigration();
      console.log('[KnowledgeSystem] 迁移完成:', result);
    }

    // 3. 初始化提取引擎（需要 modelAdapter）
    if (this._modelAdapter) {
      this._extractionEngine = getExtractionEngine(this._modelAdapter);
    }

    // 4. 设置空闲检测
    this._scheduler.setupIdleDetection();

    // 5. 打印初始统计
    const stats = this.getStats();
    if (stats.totalEntities > 0) {
      console.log('[KnowledgeSystem] 已就绪:', stats);
    }

    this._initialized = true;
  }

  /**
   * 每轮对话后调用。
   * @param {string} userMessage - 用户消息
   * @param {string} aiResponse - AI回复
   * @param {object} options
   * @returns {Promise<object|null>}
   */
  async onConversationTurn(userMessage, aiResponse, options = {}) {
    if (!this._extractionEngine) {
      console.warn('[KnowledgeSystem] 提取引擎未初始化');
      return null;
    }

    // LLM提取（去抖批处理，不阻塞）
    const result = await this._extractionEngine.extract(userMessage, aiResponse, options);

    // 通知分析调度器
    if (result) {
      const entityCount = (result.profile_updates?.length || 0) +
        (result.memories?.length || 0) +
        (result.lessons?.length || 0) +
        (result.psychological_observations?.length || 0);
      this._scheduler.notifyNewData(entityCount);
    }

    return result;
  }

  /**
   * 构建提示词上下文（供 promptBuilder 使用）。
   */
  buildPromptContext() {
    return {
      profile: this._profileModel.getPromptSection(0.6),
      memories: this._getHotMemories(10),
      lessons: this._getRecentLessons(3),
    };
  }

  /** 获取画像仪表板数据 */
  getProfileDashboard() {
    return this._profileModel.getDashboard();
  }

  /** 获取图谱可视化数据 */
  getGraphVisualization(maxNodes = 500) {
    return this._graph.exportForVisualization(maxNodes);
  }

  /** 获取图谱摘要 */
  getGraphSummary() {
    return this._graph.getSummary();
  }

  /** 获取系统统计 */
  getStats() {
    const storageStats = this._storage.getStats();
    const extractionStats = this._extractionEngine?.getStats() || {};

    return {
      totalEntities: storageStats.entityCount,
      totalRelations: storageStats.relationCount,
      typeCounts: storageStats.typeCounts,
      estimatedSize: this._capacityManager.getUsage(),
      extractionCache: extractionStats,
    };
  }

  /** 清空所有知识数据 */
  clearAll() {
    this._storage.clearAll();
  }

  /** 导出知识数据 */
  exportData() {
    return this._storage.exportData();
  }

  /** 导入知识数据 */
  importData(data) {
    this._storage.importData(data);
  }

  /* ---------- 私有方法 ---------- */

  _getHotMemories(limit) {
    const memories = this._storage.queryEntities({ type: 'memory' })
      .filter(m => m.level === 'hot')
      .sort((a, b) => (b.importance || 0) - (a.importance || 0))
      .slice(0, limit);
    return memories.map(m => m.content);
  }

  _getRecentLessons(limit) {
    const lessons = this._storage.queryEntities({ type: 'lesson' })
      .filter(l => l.isMistake)
      .sort((a, b) => (b._updatedAt || 0) - (a._updatedAt || 0))
      .slice(0, limit);
    return lessons.map(l => l.context || l.pattern || '');
  }
}

/** 单例 */
let _instance = null;

export function getKnowledgeSystem(modelAdapter) {
  if (!_instance) {
    _instance = new KnowledgeSystem(modelAdapter || null);
  }
  return _instance;
}

/** @internal 测试用：重置单例 */
export function _resetKnowledgeSystemForTest() {
  _instance = null;
}

export { KnowledgeSystem };
export default KnowledgeSystem;
