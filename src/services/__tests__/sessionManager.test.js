import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSessions,
  saveSessions,
  createSessionObj,
  updateSession,
  trimSessions,
  deleteSession,
} from '../sessionManager';

describe('sessionManager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadSessions', () => {
    it('返回空数组当无数据时', () => {
      expect(loadSessions()).toEqual([]);
    });

    it('返回已保存的会话', () => {
      const sessions = [{ id: 's1', firstMsg: 'hello', messages: [], createdAt: 123 }];
      saveSessions(sessions);
      expect(loadSessions()).toEqual(sessions);
    });

    it('localStorage 损坏时返回空数组', () => {
      localStorage.setItem('cc_sessions', 'not valid json');
      expect(loadSessions()).toEqual([]);
    });
  });

  describe('saveSessions', () => {
    it('保存并读取一致', () => {
      const sessions = [
        { id: 's1', firstMsg: 'test', messages: [{ role: 'user', content: 'hi' }], createdAt: 1000 },
      ];
      saveSessions(sessions);
      expect(loadSessions()).toEqual(sessions);
    });
  });

  describe('createSessionObj', () => {
    it('创建新会话对象', () => {
      const s = createSessionObj('你好', [{ role: 'user', content: '你好' }]);
      expect(s.id).toMatch(/^s\d+/);
      expect(s.firstMsg).toBe('你好');
      expect(s.messages).toHaveLength(1);
      expect(s.createdAt).toBeGreaterThan(0);
    });

    it('messages 是副本不是引用', () => {
      const msgs = [{ role: 'user', content: 'hi' }];
      const s = createSessionObj('hi', msgs);
      msgs.push({ role: 'assistant', content: 'hello' });
      expect(s.messages).toHaveLength(1);
    });
  });

  describe('updateSession', () => {
    it('更新已存在的会话', () => {
      const sessions = [createSessionObj('hi', [])];
      const newMsgs = [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi!' }];
      const updated = updateSession(sessions, sessions[0].id, newMsgs);
      expect(updated[0].messages).toEqual(newMsgs);
    });

    it('不存在的 id 返回原数组', () => {
      const sessions = [createSessionObj('hi', [])];
      expect(updateSession(sessions, 'nonexistent', [])).toEqual(sessions);
    });

    it('不修改原数组', () => {
      const sessions = [createSessionObj('hi', [])];
      const originalFirst = sessions[0];
      updateSession(sessions, sessions[0].id, [{ role: 'user', content: 'new' }]);
      expect(sessions[0]).toBe(originalFirst);
    });
  });

  describe('trimSessions', () => {
    it('不超限时不变', () => {
      const sessions = [
        createSessionObj('a', []),
        createSessionObj('b', []),
      ];
      expect(trimSessions(sessions)).toHaveLength(2);
    });

    it('超过 10 条时保留最近 10 条', () => {
      const sessions = Array.from({ length: 15 }, (_, i) => createSessionObj(`msg${i}`, []));
      expect(trimSessions(sessions)).toHaveLength(10);
    });

    it('恰好 10 条时不变', () => {
      const sessions = Array.from({ length: 10 }, (_, i) => createSessionObj(`msg${i}`, []));
      expect(trimSessions(sessions)).toHaveLength(10);
    });
  });

  describe('deleteSession', () => {
    it('删除指定会话', () => {
      const s1 = createSessionObj('a', []);
      // Date.now() 可能同毫秒内重复，手动确保 ID 唯一
      const s2 = { ...createSessionObj('b', []), id: s1.id + '_b' };
      const sessions = [s1, s2];
      const result = deleteSession(sessions, s1.id);
      expect(result).toHaveLength(1);
      expect(result[0].firstMsg).toBe('b');
    });

    it('不存在的 id 不变', () => {
      const sessions = [createSessionObj('a', [])];
      expect(deleteSession(sessions, 'nonexistent')).toHaveLength(1);
    });
  });
});
