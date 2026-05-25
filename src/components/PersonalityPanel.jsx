import { useApp } from '../store/AppContext';
import { PERSONALITY } from '../config/personality';

const traits = [
  { key: 'warmth', label: '温度', minLabel: '冷静', maxLabel: '热情', desc: 'CC的热情程度，值越高语言越温暖热情' },
  { key: 'humor', label: '幽默度', minLabel: '严肃', maxLabel: '活泼', desc: 'CC的幽默风格，值越高回复越轻松有趣' },
  { key: 'proactive', label: '主动度', minLabel: '被动', maxLabel: '主动', desc: 'CC的主动性，值越高越会主动关心和提醒你' },
  { key: 'concise', label: '简洁度', minLabel: '详细', maxLabel: '简洁', desc: 'CC回复长度，值越高说话越简短直击要点' },
];

export default function PersonalityPanel() {
  const { state, dispatch } = useApp();
  const p = state.personality;

  const update = (key, value) => {
    dispatch({ type: 'UPDATE_PERSONALITY', payload: { [key]: Number(value) } });
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
        <div style={{ fontSize: 18, fontWeight: 600 }}>🎭 人格设置</div>
        <button onClick={() => dispatch({ type: 'TOGGLE_PERSONALITY_PANEL' })} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          fontSize: 20, cursor: 'pointer',
        }}>✕</button>
      </div>

      <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {traits.map(t => (
          <div key={t.key}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              marginBottom: 8, fontSize: 13,
            }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{t.label}</span>
              <span style={{ color: 'var(--accent)' }}>{Math.round(p[t.key] * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={p[t.key]}
              onChange={e => update(t.key, e.target.value)}
              style={{
                width: '100%', height: 6, borderRadius: 3,
                background: `linear-gradient(90deg, #444466 0%, var(--accent) ${p[t.key] * 100}%, var(--border) ${p[t.key] * 100}%)`,
                accentColor: 'var(--accent)',
                cursor: 'pointer',
                appearance: 'none',
              }}
            />
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              marginTop: 4, fontSize: 11, color: 'var(--text-muted)',
            }}>
              <span>{t.minLabel}</span>
              <span>{t.maxLabel}</span>
            </div>
            <div style={{
              fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5,
            }}>
              {t.desc}
            </div>
          </div>
        ))}

        {/* Reset button */}
        <button
          onClick={() => {
            update('warmth', PERSONALITY.baseTraits.warmth.default);
            update('humor', PERSONALITY.baseTraits.humor.default);
            update('proactive', PERSONALITY.baseTraits.proactive.default);
            update('concise', PERSONALITY.baseTraits.concise.default);
          }}
          style={{
            padding: '10px 16px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
          }}
        >
          ↺ 恢复默认
        </button>
      </div>
    </div>
  );
}
