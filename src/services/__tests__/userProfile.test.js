import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadProfile,
  getField,
  setField,
  deleteField,
  getAllFields,
  applyDiff,
  extractProfileDiff,
  getProfileContext,
} from '../userProfile';

describe('userProfile', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadProfile', () => {
    it('返回空 profile 当无数据时', () => {
      const p = loadProfile();
      expect(p.fields).toEqual({});
      expect(p.updatedAt).toBe(0);
    });

    it('localStorage 损坏时返回空 profile', () => {
      localStorage.setItem('cc_user_profile', 'bad json');
      const p = loadProfile();
      expect(p.fields).toEqual({});
    });
  });

  describe('setField / getField', () => {
    it('设置并读取字段', () => {
      setField('姓名', '小明');
      expect(getField('姓名')).toBe('小明');
    });

    it('空值删除字段', () => {
      setField('姓名', '小明');
      setField('姓名', '');
      expect(getField('姓名')).toBeNull();
    });

    it('null 值删除字段', () => {
      setField('姓名', '小明');
      setField('姓名', null);
      expect(getField('姓名')).toBeNull();
    });

    it('空数组删除字段', () => {
      setField('技能', ['js']);
      setField('技能', []);
      expect(getField('技能')).toBeNull();
    });

    it('不存在的字段返回 null', () => {
      expect(getField('不存在的')).toBeNull();
    });
  });

  describe('deleteField', () => {
    it('删除字段', () => {
      setField('城市', '北京');
      deleteField('城市');
      expect(getField('城市')).toBeNull();
    });
  });

  describe('getAllFields', () => {
    it('返回所有字段的浅拷贝', () => {
      setField('a', 1);
      setField('b', 2);
      const fields = getAllFields();
      expect(fields).toEqual({ a: 1, b: 2 });
    });
  });

  describe('applyDiff', () => {
    it('add 新增字段', () => {
      applyDiff({ add: { '姓名': '小红' } });
      expect(getField('姓名')).toBe('小红');
    });

    it('add 合并数组字段（去重）', () => {
      setField('技能', ['js', 'python']);
      applyDiff({ add: { '技能': ['python', 'go'] } });
      expect(getField('技能')).toEqual(['js', 'python', 'go']);
    });

    it('add 向数组追加字符串', () => {
      setField('偏好', ['简洁']);
      applyDiff({ add: { '偏好': '表格展示' } });
      expect(getField('偏好')).toContain('表格展示');
    });

    it('update 覆盖字段', () => {
      setField('版本', 'v1');
      applyDiff({ update: { '版本': 'v2' } });
      expect(getField('版本')).toBe('v2');
    });

    it('append 向数组字段追加', () => {
      setField('偏好', ['简洁']);
      applyDiff({ append: { '偏好': '详细' } });
      expect(getField('偏好')).toEqual(['简洁', '详细']);
    });

    it('append 在字段不存在时创建数组', () => {
      applyDiff({ append: { '兴趣': '游戏' } });
      expect(getField('兴趣')).toEqual(['游戏']);
    });

    it('append 单值字段转为数组', () => {
      setField('备注', 'old');
      applyDiff({ append: { '备注': 'new' } });
      expect(Array.isArray(getField('备注'))).toBe(true);
      expect(getField('备注')).toContain('old');
      expect(getField('备注')).toContain('new');
    });

    it('remove 删除字段', () => {
      setField('temp', 'x');
      applyDiff({ remove: ['temp'] });
      expect(getField('temp')).toBeNull();
    });

    it('空 diff 不报错', () => {
      expect(() => applyDiff(null)).not.toThrow();
      expect(() => applyDiff({})).not.toThrow();
    });
  });

  describe('extractProfileDiff', () => {
    it('提取姓名', () => {
      const diff = extractProfileDiff('我叫张三', '');
      expect(diff.add['姓名']).toBe('张三');
    });

    it('提取性别', () => {
      const diff = extractProfileDiff('我是一个男生', '');
      expect(diff.add['性别']).toBe('男生');
    });

    it('提取偏好', () => {
      const diff = extractProfileDiff('我喜欢简洁的回复', '');
      expect(diff.append['偏好']).toContain('简洁的回复');
    });

    it('提取不喜欢', () => {
      const diff = extractProfileDiff('我不喜欢啰嗦的', '');
      expect(diff.append['偏好']).toContain('啰嗦的');
    });

    it('提取回复风格偏好 — 太啰嗦', () => {
      const diff = extractProfileDiff('你太啰嗦了', '');
      expect(diff.append['偏好']).toContain('回复简洁');
    });

    it('提取技能', () => {
      const diff = extractProfileDiff('我擅长React和Python', '');
      expect(diff.append['技能']).toBeDefined();
    });

    it('无有效信息返回 null', () => {
      const diff = extractProfileDiff('嗯', '好的');
      expect(diff).toBeNull();
    });
  });

  describe('getProfileContext', () => {
    it('空画像返回空字符串', () => {
      expect(getProfileContext()).toBe('');
    });

    it('包含用户画像标题', () => {
      setField('姓名', '小明');
      expect(getProfileContext()).toContain('用户画像');
      expect(getProfileContext()).toContain('姓名');
      expect(getProfileContext()).toContain('小明');
    });

    it('数组字段用顿号连接', () => {
      setField('技能', ['React', 'Python', 'Go']);
      const ctx = getProfileContext();
      expect(ctx).toContain('React');
      expect(ctx).toContain('Python');
      expect(ctx).toContain('Go');
    });
  });
});
