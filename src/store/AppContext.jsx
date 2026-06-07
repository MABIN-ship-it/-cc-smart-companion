import { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { loadSessions, saveSessions, createSessionObj, updateSession, trimSessions, deleteSession } from '../services/sessionManager';

const AppContext = createContext(null);

// 启动时预加载——在第一次渲染之前就把状态恢复好
const _preloadSessions = loadSessions();
const _preloadLastId = localStorage.getItem('cc_active_session_id');
const _preloadActiveId = _preloadLastId && _preloadSessions.some(s => s.id === _preloadLastId)
  ? _preloadLastId
  : (_preloadSessions.length > 0
    ? _preloadSessions.reduce((a, b) => (a.updatedAt || a.createdAt) > (b.updatedAt || b.createdAt) ? a : b).id
    : null);
const _preloadMessages = _preloadActiveId
  ? (_preloadSessions.find(s => s.id === _preloadActiveId)?.messages || [])
  : [];

const initialState = {
  stage: 'chat',
  personality: {
    warmth: 0.7,
    humor: 0.5,
    proactive: 0.6,
    concise: 0.5,
  },
  messages: _preloadMessages,
  memories: [],
  isProcessing: false,
  voiceEnabled: true,
  memoryPanelOpen: false,
  personalityPanelOpen: false,
  currentProject: localStorage.getItem('cc_workspace') || null,
  apiKey: (() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('cc_api_key_')) { const v = localStorage.getItem(k); if (v) return v; } } return ''; })(),
  sessionStart: Date.now(),
  inputMode: 'execute',
  sessions: _preloadSessions,
  activeSessionId: _preloadActiveId,
  sessionsPanelOpen: false,
  feishuStatus: 'disconnected',
  toolboxPanelOpen: false,
  proactivePrompts: [],
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_STAGE':
      return { ...state, stage: action.payload };
    case 'ADD_MESSAGE': {
      const msg = action.payload;
      if (!msg.id) {
        msg.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      }
      return { ...state, messages: [...state.messages, msg] };
    }
    case 'REMOVE_MESSAGE':
      return { ...state, messages: state.messages.filter(m => m.id !== action.payload) };
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload };
    case 'TOGGLE_VOICE':
      return { ...state, voiceEnabled: !state.voiceEnabled };
    case 'CLOSE_PANELS':
      return { ...state, personalityPanelOpen: false, memoryPanelOpen: false, sessionsPanelOpen: false, toolboxPanelOpen: false };
    case 'TOGGLE_MEMORY_PANEL': {
      const opening = !state.memoryPanelOpen;
      return { ...state, memoryPanelOpen: opening, personalityPanelOpen: opening ? false : state.personalityPanelOpen, sessionsPanelOpen: opening ? false : state.sessionsPanelOpen };
    }
    case 'TOGGLE_PERSONALITY_PANEL': {
      const opening = !state.personalityPanelOpen;
      return { ...state, personalityPanelOpen: opening, memoryPanelOpen: opening ? false : state.memoryPanelOpen, sessionsPanelOpen: opening ? false : state.sessionsPanelOpen };
    }
    case 'SET_MEMORIES':
      return { ...state, memories: action.payload };
    case 'ADD_MEMORY':
      return { ...state, memories: [...state.memories, action.payload] };
    case 'REMOVE_MEMORY':
      return { ...state, memories: state.memories.filter(m => m.id !== action.payload) };
    case 'SET_API_KEY':
      return { ...state, apiKey: action.payload };
    case 'UPDATE_PERSONALITY':
      return { ...state, personality: { ...state.personality, ...action.payload } };
    case 'SET_MODEL':
      return { ...state, currentModel: action.payload };
    case 'SET_CURRENT_PROJECT': {
      const p = action.payload;
      if (p) {
        localStorage.setItem('cc_workspace', p);
      } else {
        localStorage.removeItem('cc_workspace');
      }
      return { ...state, currentProject: p };
    }
    case 'SET_INPUT_MODE':
      return { ...state, inputMode: action.payload };
    case 'RESET_SESSION':
      return { ...state, sessionStart: Date.now() };
    case 'LOAD_SESSIONS': {
      const sessions = loadSessions();
      const lastId = localStorage.getItem('cc_active_session_id');
      let activeSessionId = lastId && sessions.some(s => s.id === lastId) ? lastId : null;
      // 回退：没有保存过活跃会话时，用最近创建的会话
      if (!activeSessionId && sessions.length > 0) {
        const latest = sessions.reduce((a, b) => (a.updatedAt || a.createdAt) > (b.updatedAt || b.createdAt) ? a : b);
        activeSessionId = latest.id;
      }
      return { ...state, sessions, activeSessionId };
    }
    case 'NEW_SESSION': {
      const firstMsg = action.payload || '新对话';
      let sessions = [...state.sessions, createSessionObj(firstMsg, [])];
      sessions = trimSessions(sessions);
      saveSessions(sessions);
      const newId = sessions[sessions.length - 1].id;
      localStorage.setItem('cc_active_session_id', newId);
      return { ...state, sessions, activeSessionId: newId };
    }
    case 'START_NEW_CHAT': {
      let sessions = state.sessions;
      if (state.activeSessionId && state.messages.length > 0) {
        sessions = updateSession(sessions, state.activeSessionId, state.messages);
      }
      saveSessions(sessions);
      localStorage.removeItem('cc_active_session_id');
      return { ...state, sessions, messages: [], activeSessionId: null };
    }
    case 'SWITCH_SESSION': {
      const targetId = action.payload;
      const target = state.sessions.find(s => s.id === targetId);
      if (!target) return state;
      let sessions = state.sessions;
      if (state.activeSessionId && state.messages.length > 0) {
        sessions = updateSession(sessions, state.activeSessionId, state.messages);
      }
      saveSessions(sessions);
      localStorage.setItem('cc_active_session_id', targetId);
      return {
        ...state,
        sessions,
        activeSessionId: targetId,
        messages: target.messages,
      };
    }
    case 'SAVE_SESSION': {
      if (!state.activeSessionId || state.messages.length === 0) return state;
      let sessions = updateSession(state.sessions, state.activeSessionId, state.messages);
      saveSessions(sessions);
      return { ...state, sessions };
    }
    case 'DELETE_SESSION': {
      let sessions = deleteSession(state.sessions, action.payload);
      saveSessions(sessions);
      const isActive = state.activeSessionId === action.payload;
      return {
        ...state,
        sessions,
        activeSessionId: isActive ? null : state.activeSessionId,
        messages: isActive ? [] : state.messages,
      };
    }
    case 'TOGGLE_SESSIONS_PANEL': {
      const opening = !state.sessionsPanelOpen;
      return {
        ...state,
        sessionsPanelOpen: opening,
        personalityPanelOpen: opening ? false : state.personalityPanelOpen,
        memoryPanelOpen: opening ? false : state.memoryPanelOpen,
      };
    }
    case 'TOGGLE_TOOLBOX': {
      const opening = !state.toolboxPanelOpen;
      return { ...state, toolboxPanelOpen: opening, personalityPanelOpen: opening ? false : state.personalityPanelOpen, memoryPanelOpen: opening ? false : state.memoryPanelOpen, sessionsPanelOpen: opening ? false : state.sessionsPanelOpen };
    }
    case 'SET_FEISHU_STATUS':
      return { ...state, feishuStatus: action.payload };
    case 'SET_PROACTIVE_PROMPTS':
      return { ...state, proactivePrompts: action.payload };
    case 'DISMISS_PROACTIVE_PROMPT':
      return { ...state, proactivePrompts: state.proactivePrompts.filter(p => p.id !== action.payload) };
    case 'ACCEPT_PROACTIVE_TASK': {
      const tasks = state.proactivePrompts.map(p =>
        p.id === action.payload ? { ...p, status: 'accepted' } : p
      );
      return { ...state, proactivePrompts: tasks };
    }
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const wrappedDispatch = useCallback((action) => {
    if (typeof action === 'function') {
      return action(wrappedDispatch, () => stateRef.current);
    }
    return dispatch(action);
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch: wrappedDispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
