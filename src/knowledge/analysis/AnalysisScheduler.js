/**
 * AnalysisScheduler — 分析归纳调度器。
 *
 * 在以下时机触发分析：
 * 1. 每10条新提取触发轻量去重
 * 2. 用户空闲30秒后触发LLM归纳
 * 3. 每50条消息触发心理画像更新
 *
 * 所有分析遵循每日token预算。
 */

import { getStorageEngine } from '../storage/StorageEngine.js';
import { getCapacityManager } from '../storage/CapacityManager.js';
import { getExtractionCache } from '../extraction/ExtractionCache.js';

const LIGHT_ANALYSIS_INTERVAL = 10;   // 每N条新实体触发去重
const DEEP_ANALYSIS_INTERVAL = 50;    // 每N条触发心理画像更新
const IDLE_TRIGGER_MS = 30000;        // 空闲30秒触发

class AnalysisScheduler {
  constructor(storage) {
    this._storage = storage || getStorageEngine();
    this._capacityManager = getCapacityManager(this._storage);
    this._cache = getExtractionCache();
    this._newEntityCount = 0;
    this._totalExtractions = 0;
    this._lastAnalysisTime = 0;
    this._idleTimer = null;
    this._analysisInProgress = false;
  }

  /** 通知有新数据写入 */
  notifyNewData(count = 1) {
    this._newEntityCount += count;
    this._totalExtractions += count;

    // 检查是否需要轻量分析
    if (this._newEntityCount >= LIGHT_ANALYSIS_INTERVAL) {
      this._newEntityCount = 0;
      this._scheduleLightAnalysis();
    }

    // 检查是否需要深度分析
    if (this._totalExtractions > 0 && this._totalExtractions % DEEP_ANALYSIS_INTERVAL === 0) {
      this._scheduleDeepAnalysis();
    }
  }

  /** 通知用户空闲 */
  notifyUserIdle() {
    if (this._analysisInProgress) return;

    // 避免频繁触发（至少间隔5分钟）
    if (Date.now() - this._lastAnalysisTime < 5 * 60 * 1000) return;

    this._scheduleLightAnalysis();
  }

  /** 安排轻量分析（去重+压缩） */
  _scheduleLightAnalysis() {
    if (this._analysisInProgress) return;
    this._analysisInProgress = true;
    this._lastAnalysisTime = Date.now();

    // 使用 setTimeout 避免阻塞主线程
    setTimeout(() => {
      try {
        // 检查预算
        if (this._cache.isOverBudget()) {
          this._analysisInProgress = false;
          return;
        }

        // 运行去重和压缩
        const result = this._capacityManager.compact();

        if (result.merged > 0) {
          console.log(`[Analysis] 压缩完成: 合并${result.merged}条`);
        }

        this._storage.tryPersist();
      } catch (e) {
        console.warn('[Analysis] 轻量分析失败:', e);
      } finally {
        this._analysisInProgress = false;
      }
    }, 100);
  }

  /** 安排深度分析（心理画像更新） — 需要LLM调用，仅在使用API时触发 */
  _scheduleDeepAnalysis() {
    // 深度分析依赖LLM，由外部注入回调
    if (this._onDeepAnalysis) {
      this._onDeepAnalysis();
    }
  }

  /** 注册深度分析回调（由KnowledgeSystem注入） */
  onDeepAnalysis(callback) {
    this._onDeepAnalysis = callback;
  }

  /** 设置空闲检测 */
  setupIdleDetection() {
    if (typeof document === 'undefined') return;

    let idleTimer;
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        this.notifyUserIdle();
      }, IDLE_TRIGGER_MS);
    };

    document.addEventListener('mousemove', resetIdle, { passive: true });
    document.addEventListener('keydown', resetIdle, { passive: true });
    document.addEventListener('click', resetIdle, { passive: true });

    resetIdle();
  }

  /** 获取调度统计 */
  getStats() {
    return {
      newEntityCount: this._newEntityCount,
      totalExtractions: this._totalExtractions,
      lastAnalysisTime: this._lastAnalysisTime,
      analysisInProgress: this._analysisInProgress,
    };
  }

  /** 周度摘要生成（每周日凌晨3点） */
  scheduleWeeklySummary() {
    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + (7 - now.getDay()) % 7);
    nextSunday.setHours(3, 0, 0, 0);
    if (nextSunday <= now) nextSunday.setDate(nextSunday.getDate() + 7);

    const delay = nextSunday - now;
    setTimeout(() => {
      this._generateWeeklySummary();
      setInterval(() => this._generateWeeklySummary(), 7 * 24 * 3600 * 1000);
    }, delay);

    console.log(`[Analysis] 周度摘要已调度: ${nextSunday.toLocaleString()}`);
  }

  _generateWeeklySummary() {
    try {
      const entities = this._storage.queryEntities();
      const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
      const newEntities = entities.filter(e => (e.createdAt || 0) > weekAgo);

      const summary = {
        date: new Date().toISOString(),
        newEntityCount: newEntities.length,
        totalEntityCount: entities.length,
        topTypes: this._countTypes(newEntities),
        archivedCount: entities.filter(e => e.level === 'archived').length,
      };

      try { localStorage.setItem('cc_weekly_summary', JSON.stringify(summary)); } catch {}
      console.log(`[Analysis] 周度摘要已生成: ${newEntities.length}新实体/${entities.length}总计`);
    } catch (e) {
      console.warn('[Analysis] 周度摘要失败:', e);
    }
  }

  _countTypes(entities) {
    const counts = {};
    for (const e of entities) {
      const t = e.type || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}(${v})`);
  }

  /** 获取最近周度摘要 */
  static getWeeklySummary() {
    try {
      const raw = localStorage.getItem('cc_weekly_summary');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
}

export { AnalysisScheduler, LIGHT_ANALYSIS_INTERVAL, DEEP_ANALYSIS_INTERVAL };
export default AnalysisScheduler;
