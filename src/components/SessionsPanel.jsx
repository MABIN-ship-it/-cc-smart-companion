import { useApp } from '../store/AppContext';

function formatTime(ts) {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 259200000) return `${Math.floor(diff / 86400000)}天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

export default function SessionsPanel() {
  const { state, dispatch } = useApp();

  const sessions = [...state.sessions].sort((a, b) => b.createdAt - a.createdAt);

  const handleSwitch = (sessionId) => {
    if (sessionId === state.activeSessionId) return;
    dispatch({ type: 'SWITCH_SESSION', payload: sessionId });
    dispatch({ type: 'TOGGLE_SESSIONS_PANEL' });
  };

  const handleDelete = (e, sessionId) => {
    e.stopPropagation();
    dispatch({ type: 'DELETE_SESSION', payload: sessionId });
  };

  const handleReturnToCurrent = () => {
    const latest = state.sessions.length > 0
      ? state.sessions.reduce((a, b) => a.createdAt > b.createdAt ? a : b)
      : null;
    if (latest && latest.id !== state.activeSessionId) {
      dispatch({ type: 'SWITCH_SESSION', payload: latest.id });
    }
    dispatch({ type: 'TOGGLE_SESSIONS_PANEL' });
  };

  const handleNewChat = () => {
    dispatch({ type: 'START_NEW_CHAT' });
    dispatch({ type: 'TOGGLE_SESSIONS_PANEL' });
  };

  return (
    <div onClick={e => e.stopPropagation()} style={{
      position: 'fixed', top: 0, left: 64,
      width: 320, minWidth: 320, height: '100vh',
      background: 'var(--bg-secondary)',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      animation: 'slideInLeft 0.3s ease-out',
      overflowY: 'auto',
      zIndex: 5,
    }}>
      <div style={{
        padding: 20, borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>💬 聊天记录</div>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SESSIONS_PANEL' })}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            fontSize: 20, cursor: 'pointer',
          }}
        >✕</button>
      </div>

      <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sessions.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>
            还没有聊天记录。<br/>开始对话后会自动保存。
          </div>
        ) : (
          sessions.map(s => (
            <div
              key={s.id}
              onClick={() => handleSwitch(s.id)}
              className={`session-card ${s.id === state.activeSessionId ? 'active' : ''}`}
              style={{
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: s.id === state.activeSessionId ? '1px solid var(--accent)' : '1px solid transparent',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  marginBottom: 4,
                }}>
                  {s.id === state.activeSessionId && (
                    <span style={{ color: 'var(--accent)', marginRight: 4, fontSize: 10 }}>●</span>
                  )}
                  {s.firstMsg}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {s.messages.length} 条消息 · {formatTime(s.createdAt)}
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, s.id)}
                title="删除此对话"
                style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 14, padding: '2px 4px',
                  flexShrink: 0, marginLeft: 8,
                }}
              >✕</button>
            </div>
          ))
        )}
      </div>

      <div style={{
        padding: 12, borderTop: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {state.activeSessionId && (
          <button
            onClick={handleReturnToCurrent}
            style={{
              width: '100%', padding: '8px 0', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
            }}
          >
            📍 返回当前对话
          </button>
        )}
        <button
          onClick={handleNewChat}
          style={{
            width: '100%', padding: '8px 0', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--accent)', background: 'rgba(124,58,237,0.08)',
            color: 'var(--accent-light)', cursor: 'pointer', fontSize: 13,
          }}
        >
          + 新对话
        </button>
      </div>
    </div>
  );
}
