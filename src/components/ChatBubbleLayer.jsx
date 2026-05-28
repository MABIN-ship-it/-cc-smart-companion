import { useEffect, useRef, useState } from 'react';

/** 简易 Markdown → HTML 渲染 */
function renderMarkdown(text) {
  if (!text) return '';
  let html = text;

  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');

  html = html.replace(/^\|(.+)\|\s*\n\|[-:\s|]+\|\s*\n((?:^\|.+\|\s*\n?)*)/gm, (_, header, body) => {
    const thead = '<thead><tr>' + header.split('|').map(h => `<th>${h.trim()}</th>`).join('') + '</tr></thead>';
    const tbody = '<tbody>' + body.trim().split('\n').map(row =>
      '<tr>' + row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('') + '</tr>'
    ).join('') + '</tbody>';
    return `<table>${thead}${tbody}</table>`;
  });

  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  html = html.replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>');
  html = html.replace(/\n\n/g, '<br/><br/>');

  return html;
}

/* ---------- CollapsedThinking 组件 ---------- */
function CollapsedThinking({ text, expanded: controlledExpanded, onToggle }) {
  const [selfExpanded, setSelfExpanded] = useState(true);
  const expanded = controlledExpanded !== undefined ? controlledExpanded : selfExpanded;
  const handleToggle = () => {
    if (onToggle) onToggle(!expanded);
    else setSelfExpanded(!expanded);
  };
  return (
    <div className="thinking-collapsed">
      <div className="thinking-toggle" onClick={handleToggle}>
        <span className="thinking-toggle-arrow">{expanded ? '▼' : '▶'}</span>
        <span>思考过程</span>
      </div>
      {expanded && (
        <div className="thinking-collapsed-body">
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
        </div>
      )}
    </div>
  );
}

/* ---------- SVG Icons ---------- */
const icons = {
  refresh: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
  copy: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  speak: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>,
  like: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/></svg>,
  dislike: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transform:'scaleY(-1)'}}><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/></svg>,
  forward: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>,
  more: <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>,
  bookmark: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>,
  feedback: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  report: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
};

function MsgActions({ msg, onRefresh, onSpeak, onLike, onDislike, onForward, onMoreAction }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = msg.content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLike = () => {
    if (disliked) setDisliked(false);
    setLiked(!liked);
    onLike?.(msg, !liked);
  };

  const handleDislike = () => {
    if (liked) setLiked(false);
    setDisliked(!disliked);
    onDislike?.(msg, !disliked);
  };

  return (
    <div className="msg-actions">
      <button className="msg-action-btn" title="重新生成" onClick={() => onRefresh?.(msg)}>
        {icons.refresh}
      </button>
      <button className={`msg-action-btn ${copied ? 'active-copy' : ''}`} title={copied ? '已复制' : '复制'} onClick={handleCopy}>
        {icons.copy}
      </button>
      <button className="msg-action-btn" title="朗读" onClick={() => onSpeak?.(msg)}>
        {icons.speak}
      </button>
      <button className={`msg-action-btn ${liked ? 'active-like' : ''}`} title="喜欢" onClick={handleLike}>
        {icons.like}
      </button>
      <button className={`msg-action-btn ${disliked ? 'active-dislike' : ''}`} title="不喜欢" onClick={handleDislike}>
        {icons.dislike}
      </button>
      <button className="msg-action-btn" title="转发" onClick={() => onForward?.(msg)}>
        {icons.forward}
      </button>
      <div className="msg-more-wrap">
        <button
          className={`msg-action-btn ${menuOpen ? 'active-more' : ''}`}
          title="更多"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {icons.more}
        </button>
        {menuOpen && (
          <>
            <div className="msg-more-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="msg-more-menu">
              <button onClick={() => { setMenuOpen(false); onMoreAction?.(msg, 'forward'); }}>
                {icons.forward}
                <span>转发</span>
              </button>
              <button onClick={() => { setMenuOpen(false); onMoreAction?.(msg, 'bookmark'); }}>
                {icons.bookmark}
                <span>收藏</span>
              </button>
              <button onClick={() => { setMenuOpen(false); onMoreAction?.(msg, 'feedback'); }}>
                {icons.feedback}
                <span>反馈</span>
              </button>
              <button onClick={() => { setMenuOpen(false); onMoreAction?.(msg, 'report'); }}>
                {icons.report}
                <span>举报</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 右侧聊天气泡面板 — 含思考面板 + 消息气泡
 */
export default function ChatBubbleLayer({
  messages, isProcessing, streamingText, thinking, thinkingText,
  onRefresh, onSpeak, onLike, onDislike, onForward, onMoreAction,
}) {
  const containerRef = useRef(null);
  const userScrollRef = useRef(false);
  const prevMsgCountRef = useRef(0);
  const [thinkCollapsed, setThinkCollapsed] = useState(false);
  const prevThinking = useRef(false);
  const hasAutoCollapsed = useRef(false);

  // thinking 开始时自动展开
  useEffect(() => {
    if (thinking && !prevThinking.current) {
      setThinkCollapsed(false);
      hasAutoCollapsed.current = false;
    }
    prevThinking.current = thinking;
  }, [thinking]);

  // 正文首次到来时自动折叠（只触发一次）
  useEffect(() => {
    if (streamingText && thinking && !hasAutoCollapsed.current) {
      setThinkCollapsed(true);
      hasAutoCollapsed.current = true;
    }
  }, [streamingText, thinking]);

  const visibleMsgs = messages.filter(m =>
    (m.role === 'assistant' || m.role === 'user') && m.content
  );

  useEffect(() => {
    if (visibleMsgs.length > prevMsgCountRef.current && !userScrollRef.current) {
      const el = containerRef.current;
      if (el) {
        requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
      }
    }
    prevMsgCountRef.current = visibleMsgs.length;
  }, [visibleMsgs.length]);

  useEffect(() => {
    if (streamingText && !userScrollRef.current) {
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [streamingText]);

  const handleWheel = (e) => {
    const el = containerRef.current;
    if (!el) return;
    if (e.deltaY < 0) userScrollRef.current = true;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
      userScrollRef.current = false;
    }
  };

  if (visibleMsgs.length === 0 && !streamingText && !thinking) return null;

  return (
    <div className="chat-bubble-panel">
      <div className="chat-bubble-scroll" ref={containerRef} onWheel={handleWheel}>

        {visibleMsgs.map((msg, i) => (
          <div key={msg.id || i} className={`chat-bubble ${msg.role === 'user' ? 'user-bubble' : ''}`}>
            <div className="chat-bubble-body">
              {msg.type === 'reminder' && <span className="chat-bubble-tag reminder">提醒</span>}
              {msg.type === 'care' && <span className="chat-bubble-tag care">关心</span>}
              {msg.type === 'share' && <span className="chat-bubble-tag share">分享</span>}
              {msg.type === 'plan' && <span className="chat-bubble-tag plan">方案</span>}
              {msg.images && msg.images.length > 0 && (
                <div className="chat-bubble-images">
                  {msg.images.map((img, i) => (
                    <img key={i} src={img} alt={`图片 ${i + 1}`} className="chat-bubble-image" />
                  ))}
                </div>
              )}
              {msg.audio && (
                <div className="chat-bubble-audio">
                  <audio controls src={msg.audio} style={{ height: 28, maxWidth: 220 }} />
                </div>
              )}
              {/* 思考折叠组件（嵌入消息气泡） */}
              {msg.thinkingText && <CollapsedThinking text={msg.thinkingText} />}
              {msg.content && (
                <div
                  className="chat-bubble-text"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              )}
            </div>
            {msg.role === 'assistant' && msg.type !== 'system' && msg.type !== 'tool_response' && (
              <MsgActions
                msg={msg}
                onRefresh={onRefresh}
                onSpeak={onSpeak}
                onLike={onLike}
                onDislike={onDislike}
                onForward={onForward}
                onMoreAction={onMoreAction}
              />
            )}
          </div>
        ))}

        {/* ── 流式输出（思考+正文在同一气泡内）────── */}
        {(thinking || streamingText) && (
          <div className="chat-bubble streaming">
            <div className="chat-bubble-body">
              {thinking && !thinkCollapsed && (
                <CollapsedThinking text={thinkingText || '思考中...'} expanded={true} onToggle={(v) => setThinkCollapsed(!v)} />
              )}
              {thinking && thinkCollapsed && (
                <div className="thinking-collapsed">
                  <div className="thinking-toggle" onClick={() => setThinkCollapsed(false)}>
                    <span className="thinking-toggle-arrow">▶</span>
                    <span>思考过程</span>
                  </div>
                </div>
              )}
              {streamingText && (
                <>
                  <div
                    className="chat-bubble-text"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingText) }}
                  />
                  <span className="cursor-blink">|</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
