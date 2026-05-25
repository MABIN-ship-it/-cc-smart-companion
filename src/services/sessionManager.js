/**
 * @typedef {{ id: string, firstMsg: string, messages: Array<{role: string, content: string}>, createdAt: number }} Session
 */

const STORAGE_KEY = 'cc_sessions';
const MAX_SESSIONS = 10;

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
