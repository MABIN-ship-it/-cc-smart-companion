import { useState, useEffect } from 'react';

const MAX_BUBBLES = 10;

function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '...' : text;
}

function formatTime(ts) {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
}

export default function SessionBubbles({ sessions, activeSessionId, onBubbleClick, onRemove }) {
  const [removing, setRemoving] = useState(new Set());

  useEffect(() => {
    if (sessions.length > MAX_BUBBLES) {
      const oldest = sessions[0];
      setRemoving(prev => new Set([...prev, oldest.id]));
      const timer = setTimeout(() => {
        onRemove(oldest.id);
        setRemoving(prev => {
          const next = new Set(prev);
          next.delete(oldest.id);
          return next;
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [sessions.length]);

  if (sessions.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 80,
      left: 70,
      right: 'max(500px, 42vw)',
      zIndex: 3,
      pointerEvents: 'auto',
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
    }}>
      {sessions.map(s => (
        <div
          key={s.id}
          className={`session-bubble ${s.id === activeSessionId ? 'active' : ''} ${removing.has(s.id) || s._removing ? 'removing' : ''}`}
          onClick={() => onBubbleClick(s.id)}
          title={`${s.firstMsg}\n${formatTime(s.createdAt)}`}
        >
          💬 {truncate(s.firstMsg, 15)}
        </div>
      ))}
    </div>
  );
}
