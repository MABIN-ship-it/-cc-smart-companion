import React, { useState, useEffect } from 'react';

const PRESET_AVATARS = [
  { id: 'default', name: 'CC默认', path: 'Angry.glb', thumbnail: '🎭' },
  { id: 'alice', name: '爱丽丝', path: null, thumbnail: '👩‍💼', desc: '生化危机风格女战士' },
  { id: 'cyber', name: '赛博', path: null, thumbnail: '🤖', desc: '未来科技风格' },
  { id: 'casual', name: '休闲', path: null, thumbnail: '🧑', desc: '日常便装风格' },
];

const PRESET_ACTIONS = [
  { id: 'idle', name: '空闲', trigger: '', scene: '' },
  { id: 'wave', name: '挥手', trigger: '挥挥手', scene: '' },
  { id: 'bow', name: '鞠躬', trigger: '鞠躬', scene: '' },
  { id: 'dance', name: '跳舞', trigger: '跳个舞', scene: '' },
  { id: 'smile', name: '微笑', trigger: '笑一个', scene: '开心' },
  { id: 'think', name: '思考', trigger: '', scene: '思考' },
  { id: 'angry', name: '生气', trigger: '', scene: '生气' },
];

export default function AvatarLibrary({ onSwitchAvatar, onClose }) {
  const [tab, setTab] = useState('character');
  const [avatars, setAvatars] = useState(() => {
    const saved = localStorage.getItem('cc_avatar_custom');
    const custom = saved ? JSON.parse(saved) : [];
    return [...PRESET_AVATARS, ...custom];
  });
  const [active, setActive] = useState(localStorage.getItem('cc_avatar_active') || 'default');
  const [actions, setActions] = useState(() => {
    const saved = localStorage.getItem('cc_avatar_actions');
    return saved ? JSON.parse(saved) : PRESET_ACTIONS;
  });

  useEffect(() => { localStorage.setItem('cc_avatar_actions', JSON.stringify(actions)); }, [actions]);

  const handleSelect = (av) => {
    setActive(av.id);
    localStorage.setItem('cc_avatar_active', av.id);
    onSwitchAvatar?.(av);
  };

  const handleFileDrop = async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['glb', 'gltf'].includes(ext)) { alert('只支持 .glb 或 .gltf 格式'); return; }
    const newAv = {
      id: 'custom_' + Date.now(),
      name: file.name.replace(/\.[^.]+$/, ''),
      path: file.path || URL.createObjectURL(file),
      thumbnail: '📁',
      isCustom: true,
    };
    const updated = [...avatars, newAv];
    setAvatars(updated);
    localStorage.setItem('cc_avatar_custom', JSON.stringify(updated.filter(a => a.isCustom)));
    handleSelect(newAv);
  };

  const updateAction = (id, field, value) => {
    setActions(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card, #1a1a2e)', borderRadius: 16,
        padding: 24, width: 520, maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: '#e0e0ff' }}>🎭 形象库</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['character', 'action'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                padding: '6px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
                background: tab === t ? 'var(--accent-light, #7b7bff)' : 'rgba(255,255,255,0.08)',
                color: tab === t ? '#fff' : '#aaa', fontSize: 13, fontWeight: 600,
              }}>
              {t === 'character' ? '🎭 角色' : '🏃 动作'}
            </button>
          ))}
        </div>

        {/* Character Tab */}
        {tab === 'character' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {avatars.map(av => (
                <div key={av.id} onClick={() => handleSelect(av)}
                  style={{
                    padding: 12, borderRadius: 10, cursor: 'pointer',
                    border: active === av.id ? '2px solid var(--accent-light, #7b7bff)' : '1px solid #333',
                    background: active === av.id ? 'rgba(123,123,255,0.1)' : 'transparent',
                  }}>
                  <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 6 }}>{av.thumbnail}</div>
                  <div style={{ fontSize: 13, textAlign: 'center', color: '#ddd' }}>{av.name}</div>
                  {av.desc && <div style={{ fontSize: 10, textAlign: 'center', color: '#888', marginTop: 2 }}>{av.desc}</div>}
                  {active === av.id && <div style={{ fontSize: 10, textAlign: 'center', color: '#7b7bff', marginTop: 4 }}>✓ 当前</div>}
                </div>
              ))}
            </div>
            <div onDrop={handleFileDrop} onDragOver={e => e.preventDefault()}
              style={{ border: '2px dashed #444', borderRadius: 10, padding: 20, textAlign: 'center', color: '#888', fontSize: 13 }}>
              📂 拖拽 GLB/GLTF 文件到此处，或
              <label style={{ color: '#7b7bff', cursor: 'pointer', marginLeft: 4 }}>
                点击上传
                <input type="file" accept=".glb,.gltf" onChange={handleFileDrop} style={{ display: 'none' }} />
              </label>
            </div>
          </>
        )}

        {/* Action Tab */}
        {tab === 'action' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {actions.map(act => (
              <div key={act.id} style={{
                background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12,
                border: '1px solid #333',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, color: '#ddd', fontWeight: 600 }}>🏃 {act.name}</span>
                  <button onClick={() => window.dispatchEvent(new CustomEvent('cc:playAction', { detail: act.id }))}
                    style={{ background: 'var(--accent-light, #7b7bff)', border: 'none', borderRadius: 14, padding: '2px 12px', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
                    ▶ 预览
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>触发提示词</div>
                    <input value={act.trigger} onChange={e => updateAction(act.id, 'trigger', e.target.value)}
                      placeholder='用户说什么触发此动作'
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', borderRadius: 6, padding: '4px 8px', color: '#ddd', fontSize: 12 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>触发场景</div>
                    <input value={act.scene} onChange={e => updateAction(act.id, 'scene', e.target.value)}
                      placeholder='检测到XX场景时触发'
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', borderRadius: 6, padding: '4px 8px', color: '#ddd', fontSize: 12 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
