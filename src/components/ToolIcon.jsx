/**
 * 左侧工具栏 — SVG图标 + CSS Tooltip
 */
export default function ToolIcon({ icon, label, active, onClick, badge }) {
  return (
    <button
      className={`tool-icon-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-label={label}
    >
      <div className="tool-icon-svg">
        {icon}
        {badge && <span className="tool-icon-badge">{badge}</span>}
      </div>
      <span className="tool-icon-tooltip">{label}</span>
    </button>
  );
}

// --- 预定义图标组件 ---

export function ApiKeyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  );
}

export function PersonalityIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
  );
}

export function VoiceIcon({ enabled }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      {enabled ? (
        <>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </>
      ) : (
        <>
          <line x1="23" y1="9" x2="17" y2="15"/>
          <line x1="17" y1="9" x2="23" y2="15"/>
        </>
      )}
    </svg>
  );
}

export function MemoryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  );
}

export function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

export function KnowledgeGraphIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="5" r="2.4" fill="rgba(124,58,237,0.12)"/>
      <circle cx="19" cy="5" r="2.4" fill="rgba(124,58,237,0.12)"/>
      <circle cx="5" cy="19" r="2.4" fill="rgba(124,58,237,0.12)"/>
      <circle cx="19" cy="19" r="2.4" fill="rgba(124,58,237,0.12)"/>
      <circle cx="12" cy="12" r="2.8" fill="rgba(124,58,237,0.22)" strokeWidth="2"/>
      <line x1="6.6" y1="6.6" x2="10.2" y2="10.2"/>
      <line x1="13.8" y1="13.8" x2="17.4" y2="17.4"/>
      <line x1="17.4" y1="6.6" x2="13.8" y2="10.2"/>
      <line x1="10.2" y1="13.8" x2="6.6" y2="17.4"/>
    </svg>
  );
}

export function ToolboxIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  );
}

export function ChatHistoryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <line x1="9" y1="9" x2="15" y2="9"/>
      <line x1="9" y1="13" x2="13" y2="13"/>
    </svg>
  );
}

export function AvatarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5"/>
      <path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
    </svg>
  );
}
