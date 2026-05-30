import React, { useState } from 'react';

const PRESET_AVATARS = [
  { id: 'default', name: 'CC 默认', path: './models/Angry.glb', thumbnail: '🎭' },
  { id: 'alice', name: '爱丽丝', path: null, thumbnail: '👩‍💼', desc: '生化危机风格女战士' },
  { id: 'cyber', name: '赛博', path: null, thumbnail: '🤖', desc: '未来科技风格' },
  { id: 'casual', name: '休闲', path: null, thumbnail: '🧑', desc: '日常便装风格' },
];

export default function AvatarLibrary({ onSwitchAvatar, onClose }) {
  const [avatars, setAvatars] = useState(() => {
    const saved = localStorage.getItem('cc_avatar_custom');
    const custom = saved ? JSON.parse(saved) : [];
    return [...PRESET_AVATARS, ...custom];
  });
  const [active, setActive] = useState(localStorage.getItem('cc_avatar_active') || 'default');

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

    const reader = new FileReader();
    reader.onload = () => {
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
    reader.readAsDataURL(file);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card, #1a1a2e)', borderRadius: 16,
        padding: 24, width: 520, maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: '#e0e0ff' }}>🎭 形象库</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {avatars.map(av => (
            <div key={av.id}
              onClick={() => handleSelect(av)}
              style={{
                padding: 12, borderRadius: 10, cursor: 'pointer',
                border: active === av.id ? '2px solid var(--accent-light, #7b7bff)' : '1px solid #333',
                background: active === av.id ? 'rgba(123,123,255,0.1)' : 'transparent',
                transition: 'all 0.2s',
              }}>
              <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 6 }}>{av.thumbnail}</div>
              <div style={{ fontSize: 13, textAlign: 'center', color: '#ddd' }}>{av.name}</div>
              {av.desc && <div style={{ fontSize: 10, textAlign: 'center', color: '#888', marginTop: 2 }}>{av.desc}</div>}
              {active === av.id && <div style={{ fontSize: 10, textAlign: 'center', color: '#7b7bff', marginTop: 4 }}>✓ 当前</div>}
            </div>
          ))}
        </div>

        <div
          onDrop={handleFileDrop}
          onDragOver={e => e.preventDefault()}
          style={{
            border: '2px dashed #444', borderRadius: 10, padding: 20, textAlign: 'center',
            color: '#888', fontSize: 13, cursor: 'pointer',
          }}>
          📂 拖拽 GLB/GLTF 文件到此处，或
          <label style={{ color: '#7b7bff', cursor: 'pointer', marginLeft: 4 }}>
            点击上传
            <input type="file" accept=".glb,.gltf" onChange={handleFileDrop} style={{ display: 'none' }} />
          </label>
        </div>
      </div>
    </div>
  );
}
