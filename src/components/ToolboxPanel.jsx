/**
 * 工具箱面板 — 管理集成应用
 */
import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { saveFeishuConfig, getFeishuConfig, isFeishuConfigured, testConnection, checkPermissions, getFeishuPermissionUrl, copyScopeToClipboard } from '../services/feishu';
import { getBotConfig, saveBotConfig, getMonitorableChats, getBotStats } from '../services/feishuBotService';

/* 飞书品牌风格图标 — 蓝色圆角方底+白色抽象对话图形 */
function FeishuIcon({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <defs>
        <linearGradient id="feishuBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3370FF"/>
          <stop offset="100%" stopColor="#5B8DEF"/>
        </linearGradient>
        <linearGradient id="feishuAccent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00C9A7"/>
          <stop offset="100%" stopColor="#3370FF"/>
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#feishuBg)"/>
      {/* 抽象对话气泡 + Z形折线 */}
      <path d="M28 12H14c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h4l3 3.5L24 24h4c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2z"
        fill="white" opacity="0.95"/>
      <path d="M18 18h8M18 15h6" stroke="url(#feishuAccent)" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

export default function ToolboxPanel() {
  const { state, dispatch } = useApp();
  const [showFeishuConfig, setShowFeishuConfig] = useState(false);
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [configMsg, setConfigMsg] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [permResults, setPermResults] = useState(null);
  const [checkingPerms, setCheckingPerms] = useState(false);
  const [botConfig, setBotConfig] = useState(getBotConfig());
  const [showBotConfig, setShowBotConfig] = useState(false);
  const [showWechatGuide, setShowWechatGuide] = useState(false);

  const feishuConnected = state.feishuStatus === 'connected';

  const pickPluginFile = () => new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.cc-plugin.js';
    input.onchange = e => resolve(e.target.files?.[0] || null);
    input.click();
  });
  const installAndAlert = async (file, name) => {
    if (!window.electronAPI?.installPlugin) { alert('插件安装需要 Electron 环境'); return; }
    const r = await window.electronAPI.installPlugin(file.path || URL.createObjectURL(file));
    alert(r.success ? `"${r.name || name}" 插件更新成功！请重启CC。` : `安装失败: ${r.error}`);
  };
  const handlePluginDrop = async (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (!f || !f.name.endsWith('.cc-plugin.js')) { alert('请上传 .cc-plugin.js 格式'); return; }
    await installAndAlert(f, f.name);
  };
  const handlePluginFile = async (e) => {
    const f = e.target?.files?.[0];
    if (!f) return;
    await installAndAlert(f, f.name);
  };
  const feishuConnecting = state.feishuStatus === 'connecting';

  const handleCheckPermissions = async () => {
    setCheckingPerms(true);
    try {
      const result = await checkPermissions();
      setPermResults(result);
    } catch (e) {
      setConfigMsg(`error||权限检测失败: ${e.message}`);
    }
    setCheckingPerms(false);
  };

  useEffect(() => {
    if (feishuConnected && showFeishuConfig && !permResults) {
      handleCheckPermissions();
    }
  }, [feishuConnected, showFeishuConfig]);

  const openFeishuCard = () => {
    const config = getFeishuConfig();
    if (config) {
      setAppId(config.appId || '');
      setAppSecret(config.appSecret || '');
    }
    setConfigMsg('');
    setShowFeishuConfig(true);
  };

  const handleTestConnection = async () => {
    if (!appId.trim() || !appSecret.trim()) {
      setConfigMsg('请填写 App ID 和 App Secret');
      return;
    }
    setTesting(true);
    setConfigMsg('');
    try {
      const result = await window.electronAPI?.feishuTest(appId.trim(), appSecret.trim());
      if (result?.success) {
        setConfigMsg('success||连接测试成功！凭证有效。');
      } else {
        const errMsg = result?.error || '未知错误';
        if (errMsg.includes('99991663') || errMsg.includes('app_id')) {
          setConfigMsg('error||App ID 或 App Secret 不正确，请检查后重试');
        } else {
          setConfigMsg(`error||${errMsg}`);
        }
      }
    } catch (e) {
      setConfigMsg(`error||测试失败: ${e.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveAndConnect = async () => {
    if (!appId.trim() || !appSecret.trim()) {
      setConfigMsg('error||请填写 App ID 和 App Secret');
      return;
    }
    setConnecting(true);
    setConfigMsg('');
    try {
      saveFeishuConfig(appId.trim(), appSecret.trim());
      const result = await window.electronAPI?.feishuConfigure(appId.trim(), appSecret.trim());
      if (result?.success) {
        dispatch({ type: 'SET_FEISHU_STATUS', payload: 'connecting' });
        setConfigMsg('info||已保存配置，正在建立连接...');
        let attempts = 0;
        const checkInterval = setInterval(async () => {
          attempts++;
          const status = await window.electronAPI?.feishuStatus();
          if (status?.running) {
            clearInterval(checkInterval);
            dispatch({ type: 'SET_FEISHU_STATUS', payload: 'connected' });
            setConfigMsg('success||飞书已成功连接！');
            setConnecting(false);
            setTimeout(() => setShowFeishuConfig(false), 1500);
          } else if (attempts > 15) {
            clearInterval(checkInterval);
            dispatch({ type: 'SET_FEISHU_STATUS', payload: 'disconnected' });
            setConfigMsg('error||连接超时。请确认飞书应用已创建版本并发布。');
            setConnecting(false);
          }
        }, 1000);
      } else {
        setConfigMsg(`error||${result?.error || '连接失败'}`);
        setConnecting(false);
      }
    } catch (e) {
      setConfigMsg(`error||连接失败: ${e.message}`);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await window.electronAPI?.feishuDisconnect();
    dispatch({ type: 'SET_FEISHU_STATUS', payload: 'disconnected' });
    setConfigMsg('info||已断开连接');
    setPermResults(null);
    setShowBotConfig(false);
  };

  const handleToggleBot = () => {
    const updated = saveBotConfig({ enabled: !botConfig.enabled });
    setBotConfig(updated);
  };

  const handleToggleAutoReply = () => {
    const updated = saveBotConfig({ autoReply: !botConfig.autoReply });
    setBotConfig(updated);
  };

  const handleBotStyleChange = (style) => {
    const updated = saveBotConfig({ replyStyle: style });
    setBotConfig(updated);
  };

  return (
    <div className="toolbox-panel">
      <div className="toolbox-header">
        <div className="toolbox-header-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.7">
            <rect x="3" y="3" width="7" height="7" rx="1.5"/>
            <rect x="14" y="3" width="7" height="7" rx="1.5"/>
            <rect x="3" y="14" width="7" height="7" rx="1.5"/>
            <rect x="14" y="14" width="7" height="7" rx="1.5"/>
          </svg>
          <h3>工具箱</h3>
        </div>
        <button className="toolbox-close-btn" onClick={() => dispatch({ type: 'TOGGLE_TOOLBOX' })}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8"/>
          </svg>
        </button>
      </div>

      <div className="toolbox-grid">
        {/* 飞书卡片 */}
        <div className={`toolbox-app-card${feishuConnected?' connected':''}${feishuConnecting?' connecting':''}`}
          onClick={openFeishuCard} style={{ position: 'relative' }}>
          <div className="toolbox-app-icon-wrap"><FeishuIcon size={44} /></div>
          <div className="toolbox-app-name">飞书</div>
          <div className="toolbox-app-subtitle">消息·文档·多维表格</div>
          <div className={`toolbox-app-status${feishuConnected?' online':feishuConnecting?' connecting':''}`}>
            <span className="toolbox-status-dot"/>{feishuConnected?'已连接':feishuConnecting?'连接中...':'未连接'}
          </div>
          <div className="toolbox-app-badge">内置</div>
          <span className="plugin-replace-btn" title="为了您更好的使用体验，您可以更换更优质的插件"
            onClick={async (e) => { e.stopPropagation(); const f = await pickPluginFile(); if (f) installAndAlert(f, '飞书'); }}>
            更换
          </span>
        </div>

        {/* 微信卡片 */}
        <div className="toolbox-app-card" style={{ position: 'relative', opacity: 0.75 }} onClick={() => setShowWechatGuide(true)}>
          <div className="toolbox-app-icon-wrap"><span style={{ fontSize: 36 }}>💬</span></div>
          <div className="toolbox-app-name">微信</div>
          <div className="toolbox-app-subtitle">消息·联系人</div>
          <div className="toolbox-app-status">待安装</div>
          <div className="toolbox-app-badge">内置</div>
          <span className="plugin-replace-btn" title="为了您更好的使用体验，您可以更换更优质的插件"
            onClick={async (e) => { e.stopPropagation(); const f = await pickPluginFile(); if (f) installAndAlert(f, '微信'); }}>
            更换
          </span>
        </div>
      </div>

      {/* 安装新插件教程 */}
      <div style={{ marginTop: 20, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid var(--border-subtle,#333)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#ddd', marginBottom: 12 }}>📦 安装新插件</div>

        <div style={{ fontSize: 12, lineHeight: 1.8, color: '#aaa', marginBottom: 8 }}>
          <b>什么是插件？</b><br/>
          插件是 CC 的功能扩展包，可以让 CC 连接更多平台：<br/>
          微信、钉钉、Telegram、美团、小红书、抖音、闲鱼、淘宝、京东、知乎...
        </div>

        <div style={{ fontSize: 12, lineHeight: 1.8, color: '#aaa', marginBottom: 8 }}>
          <b>怎么安装？</b><br/>
          1. 准备 <code>.cc-plugin.js</code> 文件<br/>
          2. 拖拽到下方区域或点击选择<br/>
          3. 重启 CC 生效
        </div>

        <div onDrop={handlePluginDrop} onDragOver={e => e.preventDefault()}
          style={{ border: '2px dashed #555', borderRadius: 10, padding: 16, textAlign: 'center', cursor: 'pointer', marginBottom: 12 }}>
          <label style={{ cursor: 'pointer', color: '#7b7bff', fontSize: 13 }}>
            📁 拖拽插件文件到此处 或 点击选择文件
            <input type="file" accept=".cc-plugin.js" onChange={handlePluginFile} style={{ display: 'none' }}/>
          </label>
        </div>

        <div style={{ fontSize: 12, lineHeight: 1.8, color: '#888' }}>
          <b>哪里下载插件？</b><br/>
          • CC 官方插件仓库（即将上线）<br/>
          • 开发者提供的 .cc-plugin.js<br/>
          • 自己编写（见下方开发指南）
        </div>

        <details style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
          <summary style={{ cursor: 'pointer', color: '#aaa' }}>🛠 怎么开发 .cc-plugin.js？</summary>
          <pre style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6, overflowX: 'auto', fontSize: 11, marginTop: 6, color: '#bbb' }}>{`// my-plugin.cc-plugin.js
module.exports = {
  id: 'my-plugin',
  name: '我的插件',
  icon: '🔧',
  subtitle: '功能描述',
  version: '1.0.0',
  tools: [{
    name: 'do_something',
    description: '做什么',
    input_schema: {
      type: 'object',
      properties: { ... },
    },
  }],
  executors: {
    do_something: async (ctx) => { /* 逻辑 */ },
  },
};`}</pre>
          <p style={{ marginTop: 4 }}>写好保存为 .cc-plugin.js，拖到上方上传区即可安装。详细文档即将随开源发布。</p>
        </details>
      </div>

      {/* 微信安装指引弹窗 */}
      {showWechatGuide && (
        <div className="feishu-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowWechatGuide(false); }}>
          <div className="feishu-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="feishu-modal-header">
              <div className="feishu-modal-title-row">
                <span style={{ fontSize: 28 }}>💬</span>
                <span style={{ fontWeight: 700, fontSize: 16 }}>微信插件安装</span>
              </div>
              <button className="feishu-modal-close" onClick={() => setShowWechatGuide(false)}>✕</button>
            </div>
            <div style={{ padding: 16, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              <p><b>方式一：直接上传插件文件</b></p>
              <label style={{
                display: 'block', margin: '8px 0', padding: 14, textAlign: 'center',
                border: '2px dashed #7b7bff', borderRadius: 10, cursor: 'pointer',
                color: '#7b7bff', fontSize: 14, fontWeight: 600,
              }}>
                📁 点击此处选择微信插件文件（.cc-plugin.js）
                <input type="file" accept=".cc-plugin.js" onChange={async (e) => {
                  const file = e.target?.files?.[0];
                  if (!file) return;
                  if (window.electronAPI?.installPlugin) {
                    const result = await window.electronAPI.installPlugin(file.path || file.name);
                    alert(result.success ? `"${result.name}" 安装成功！请重启CC。` : `安装失败: ${result.error}`);
                  } else {
                    alert('请重启CC后再试');
                  }
                }} style={{ display: 'none' }} />
              </label>

              <p style={{ marginTop: 12 }}><b>方式二：手动安装</b></p>
              <p>1. 将 <code>wechat.cc-plugin.js</code> 放到以下目录：</p>
              <p style={{ background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: 4, fontSize: 11, fontFamily: 'monospace' }}>
                C:\Users\{'用户名'}\.cc\plugins\
              </p>
              <p>2. 重启 CC 即可在工具箱看到微信</p>

              <p style={{ marginTop: 12 }}><b>关于 Chatlog</b></p>
              <p>Chatlog 是一个开源的微信聊天记录导出工具，CC 通过它实现：</p>
              <p>• 📨 接收微信消息（私聊+群聊）</p>
              <p>• 📤 发送微信消息（文本+图片+文件）</p>
              <p>• 📅 按日期查询历史消息</p>
              <p>• 🔗 消息上下文连续（不会每次开新话题）</p>
              <p style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 11 }}>
                需要先在电脑上安装并启动 Chatlog，然后安装微信插件即可使用。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 安装插件上传区 */}
      <div
        onDrop={async (e) => {
          e.preventDefault();
          const file = e.dataTransfer?.files?.[0];
          if (!file || !file.name.endsWith('.cc-plugin.js')) { alert('请上传 .cc-plugin.js 格式的插件文件'); return; }
          if (window.electronAPI?.installPlugin) {
            const result = await window.electronAPI.installPlugin(file.path || URL.createObjectURL(file));
            alert(result.success ? `插件 "${result.name}" 安装成功！请重启CC生效。` : `安装失败: ${result.error}`);
          } else {
            alert('插件安装功能需要 Electron 环境');
          }
        }}
        onDragOver={e => e.preventDefault()}
        style={{
          border: '2px dashed #444', borderRadius: 10, padding: 16, textAlign: 'center',
          marginTop: 16, color: '#888', fontSize: 12, cursor: 'pointer',
        }}>
        📦 安装新插件（拖拽 .cc-plugin.js 到此处）
        <label style={{ display: 'block', color: '#7b7bff', cursor: 'pointer', marginTop: 4 }}>
          或点击选择文件
          <input type="file" accept=".cc-plugin.js" onChange={async (e) => {
            const file = e.target?.files?.[0];
            if (!file) return;
            if (window.electronAPI?.installPlugin) {
              const result = await window.electronAPI.installPlugin(file.path || URL.createObjectURL(file));
              alert(result.success ? `插件 "${result.name}" 安装成功！` : `安装失败: ${result.error}`);
            } else {
              alert('插件安装功能需要 Electron 环境');
            }
          }} style={{ display: 'none' }} />
        </label>
      </div>

      {/* 飞书配置弹窗 */}
      {showFeishuConfig && (
        <div className="feishu-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowFeishuConfig(false); }}>
          <div className="feishu-modal" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="feishu-modal-header">
              <div className="feishu-modal-title-row">
                <FeishuIcon size={32} />
                <div>
                  <h2>飞书连接配置</h2>
                  <span className="feishu-modal-subtitle">连接后可使用消息、文档、多维表格等功能</span>
                </div>
              </div>
              <button className="feishu-modal-close" onClick={() => setShowFeishuConfig(false)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M3 3l8 8M11 3l-8 8"/>
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="feishu-modal-body">
              {/* 凭证表单区 */}
              <div className="feishu-form-section">
                <div className="feishu-field">
                  <label>App ID</label>
                  <div className="feishu-input-wrap">
                    <svg className="feishu-input-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                      <rect x="2" y="3" width="12" height="10" rx="2"/>
                      <path d="M5 7h6M5 9h4"/>
                    </svg>
                    <input
                      type="text"
                      value={appId}
                      onChange={e => setAppId(e.target.value)}
                      placeholder="cli_xxxxxxxxxxxx"
                      className="feishu-input"
                    />
                  </div>
                </div>
                <div className="feishu-field">
                  <label>App Secret</label>
                  <div className="feishu-input-wrap">
                    <svg className="feishu-input-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                      <rect x="3" y="6" width="10" height="7" rx="1.5"/>
                      <path d="M5 6V4a3 3 0 015.5-1.5"/>
                      <circle cx="8" cy="9.5" r="1" fill="currentColor"/>
                    </svg>
                    <input
                      type="password"
                      value={appSecret}
                      onChange={e => setAppSecret(e.target.value)}
                      placeholder="输入 App Secret"
                      className="feishu-input"
                    />
                  </div>
                </div>
              </div>

              {/* 引导区 */}
              <div className="feishu-guide-section">
                <button className="feishu-guide-header" onClick={() => setShowGuide(!showGuide)}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="8" cy="8" r="6.5"/>
                    <path d="M8 7.5v4M8 5a.5.5 0 000 1"/>
                  </svg>
                  <span>如何获取凭证？</span>
                  <svg className={`feishu-guide-toggle${showGuide ? ' open' : ''}`} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M3 5l3 3 3-3"/>
                  </svg>
                </button>
                {showGuide && (
                  <div className="feishu-guide-body">
                    {[
                      { num: 1, text: '浏览器打开 ', link: 'open.feishu.cn', url: 'https://open.feishu.cn', after: ' → 飞书扫码登录 → 开发者后台' },
                      { num: 2, text: '创建「企业自建应用」→ 名称填"CC助手"' },
                      { num: 3, text: '左侧菜单 → 凭证与基础信息 → 复制 App ID 和 App Secret' },
                      { num: 4, text: '左侧菜单 → 权限管理 → 开通所需 API 权限' },
                      { num: 5, text: '左侧菜单 → 事件订阅 → 选择「使用长连接接收事件」→ 添加 im.message.receive_v1' },
                      { num: 6, text: '创建版本 → 提交审核 → 发布应用' },
                    ].map(step => (
                      <div className="feishu-guide-step" key={step.num}>
                        <span className="feishu-guide-num">{step.num}</span>
                        <span className="feishu-guide-text">
                          {step.text}
                          {step.link && (
                            <a href="#" onClick={(e) => { e.preventDefault(); window.electronAPI?.openExternal(step.url); }}>{step.link}</a>
                          )}
                          {step.after || ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 权限自检面板 */}
              {feishuConnected && (
                <div className="feishu-perm-section">
                  <div className="feishu-perm-header">
                    <span>权限状态</span>
                    <button
                      className="feishu-perm-check-btn"
                      onClick={() => { const url = getFeishuPermissionUrl(); window.electronAPI?.openExternal(url); }}
                      title="在浏览器中打开飞书权限管理页面"
                    >
                      一键打开权限页面
                    </button>
                    <button
                      className="feishu-perm-check-btn"
                      onClick={handleCheckPermissions}
                      disabled={checkingPerms}
                    >
                      {checkingPerms ? '检测中...' : '重新检测'}
                    </button>
                  </div>
                  {permResults ? (
                    <div className="feishu-perm-list">
                      {permResults.results.map(r => (
                        <div key={r.domain} className={`feishu-perm-item ${r.ok ? 'ok' : 'fail'}`}>
                          <span className="feishu-perm-icon">{r.ok ? '✅' : '❌'}</span>
                          <span className="feishu-perm-label">{r.label}</span>
                          <span className="feishu-perm-domain">{r.domain}</span>
                          {!r.ok && (
                            <>
                              <button
                                className="feishu-perm-copy-btn"
                                style={{marginLeft:'auto'}}
                                onClick={async () => {
                                  const s = await copyScopeToClipboard(r.scope || r.domain);
                                  setConfigMsg(`info||已复制 ${s}，到权限页面搜索粘贴即可`);
                                }}
                                title={`复制 ${r.scope || r.domain} 到剪贴板`}
                              >
                                复制
                              </button>
                              <a
                                href="#"
                                className="feishu-perm-goto"
                                onClick={(e) => {
                                  e.preventDefault();
                                  const url = getFeishuPermissionUrl();
                                  window.electronAPI?.openExternal(url);
                                }}
                                title="在浏览器中打开飞书权限管理页面"
                              >
                                去开通
                              </a>
                            </>
                          )}
                        </div>
                      ))}
                      <div className="feishu-perm-summary">
                        {permResults.allOk ? '全部权限已开通 🎉' : `${permResults.okCount}/${permResults.total} 权限已开通，红色项需在飞书开发者后台配置`}
                      </div>
                    </div>
                  ) : (
                    <div className="feishu-perm-hint">点击"重新检测"查看权限状态</div>
                  )}
                </div>
              )}

              {/* Bot 配置（连接后显示） */}
              {feishuConnected && (
                <div className="feishu-bot-section">
                  <div className="feishu-bot-header" onClick={() => setShowBotConfig(!showBotConfig)}>
                    <span>🤖 CC Bot 自动回复</span>
                    <span className="feishu-bot-toggle">{showBotConfig ? '▲' : '▼'}</span>
                  </div>
                  {showBotConfig && (
                    <div className="feishu-bot-body">
                      <label className="feishu-bot-row">
                        <span>启用 Bot</span>
                        <input type="checkbox" checked={botConfig.enabled} onChange={handleToggleBot} />
                      </label>
                      <label className="feishu-bot-row">
                        <span>AI 自动回复</span>
                        <input type="checkbox" checked={botConfig.autoReply} onChange={handleToggleAutoReply} />
                      </label>
                      <div className="feishu-bot-row">
                        <span>回复风格</span>
                        <select value={botConfig.replyStyle} onChange={(e) => handleBotStyleChange(e.target.value)}>
                          <option value="friendly">友好亲切</option>
                          <option value="professional">专业正式</option>
                          <option value="concise">简洁高效</option>
                        </select>
                      </div>
                      <div className="feishu-bot-info">
                        CC Bot 在飞书中以你的身份自动回复消息。有人私聊或在群里 @你 时，Bot 会用 AI 智能回复。
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 状态消息 */}
              {configMsg && (() => {
                const [type, ...textParts] = configMsg.split('||');
                const text = textParts.join('||');
                const cls = type === 'success' ? 'success' : type === 'error' ? 'error' : 'info';
                return <div className={`feishu-config-msg ${cls}`}>{text}</div>;
              })()}

              {/* 按钮区 */}
              <div className="feishu-modal-actions">
                <button
                  className="feishu-btn secondary"
                  onClick={handleTestConnection}
                  disabled={testing || connecting}
                >
                  {testing ? (
                    <><span className="feishu-btn-spinner"/> 测试中...</>
                  ) : (
                    '测试连接'
                  )}
                </button>
                {feishuConnected ? (
                  <button className="feishu-btn danger" onClick={handleDisconnect}>
                    断开连接
                  </button>
                ) : (
                  <button
                    className="feishu-btn primary"
                    onClick={handleSaveAndConnect}
                    disabled={connecting}
                  >
                    {connecting ? (
                      <><span className="feishu-btn-spinner"/> 连接中...</>
                    ) : (
                      '保存并连接'
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
