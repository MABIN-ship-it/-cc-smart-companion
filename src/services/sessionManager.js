/**
 * @typedef {{ id: string, firstMsg: string, messages: Array<{role: string, content: string}>, createdAt: number, updatedAt?: number }} Session
 */

const STORAGE_KEY = 'cc_sessions';
const MAX_SESSIONS = 10;
const SESSION_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;

/** @returns {Session[]} */
export function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** @param {Session[]} sessions */
export function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

/**
 * @param {string} firstMsg
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Session}
 */
export function createSessionObj(firstMsg, messages) {
  return {
    id: `s${Date.now()}`,
    firstMsg,
    messages: [...messages],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * @param {Session[]} sessions
 * @param {string} id
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Session[]}
 */
export function updateSession(sessions, id, messages) {
  const idx = sessions.findIndex(s => s.id === id);
  if (idx === -1) return sessions;
  const updated = [...sessions];
  updated[idx] = { ...updated[idx], messages: [...messages] };
  return updated;
}

/** @param {Session[]} sessions @returns {Session[]} */
export function trimSessions(sessions) {
  if (sessions.length <= MAX_SESSIONS) return sessions;
  return sessions.slice(sessions.length - MAX_SESSIONS);
}

/**
 * @param {Session[]} sessions
 * @param {string} id
 * @returns {Session[]}
 */
export function deleteSession(sessions, id) {
  return sessions.filter(s => s.id !== id);
}

/** 清理超过7天未更新的过期会话 @returns {number} 清理掉的会话数量 */
export function cleanExpiredSessions() {
  const sessions = loadSessions();
  const valid = sessions.filter(s => {
    const updatedAt = s.updatedAt || s.createdAt;
    return (Date.now() - updatedAt) < SESSION_EXPIRE_MS;
  });
  const removed = sessions.length - valid.length;
  if (removed > 0) saveSessions(valid);
  return removed;
}

/**
 * 更新会话最后活跃时间
 * @param {Session[]} sessions
 * @param {string} id
 * @returns {Session[]}
 */
export function touchSession(sessions, id) {
  const idx = sessions.findIndex(s => s.id === id);
  if (idx === -1) return sessions;
  const updated = [...sessions];
  updated[idx] = { ...updated[idx], updatedAt: Date.now() };
  return updated;
}

/**
 * 按首条消息查找会话
 * @param {Session[]} sessions
 * @param {string} firstMsg
 * @returns {Session|null}
 */
export function findSessionByFirstMsg(sessions, firstMsg) {
  return sessions.find(s => s.firstMsg === firstMsg) || null;
}
