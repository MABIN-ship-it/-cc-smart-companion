import React, { useState, useEffect } from 'react';

const DEFAULT_AVATAR = { id: 'default', name: 'CC默认', path: 'Angry.glb', thumbnail: './cc-logo.png' };

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
    return [DEFAULT_AVATAR, ...custom];
  });
  const [active, setActive] = useState(localStorage.getItem('cc_avatar_active') || 'default');
  const [actions] = useState(() => {
    const saved = localStorage.getItem('cc_avatar_actions');
    return saved ? JSON.parse(saved) : PRESET_ACTIONS;
  });

  const handleSelect = (av) => {
    setActive(av.id);
    localStorage.setItem('cc_avatar_active', av.id);
    onSwitchAvatar?.(av);
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['glb', 'gltf'].includes(ext)) { alert('只支持 .glb 或 .gltf 格式'); return; }
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);
      let realPath = null;
      if (window.electronAPI?.saveModel) {
        const r = await window.electronAPI.saveModel(base64, file.name);
        if (r.success) realPath = r.path;
      }
      if (!realPath) realPath = URL.createObjectURL(file);
      const newAv = {
        id: 'custom_' + Date.now(),
        name: file.name.replace(/\.[^.]+$/, ''),
        path: realPath,
        thumbnail: '📁',
        isCustom: true,
      };
      const updated = [...avatars.filter(a => a.isCustom), newAv];
      setAvatars([DEFAULT_AVATAR, ...updated]);
      localStorage.setItem('cc_avatar_custom', JSON.stringify(updated));
      handleSelect(newAv);
    } catch (e) { alert('模型上传失败: ' + e.message); }
  };

  const handleFileDrop = (e) => { e.preventDefault(); handleFileUpload(e.dataTransfer?.files?.[0]); };
  const handleFileInput = (e) => handleFileUpload(e.target?.files?.[0]);

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

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            ['character', '🎭 角色'],
            ['action', '🏃 动作'],
          ].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                padding: '6px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
                background: tab === t ? 'var(--accent-light, #7b7bff)' : 'rgba(255,255,255,0.08)',
                color: tab === t ? '#fff' : '#aaa', fontSize: 13, fontWeight: 600,
                position: 'relative',
              }}>
              {label}
              {t === 'action' && <span style={{
                position: 'absolute', top: -4, right: -8, fontSize: 9,
                background: '#ff9800', color: '#fff', borderRadius: 6, padding: '0px 4px',
              }}>不久</span>}
            </button>
          ))}
        </div>

        {/* 角色 Tab */}
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
                  <div style={{ width: 48, height: 48, margin: '0 auto 6px', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>
                    {av.thumbnail.startsWith('.') || av.thumbnail.startsWith('/') ? (
                      <img src={av.thumbnail} alt={av.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 28 }}>{av.thumbnail}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, textAlign: 'center', color: '#ddd' }}>{av.name}</div>
                  {active === av.id && <div style={{ fontSize: 10, textAlign: 'center', color: '#7b7bff', marginTop: 4 }}>✓ 当前</div>}
                </div>
              ))}
            </div>
            <div onDrop={handleFileDrop} onDragOver={e => e.preventDefault()}
              style={{ border: '2px dashed #444', borderRadius: 10, padding: 20, textAlign: 'center', color: '#888', fontSize: 13 }}>
              📂 拖拽 GLB/GLTF 文件到此处，或
              <label style={{ color: '#7b7bff', cursor: 'pointer', marginLeft: 4 }}>
                点击上传
                <input type="file" accept=".glb,.gltf" onChange={handleFileInput} style={{ display: 'none' }} />
              </label>
            </div>
          </>
        )}

        {/* 动作 Tab */}
        {tab === 'action' && (
          <>
            <div style={{
              background: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.2)',
              borderRadius: 8, padding: '6px 12px', marginBottom: 12,
              fontSize: 11, color: '#ff9800', textAlign: 'center',
            }}>
              🚧 动作系统正在研发中，以下为设计预览，暂不可用
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: 0.6, pointerEvents: 'none' }}>
              {actions.map(act => (
                <div key={act.id} style={{
                  background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12,
                  border: '1px solid #333',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 14, color: '#ddd', fontWeight: 600 }}>🏃 {act.name}</span>
                    <button style={{ background: '#555', border: 'none', borderRadius: 14, padding: '2px 12px', color: '#999', fontSize: 11, cursor: 'default' }}>
                      ▶ 预览
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>触发提示词</div>
                      <input value={act.trigger} readOnly placeholder='用户说什么触发此动作'
                        style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid #333', borderRadius: 6, padding: '4px 8px', color: '#666', fontSize: 12 }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>触发场景</div>
                      <input value={act.scene} readOnly placeholder='检测到XX场景时触发'
                        style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid #333', borderRadius: 6, padding: '4px 8px', color: '#666', fontSize: 12 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
