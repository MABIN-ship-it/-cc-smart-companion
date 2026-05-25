/**
 * MemoryTimeline — 记忆时间线组件
 *
 * 展示记忆按时间排序，颜色编码热度：
 *   - hot (红): 高重要性
 *   - warm (橙): 中等重要性
 *   - cold (灰): 低重要性/旧记忆
 */

import { useState, useMemo } from 'react';

const LEVEL_CONFIG = {
  hot: { className: 'hot', label: '热', color: '#ef4444' },
  warm: { className: 'warm', label: '温', color: '#f59e0b' },
  cold: { className: 'cold', label: '冷', color: '#6b7280' },
};

const TYPE_LABELS = {
  event: '事件',
  user: '用户',
  project: '项目',
  knowledge: '知识',
  date: '日期',
  feedback: '反馈',
  goal: '目标',
  deadline: '截止日',
};

export default function MemoryTimeline({ memories = [], onDelete, stats }) {
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');

  const filtered = useMemo(() => {
    let list = memories;
    if (levelFilter !== 'all') {
      list = list.filter(m => m.level === levelFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(m => {
        const content = (m.content || m.label || '').toLowerCase();
        const type = (m.type || '').toLowerCase();
        return content.includes(q) || type.includes(q);
      });
    }
    return list;
  }, [memories, levelFilter, search]);

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 搜索栏 */}
      <div className="kg-search">
        <input
          type="text"
          placeholder="搜索记忆..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* 过滤栏 */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        {['all', 'hot', 'warm', 'cold'].map(lv => (
          <button
            key={lv}
            onClick={() => setLevelFilter(lv)}
            style={{
              padding: '3px 10px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.1)',
              background: levelFilter === lv ? 'rgba(167,139,250,0.2)' : 'transparent',
              color: levelFilter === lv ? '#a78bfa' : '#888',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {lv === 'all' ? '全部' : LEVEL_CONFIG[lv]?.label || lv}
          </button>
        ))}
      </div>

      {/* 时间线列表 */}
      <div className="kg-timeline">
        {filtered.length === 0 ? (
          <div className="kg-empty" style={{ padding: 40 }}>
            <div className="kg-empty-icon">📭</div>
            <div className="kg-empty-text">
              {memories.length === 0 ? '暂无记忆记录' : '无匹配结果'}
            </div>
          </div>
        ) : (
          filtered.map((m, i) => {
            const lvl = LEVEL_CONFIG[m.level] || LEVEL_CONFIG.cold;
            const content = m.content || m.label || m.pattern || m.summary || '(无内容)';
            const typeLabel = TYPE_LABELS[m.type] || m.type || '';
            return (
              <div key={m.id || i} className="kg-timeline-item">
                <div className={`kg-timeline-dot ${lvl.className}`} />
                <div className="kg-timeline-content">
                  <p>{content}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    {typeLabel && <span>{typeLabel}</span>}
                    {m.importance > 0 && <span>重要度 {Math.round(m.importance * 100)}%</span>}
                    {m._createdAt && <span>{formatTime(m._createdAt)}</span>}
                    {m.mentions > 1 && <span>提及 {m.mentions} 次</span>}
                  </div>
                  {m.evidence && (
                    <span style={{ display: 'block', fontSize: 11, color: '#555', marginTop: 1 }}>
                      来源: {m.evidence.slice(0, 60)}
                    </span>
                  )}
                  {onDelete && (
                    <button
                      className="kg-delete-btn"
                      onClick={() => onDelete(m.id)}
                      style={{ marginTop: 4 }}
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 底部统计 */}
      {stats && (
        <div className="kg-stats">
          <div className="kg-stat">
            <span className="kg-stat-dot" style={{ background: '#ef4444' }} />
            热记忆 {stats.hot || 0}
          </div>
          <div className="kg-stat">
            <span className="kg-stat-dot" style={{ background: '#f59e0b' }} />
            温记忆 {stats.warm || 0}
          </div>
          <div className="kg-stat">
            <span className="kg-stat-dot" style={{ background: '#6b7280' }} />
            冷记忆 {stats.cold || 0}
          </div>
        </div>
      )}
    </div>
  );
}
