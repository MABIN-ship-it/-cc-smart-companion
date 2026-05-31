import React, { useState } from 'react';

const DEFAULT_AVATAR = { id: 'default', name: 'CC默认', path: 'Angry.glb', thumbnail: '🎭' };

export default function AvatarLibrary({ onSwitchAvatar, onClose }) {
  const [avatars, setAvatars] = useState(() => {
    const saved = localStorage.getItem('cc_avatar_custom');
    const custom = saved ? JSON.parse(saved) : [];
    return [DEFAULT_AVATAR, ...custom];
  });
  const [active, setActive] = useState(localStorage.getItem('cc_avatar_active') || 'default');

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
      // 读文件 → base64 → IPC保存到磁盘
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);

      let realPath = null;
      if (window.electronAPI?.saveModel) {
        const r = await window.electronAPI.saveModel(base64, file.name);
        if (r.success) realPath = r.path;
      }
      // 兜底：用 blob URL
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
    } catch (e) {
      alert('模型上传失败: ' + e.message);
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    handleFileUpload(e.dataTransfer?.files?.[0]);
  };
  const handleFileInput = (e) => handleFileUpload(e.target?.files?.[0]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card, #1a1a2e)', borderRadius: 16,
        padding: 24, width: 480, maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: '#e0e0ff' }}>🎭 形象库</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button style={{ padding: '6px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
            background: 'var(--accent-light, #7b7bff)', color: '#fff', fontSize: 13, fontWeight: 600 }}>
            🎭 角色
          </button>
          <button style={{ padding: '6px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.08)', color: '#aaa', fontSize: 13, fontWeight: 600 }}>
            🏃 动作
          </button>
        </div>

        {/* 角色 Tab */}
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

        {/* 动作 Tab 占位 */}
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
          🏃 动作系统<br/>敬请期待
        </div>
      </div>
    </div>
  );
}
