/**
 * ExtractionCache — 提取去重缓存和去抖控制。
 *
 * 1. 语义哈希缓存：相同消息对不重复提取（基于内容哈希）
 * 2. 去抖批处理：快速连续消息合并为一次批量提取（2秒窗口）
 * 3. 每日token预算跟踪
 */

const DAILY_TOKEN_BUDGET = 50000; // 每天用于知识提取的token上限（可配置）
const DEBOUNCE_WINDOW_MS = 2000;   // 去抖窗口2秒
const MAX_BATCH_SIZE = 5;           // 单次批量最多5轮

class ExtractionCache {
  constructor() {
    /** @type {Map<string, { result: object, timestamp: number }>} */
    this._cache = new Map();
    this._maxCacheSize = 200;  // 最多缓存200条

    /** 去抖状态 */
    this._pendingPairs = [];
    this._debounceTimer = null;
    this._resolveQueue = [];

    /** 每日token用量 */
    this._todayTokens = 0;
    this._todayDate = this._getDateKey();
  }

  /** 生成消息对的内容哈希 */
  hashMessagePair(userMessage, aiResponse) {
    const content = `${userMessage}|||${aiResponse}`;
    // 简单DJB2哈希（轻量、快速，不需要加密级安全）
    let hash = 5381;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) + hash + content.charCodeAt(i)) | 0;
    }
    return 'ext_' + (hash >>> 0).toString(36);
  }

  /** 检查缓存中是否已有此消息对的提取结果 */
  getCached(userMessage, aiResponse) {
    const hash = this.hashMessagePair(userMessage, aiResponse);
    const entry = this._cache.get(hash);
    if (entry) {
      // 缓存24小时有效
      if (Date.now() - entry.timestamp < 24 * 60 * 60 * 1000) {
        return entry.result;
      }
      this._cache.delete(hash);
    }
    return null;
  }

  /** 存入缓存 */
  setCache(userMessage, aiResponse, result) {
    const hash = this.hashMessagePair(userMessage, aiResponse);
    this._cache.set(hash, { result, timestamp: Date.now() });

    // LRU: 超过最大缓存数时删除最旧的一半
    if (this._cache.size > this._maxCacheSize) {
      const entries = [...this._cache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, Math.floor(this._maxCacheSize / 2));
      for (const [key] of toRemove) {
        this._cache.delete(key);
      }
    }
  }

  /**
   * 去抖提取：将快速连续的消息合并为批量提取。
   *
   * @param {string} userMessage
   * @param {string} aiResponse
   * @param {function} extractFn - 实际提取函数 (pairs) => Promise<result>
   * @returns {Promise<object>}
   */
  debouncedExtract(userMessage, aiResponse, extractFn) {
    // 先检查缓存
    const cached = this.getCached(userMessage, aiResponse);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve) => {
      this._pendingPairs.push({ userMessage, aiResponse });
      this._resolveQueue.push(resolve);

      // 清除旧的定时器
      if (this._debounceTimer) {
        clearTimeout(this._debounceTimer);
      }

      // 设置新的去抖定时器
      this._debounceTimer = setTimeout(async () => {
        const pairs = this._pendingPairs.splice(0);
        const resolvers = this._resolveQueue.splice(0);
        this._debounceTimer = null;

        if (pairs.length === 0) return;

        // 限制批量大小
        const batchPairs = pairs.slice(0, MAX_BATCH_SIZE);

        try {
          const result = await extractFn(batchPairs);

          // 为每个消息对缓存结果（如果是批量，使用批量结果）
          for (const pair of batchPairs) {
            // 批量提取时，所有pair共享同一个结果
            this.setCache(pair.userMessage, pair.aiResponse, result);
          }

          // 通知所有等待者
          for (const resolveFn of resolvers) {
            resolveFn(result);
          }
        } catch (e) {
          // 失败时也要通知所有等待者
          for (const resolveFn of resolvers) {
            resolveFn(null); // null表示提取失败，调用方应降级处理
          }
        }
      }, DEBOUNCE_WINDOW_MS);
    });
  }

  /** 强制刷新待处理的提取（用于应用关闭前） */
  flushPending() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;

      const resolvers = this._resolveQueue.splice(0);
      this._pendingPairs = [];

      for (const resolveFn of resolvers) {
        resolveFn(null);
      }
    }
  }

  /** 跟踪 token 用量 */
  trackTokenUsage(tokens) {
    const today = this._getDateKey();
    if (today !== this._todayDate) {
      this._todayTokens = 0;
      this._todayDate = today;
    }
    this._todayTokens += tokens;
  }

  /** 检查是否超出每日预算 */
  isOverBudget() {
    const today = this._getDateKey();
    if (today !== this._todayDate) {
      this._todayTokens = 0;
      this._todayDate = today;
    }
    return this._todayTokens >= DAILY_TOKEN_BUDGET;
  }

  /** 获取剩余预算 */
  getRemainingBudget() {
    const today = this._getDateKey();
    if (today !== this._todayDate) return DAILY_TOKEN_BUDGET;
    return Math.max(0, DAILY_TOKEN_BUDGET - this._todayTokens);
  }

  /** 设置每日预算 */
  setDailyBudget(tokens) {
    // DAILY_TOKEN_BUDGET 是const，这里允许运行时覆盖
    // （通过修改实例属性实现）
    this._customBudget = tokens;
  }

  _getBudget() {
    return this._customBudget || DAILY_TOKEN_BUDGET;
  }

  _getDateKey() {
    return new Date().toISOString().slice(0, 10);
  }

  /** 获取缓存统计 */
  getStats() {
    return {
      cacheSize: this._cache.size,
      pendingCount: this._pendingPairs.length,
      todayTokens: this._todayTokens,
      budgetRemaining: this.getRemainingBudget(),
    };
  }

  /** 清空缓存（测试用） */
  clear() {
    this._cache.clear();
    this._pendingPairs = [];
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this._resolveQueue = [];
  }
}

/** 单例 */
let _instance = null;

export function getExtractionCache() {
  if (!_instance) {
    _instance = new ExtractionCache();
  }
  return _instance;
}

export { ExtractionCache, DAILY_TOKEN_BUDGET };
export default ExtractionCache;
