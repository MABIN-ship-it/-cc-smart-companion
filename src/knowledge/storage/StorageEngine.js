/**
 * StorageEngine — 统一 localStorage 抽象层。
 *
 * 将17个分散的 localStorage 键收敛为1-3个结构化存储桶，
 * 提供版本化、带统计的持久化接口。所有知识服务通过此引擎读写。
 */

const MAIN_KEY = 'cc_knowledge_v2';
const OBSERVATIONS_KEY = 'cc_observations_v2';
const SCHEMA_VERSION = 2;

const STORE_NAMES = [
  'entities',   // 所有知识实体（画像/记忆/教训/心理/项目/兴趣）
  'relations',  // 跨维度边
  'meta',       // 版本号、统计信息、迁移标记
];

/** @type {import('./StorageEngine').StorageEngine} */
class StorageEngine {
  constructor() {
    /** @type {Map<string, Map<string, any>>} */
    this._stores = new Map();
    this._dirty = false;
    this._initialized = false;
  }

  /** 初始化：从 localStorage 加载数据 */
  initialize() {
    if (this._initialized) return;

    try {
      const raw = localStorage.getItem(MAIN_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data._version === SCHEMA_VERSION) {
          for (const name of STORE_NAMES) {
            this._stores.set(name, new Map(Object.entries(data[name] || {})));
          }
        }
      }
    } catch (e) {
      console.warn('StorageEngine: 加载数据失败，使用空存储', e);
    }

    // 确保所有 store 都存在
    for (const name of STORE_NAMES) {
      if (!this._stores.has(name)) {
        this._stores.set(name, new Map());
      }
    }

    this._initialized = true;
  }

  /** 从 entities store 按 ID 读取实体 */
  getEntity(id) {
    const entities = this._stores.get('entities');
    return entities?.get(id) || null;
  }

  /** 写入实体到 entities store */
  putEntity(id, entity) {
    const entities = this._stores.get('entities');
    const _updatedAt = '_updatedAt' in entity ? entity._updatedAt : Date.now();
    entities.set(id, { ...entity, id, _updatedAt });
    this._dirty = true;
  }

  /** 删除实体 */
  removeEntity(id) {
    const entities = this._stores.get('entities');
    const existed = entities.has(id);
    if (existed) {
      entities.delete(id);
      // 同时删除该实体相关的所有边
      const relations = this._stores.get('relations');
      for (const [key, edge] of relations) {
        if (edge.source === id || edge.target === id) {
          relations.delete(key);
        }
      }
      this._dirty = true;
    }
    return existed;
  }

  /** 查询 entities（返回匹配的实体数组） */
  queryEntities(filter = {}) {
    const entities = this._stores.get('entities');
    const results = [];
    for (const [, entity] of entities) {
      let match = true;
      if (filter.type && entity.type !== filter.type) match = false;
      if (filter.category && entity.category !== filter.category) match = false;
      if (filter.minConfidence !== undefined && entity.confidence < filter.minConfidence) match = false;
      if (filter.minImportance !== undefined && entity.importance < filter.minImportance) match = false;
      if (match) results.push(entity);
    }
    // 按更新时间降序
    results.sort((a, b) => (b._updatedAt || 0) - (a._updatedAt || 0));
    return results;
  }

  /** 统计某类型实体的数量 */
  countEntities(type) {
    const entities = this._stores.get('entities');
    let count = 0;
    for (const [, entity] of entities) {
      if (entity.type === type) count++;
    }
    return count;
  }

  /** 写入关系边 */
  putRelation(id, edge) {
    const relations = this._stores.get('relations');
    // 存量边（同source+target+type）递增权重
    for (const [, existing] of relations) {
      if (existing.source === edge.source && existing.target === edge.target
          && existing.type === edge.type) {
        existing.weight = (existing.weight || 1) + 1;
        existing._updatedAt = Date.now();
        this._dirty = true;
        return;
      }
    }
    // 新边
    relations.set(id, { ...edge, id, weight: 1, _updatedAt: Date.now() });
    this._dirty = true;
  }

  /** 删除关系边 */
  removeRelation(id) {
    const relations = this._stores.get('relations');
    const existed = relations.has(id);
    if (existed) {
      relations.delete(id);
      this._dirty = true;
    }
    return existed;
  }

  /** 查询与某个实体相关的所有边 */
  queryRelations(nodeId, edgeType = null) {
    const relations = this._stores.get('relations');
    const results = [];
    for (const [, edge] of relations) {
      if ((edge.source === nodeId || edge.target === nodeId)) {
        if (edgeType && edge.type !== edgeType) continue;
        results.push(edge);
      }
    }
    return results;
  }

  /** 查找两个节点间的关系 */
  findRelation(sourceId, targetId, edgeType = null) {
    const relations = this._stores.get('relations');
    for (const [, edge] of relations) {
      if (edge.source === sourceId && edge.target === targetId) {
        if (edgeType && edge.type !== edgeType) continue;
        return edge;
      }
    }
    return null;
  }

  /** 读取 meta 值 */
  getMeta(key) {
    const meta = this._stores.get('meta');
    return meta?.get(key);
  }

  /** 写入 meta 值 */
  setMeta(key, value) {
    const meta = this._stores.get('meta');
    meta.set(key, value);
    this._dirty = true;
  }

  /** 获取原始对话观察（环形缓冲） */
  getRawObservations() {
    try {
      const raw = localStorage.getItem(OBSERVATIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /** 追加原始对话观察（环形缓冲，最多保留最近50轮） */
  appendRawObservation(observation) {
    const observations = this.getRawObservations();
    observations.push({
      ...observation,
      _recordedAt: Date.now(),
    });
    // 环形缓冲：保留最近50轮
    while (observations.length > 50) {
      observations.shift();
    }
    try {
      localStorage.setItem(OBSERVATIONS_KEY, JSON.stringify(observations));
    } catch (e) {
      console.warn('StorageEngine: 写入原始观察失败', e);
    }
  }

  /** 获取存储统计 */
  getStats() {
    const entities = this._stores.get('entities');
    const relations = this._stores.get('relations');

    const typeCounts = {};
    for (const [, entity] of entities) {
      typeCounts[entity.type] = (typeCounts[entity.type] || 0) + 1;
    }

    return {
      entityCount: entities.size,
      relationCount: relations.size,
      typeCounts,
      rawObservationCount: this.getRawObservations().length,
      estimatedSize: this._estimateSize(),
      dirty: this._dirty,
    };
  }

  /** 估算当前存储大小（字节） */
  _estimateSize() {
    try {
      const main = localStorage.getItem(MAIN_KEY) || '';
      const obs = localStorage.getItem(OBSERVATIONS_KEY) || '';
      return new Blob([main, obs]).size;
    } catch {
      return 0;
    }
  }

  /** 持久化到 localStorage */
  persist() {
    if (!this._dirty) return;

    const data = { _version: SCHEMA_VERSION };
    for (const [name, store] of this._stores) {
      data[name] = Object.fromEntries(store);
    }

    try {
      const json = JSON.stringify(data);
      localStorage.setItem(MAIN_KEY, json);
      this._dirty = false;
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        throw new Error('QUOTA_EXCEEDED');
      }
      throw e;
    }
  }

  /** 尝试持久化，配额不足时返回 false */
  tryPersist() {
    try {
      this.persist();
      return true;
    } catch (e) {
      if (e.message === 'QUOTA_EXCEEDED') {
        return false;
      }
      throw e;
    }
  }

  /** 清空所有数据 */
  clearAll() {
    for (const [, store] of this._stores) {
      store.clear();
    }
    this._dirty = true;
    this.persist();
    try {
      localStorage.removeItem(OBSERVATIONS_KEY);
    } catch {}
  }

  /** 导出所有数据为JSON（用于备份） */
  exportData() {
    this.initialize();
    return {
      _version: SCHEMA_VERSION,
      entities: Object.fromEntries(this._stores.get('entities')),
      relations: Object.fromEntries(this._stores.get('relations')),
      meta: Object.fromEntries(this._stores.get('meta')),
      observations: this.getRawObservations(),
    };
  }

  /** 从JSON导入数据（用于恢复） */
  importData(data) {
    if (!data || data._version !== SCHEMA_VERSION) {
      throw new Error('导入数据版本不匹配');
    }
    this._stores.set('entities', new Map(Object.entries(data.entities || {})));
    this._stores.set('relations', new Map(Object.entries(data.relations || {})));
    this._stores.set('meta', new Map(Object.entries(data.meta || {})));
    this._dirty = true;
    if (data.observations) {
      try {
        localStorage.setItem(OBSERVATIONS_KEY, JSON.stringify(data.observations));
      } catch {}
    }
    this.persist();
  }
}

/** 单例 */
let _instance = null;

export function getStorageEngine() {
  if (!_instance) {
    _instance = new StorageEngine();
    _instance.initialize();
  }
  return _instance;
}

/** @internal 测试用：重置单例 */
export function _resetStorageEngineForTest() {
  _instance = null;
}

export { StorageEngine };
export default StorageEngine;
