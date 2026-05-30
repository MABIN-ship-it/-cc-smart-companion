/**
 * CapacityManager — localStorage 配额监控与 LRU 淘汰策略。
 *
 * 软限 4MB（警告），硬限 4.5MB（强制淘汰）。
 * 淘汰优先级：冷记忆 > 旧教训 > 旧原始观察 > 旧画像事实
 * 核心身份画像（name, preferred_name）永不淘汰（pinned）。
 */

const SOFT_LIMIT = 4 * 1024 * 1024;   // 4MB
const HARD_LIMIT = 4.5 * 1024 * 1024; // 4.5MB

/** 被钉住的关键画像字段（永不淘汰） */
const PINNED_PROFILE_KEYS = new Set(['name', 'preferred_name']);

/** 淘汰优先级排序（数值越小越先被淘汰） */
const EVICTION_PRIORITY = {
  archived: -10,          // 归档数据最优先淘汰（仅空间不足时）
  cold_memory: 0,
  old_lesson: 10,
  old_observation: 20,
  warm_memory: 30,
  psych_observation: 40,
  old_profile_fact: 50,
  project_entity: 60,
  interest: 70,
  hot_memory: 80,
  core_profile: 90,
};

/** @type {import('./CapacityManager').CapacityManager} */
class CapacityManager {
  /**
   * @param {import('./StorageEngine').StorageEngine} storage
   */
  constructor(storage) {
    this._storage = storage;
  }

  /** 获取当前总用量估计（字节） */
  getUsage() {
    return this._storage._estimateSize();
  }

  /** 获取用量百分比（相对于硬限） */
  getUsagePercent() {
    return ((this.getUsage() / HARD_LIMIT) * 100).toFixed(1);
  }

  /**
   * 写入前检查。
   * @returns {{ allowed: boolean, level: 'ok'|'warning'|'critical', reason?: string }}
   */
  beforeWrite() {
    const usage = this.getUsage();

    if (usage >= HARD_LIMIT) {
      return {
        allowed: false,
        level: 'critical',
        reason: `存储空间已达上限 (${(usage / 1024 / 1024).toFixed(1)}MB / ${(HARD_LIMIT / 1024 / 1024).toFixed(1)}MB)`,
      };
    }

    if (usage >= SOFT_LIMIT) {
      return {
        allowed: true,
        level: 'warning',
        reason: `存储空间接近上限 (${(usage / 1024 / 1024).toFixed(1)}MB / ${(HARD_LIMIT / 1024 / 1024).toFixed(1)}MB)`,
      };
    }

    return { allowed: true, level: 'ok' };
  }

  /** 执行淘汰：释放空间直到用量降到软限以下 */
  evict() {
    const entities = this._queryEvictableEntities();
    if (entities.length === 0) return { evicted: 0, freedBytes: 0 };

    let evicted = 0;
    for (const entity of entities) {
      if (this.getUsage() < SOFT_LIMIT) break;

      // 删除实体及其关联边
      const relations = this._storage.queryRelations(entity.id);
      for (const rel of relations) {
        this._storage.removeRelation(rel.id);
      }
      this._storage.removeEntity(entity.id);
      evicted++;

      if (evicted >= 50) break; // 一次最多淘汰50条
    }

    this._storage.persist();

    return {
      evicted,
      freedBytes: 'unknown', // 精确计算开销大，给估算即可
      currentUsage: this.getUsage(),
    };
  }

  /** 收集可淘汰的实体，按优先级排序 */
  _queryEvictableEntities() {
    const all = this._storage.queryEntities();
    return all
      .filter(e => !this._isPinned(e))
      .map(e => ({ ...e, _evictPriority: this._getEvictPriority(e) }))
      .sort((a, b) => a._evictPriority - b._evictPriority);
  }

  /** 判断实体是否被钉住 */
  _isPinned(entity) {
    if (entity.type === 'profile_fact' && PINNED_PROFILE_KEYS.has(entity.key)) {
      return true;
    }
    return false;
  }

  /** 计算淘汰优先级 */
  _getEvictPriority(entity) {
    const now = Date.now();
    const age = now - (entity._updatedAt || entity.createdAt || now);
    const ageDays = age / (1000 * 60 * 60 * 24);

    switch (entity.type) {
      case 'memory':
        if (entity.level === 'cold') return EVICTION_PRIORITY.cold_memory;
        if (entity.level === 'warm' && ageDays > 60) return EVICTION_PRIORITY.cold_memory;
        if (entity.level === 'warm') return EVICTION_PRIORITY.warm_memory;
        if (entity.level === 'hot') return EVICTION_PRIORITY.hot_memory;
        return EVICTION_PRIORITY.warm_memory;

      case 'lesson':
        if (ageDays > 90) return EVICTION_PRIORITY.old_lesson;
        return EVICTION_PRIORITY.old_lesson + 5;

      case 'profile_fact':
        if (ageDays > 60 && entity.confidence < 0.5) return EVICTION_PRIORITY.old_profile_fact;
        return EVICTION_PRIORITY.core_profile;

      case 'psych_observation':
        if (ageDays > 30 && entity.confidence < 0.5) return EVICTION_PRIORITY.old_profile_fact;
        return EVICTION_PRIORITY.psych_observation;

      case 'project_entity':
        return EVICTION_PRIORITY.project_entity;

      case 'interest':
        if (entity.strength < 0.3) return EVICTION_PRIORITY.old_observation;
        return EVICTION_PRIORITY.interest;

      default:
        return 50;
    }
  }

  /** 压缩存储：尝试通过去重和 trim 减少占用 */
  compact() {
    const entities = this._storage.queryEntities();
    let merged = 0;

    // 合并重复的 profile_fact（同 key 保留最新的）
    const seenProfileKeys = new Map();
    for (const e of entities) {
      if (e.type !== 'profile_fact') continue;
      const existing = seenProfileKeys.get(e.key);
      if (existing) {
        // 保留 confidence 更高的那个，删除另一个
        if (e.confidence >= (existing.confidence || 0) && (e._updatedAt || 0) >= (existing._updatedAt || 0)) {
          this._storage.removeEntity(existing.id);
          seenProfileKeys.set(e.key, e);
        } else {
          this._storage.removeEntity(e.id);
        }
        merged++;
      } else {
        seenProfileKeys.set(e.key, e);
      }
    }

    // 合并 content 完全相同的 memory
    const seenContents = new Map();
    for (const e of this._storage.queryEntities({ type: 'memory' })) {
      const key = e.content?.trim().toLowerCase();
      if (!key) continue;
      const existing = seenContents.get(key);
      if (existing) {
        if ((e._updatedAt || 0) > (existing._updatedAt || 0)) {
          this._storage.removeEntity(existing.id);
          seenContents.set(key, e);
        } else {
          this._storage.removeEntity(e.id);
        }
        merged++;
      } else {
        seenContents.set(key, e);
      }
    }

    if (merged > 0) {
      this._storage.persist();
    }

    return {
      merged,
      currentUsage: this.getUsage(),
    };
  }
}

/** 单例 */
let _instance = null;

export function getCapacityManager(storage) {
  if (!_instance) {
    _instance = new CapacityManager(storage);
  }
  return _instance;
}

export { CapacityManager, SOFT_LIMIT, HARD_LIMIT };
export default CapacityManager;
