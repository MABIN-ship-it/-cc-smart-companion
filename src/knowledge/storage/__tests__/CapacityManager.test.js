import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageEngine } from '../StorageEngine.js';
import { CapacityManager, SOFT_LIMIT, HARD_LIMIT } from '../CapacityManager.js';

describe('CapacityManager', () => {
  let storage;
  let cm;

  beforeEach(() => {
    localStorage.clear();
    storage = new StorageEngine();
    storage.initialize();
    cm = new CapacityManager(storage);
  });

  describe('beforeWrite', () => {
    it('空存储返回 ok', () => {
      const result = cm.beforeWrite();
      expect(result.allowed).toBe(true);
      expect(result.level).toBe('ok');
    });

    it('超过硬限返回 critical', () => {
      vi.spyOn(storage, '_estimateSize').mockReturnValue(HARD_LIMIT + 100);
      const result = cm.beforeWrite();
      expect(result.allowed).toBe(false);
      expect(result.level).toBe('critical');
    });

    it('超过软限返回 warning 但允许写入', () => {
      vi.spyOn(storage, '_estimateSize').mockReturnValue(SOFT_LIMIT + 100);
      const result = cm.beforeWrite();
      expect(result.allowed).toBe(true);
      expect(result.level).toBe('warning');
    });
  });

  describe('evict', () => {
    it('淘汰冷记忆优先', () => {
      const oldTime = Date.now() - 100 * 24 * 60 * 60 * 1000; // 100天前

      storage.putEntity('cold1', {
        type: 'memory', level: 'cold', content: '旧记忆',
        _updatedAt: oldTime, createdAt: oldTime,
      });
      storage.putEntity('hot1', {
        type: 'memory', level: 'hot', content: '重要记忆',
        _updatedAt: Date.now(), createdAt: Date.now(),
      });

      // Mock: 首次返回超限值触发淘汰，然后返回小值模拟空间释放，保护热记忆
      let callCount = 0;
      vi.spyOn(storage, '_estimateSize').mockImplementation(() => {
        callCount++;
        return callCount <= 1 ? HARD_LIMIT + 100 : 100;
      });

      cm.evict();

      // 冷记忆被淘汰，热记忆保留
      expect(storage.getEntity('cold1')).toBeNull();
      expect(storage.getEntity('hot1')).toBeTruthy();
    });

    it('核心身份画像不被淘汰', () => {
      const oldTime = Date.now() - 200 * 24 * 60 * 60 * 1000;

      storage.putEntity('profile_name', {
        type: 'profile_fact', key: 'name', value: '张三',
        confidence: 0.9, _updatedAt: oldTime, createdAt: oldTime,
      });
      storage.putEntity('cold_memory', {
        type: 'memory', level: 'cold', content: '可淘汰',
        _updatedAt: oldTime, createdAt: oldTime,
      });

      let callCount = 0;
      vi.spyOn(storage, '_estimateSize').mockImplementation(() => {
        callCount++;
        return callCount <= 1 ? HARD_LIMIT + 100 : 100;
      });

      cm.evict();

      // 关键身份数据应保留（pinned）
      expect(storage.getEntity('profile_name')).toBeTruthy();
    });

    it('一次最多淘汰50条', () => {
      // 添加60条冷记忆
      for (let i = 0; i < 60; i++) {
        storage.putEntity(`cold_${i}`, {
          type: 'memory', level: 'cold', content: `记忆${i}`,
          _updatedAt: 1000 + i, createdAt: 1000 + i,
        });
      }

      // 始终超限，让evict打到上限
      vi.spyOn(storage, '_estimateSize').mockReturnValue(HARD_LIMIT + 100);

      const result = cm.evict();
      expect(result.evicted).toBeLessThanOrEqual(50);
      // 最多淘汰50条，剩余至少10条
      const remaining = storage.countEntities('memory');
      expect(remaining).toBeGreaterThanOrEqual(10);
    });
  });

  describe('compact', () => {
    it('合并重复的 profile_fact（保留confidence更高且更新的）', () => {
      const older = Date.now() - 10000;
      const newer = Date.now();

      storage.putEntity('pf1', {
        type: 'profile_fact', key: 'skill', value: 'JavaScript',
        confidence: 0.7, _updatedAt: older,
      });
      storage.putEntity('pf2', {
        type: 'profile_fact', key: 'skill', value: 'Python',
        confidence: 0.9, _updatedAt: newer,
      });

      const result = cm.compact();
      expect(result.merged).toBeGreaterThanOrEqual(1);

      const remaining = storage.getEntity('pf2');
      expect(remaining).toBeTruthy();
      expect(remaining.value).toBe('Python');
    });

    it('合并完全相同的 memory', () => {
      storage.putEntity('m1', {
        type: 'memory', content: '用户喜欢Python',
        _updatedAt: 1000,
      });
      storage.putEntity('m2', {
        type: 'memory', content: '用户喜欢Python',
        _updatedAt: 2000,
      });

      const result = cm.compact();
      expect(result.merged).toBeGreaterThanOrEqual(1);
      expect(storage.getEntity('m2')).toBeTruthy();
    });

    it('不同的 memory 不被合并', () => {
      storage.putEntity('m1', {
        type: 'memory', content: '用户喜欢Python',
        _updatedAt: 1000,
      });
      storage.putEntity('m2', {
        type: 'memory', content: '用户讨厌Java',
        _updatedAt: 2000,
      });

      cm.compact();
      expect(storage.countEntities('memory')).toBe(2);
    });
  });

  describe('getUsage', () => {
    it('返回当前用量估计', () => {
      storage.putEntity('test', { type: 'memory', content: 'x'.repeat(1000) });
      storage.persist();
      const usage = cm.getUsage();
      expect(typeof usage).toBe('number');
      expect(usage).toBeGreaterThan(0);
    });

    it('空存储用量接近0', () => {
      expect(cm.getUsage()).toBeLessThan(100);
    });
  });
});
