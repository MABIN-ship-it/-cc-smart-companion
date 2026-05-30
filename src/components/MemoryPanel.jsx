import { useState, useEffect, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { saveMemories, applyForgettingRules } from '../services/memory';
import { getAllFields, setField, deleteField } from '../services/userProfile';
import { addDocument, addDocumentFromFile, listDocuments, removeDocument, getKnowledgeStats } from '../services/knowledgeBase';
import { getProjectContextData, addPendingTask, removePendingTask, addNote, removeNote, analyzeProject } from '../services/projectContext';
import { getRecentLessons, removeLesson, clearLessons, getLessonsStats } from '../services/lessonsLearned';

const FORGET_CONFIG_KEY = 'cc_forget_config';

function loadForgetConfig() {
  try {
    const raw = localStorage.getItem(FORGET_CONFIG_KEY);
    return raw ? JSON.parse(raw) : { chatDeleteDays: 7, workArchiveDays: 30, enabled: true };
  } catch { return { chatDeleteDays: 7, workArchiveDays: 30, enabled: true }; }
}

function saveForgetConfig(config) {
  localStorage.setItem(FORGET_CONFIG_KEY, JSON.stringify(config));
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsText(file);
  });
}

export default function MemoryPanel() {
  const { state, dispatch } = useApp();
  const [activeTab, setActiveTab] = useState('profile');
  const [forgetConfig, setForgetConfig] = useState(loadForgetConfig);
  const [cleaning, setCleaning] = useState(false);
  const [showDateInput, setShowDateInput] = useState(false);
  const [dateTitle, setDateTitle] = useState('');
  const [dateValue, setDateValue] = useState('');
  const [knowledgeStatus, setKnowledgeStatus] = useState('');
  const [kbDocs, setKbDocs] = useState(() => listDocuments());
  const [kbStats, setKbStats] = useState(() => getKnowledgeStats());
  const [projectCtx, setProjectCtx] = useState(() => getProjectContextData());
  const [showPendingInput, setShowPendingInput] = useState(false);
  const [pendingText, setPendingText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [lessonsList, setLessonsList] = useState(() => getRecentLessons(50));
  const [lessonsStats, setLessonsStats] = useState(() => getLessonsStats());
  const dateInputRef = useRef(null);

  const refreshProject = () => setProjectCtx(getProjectContextData());
  const refreshLessons = () => {
    setLessonsList(getRecentLessons(50));
    setLessonsStats(getLessonsStats());
  };

  // ─── 用户画像编辑状态 ───
  const [profileFields, setProfileFields] = useState(() => getAllFields());
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showAddField, setShowAddField] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const refreshProfile = () => setProfileFields(getAllFields());

  const hotMemories = state.memories.filter(m => m.level === 'hot');
  const warmMemories = state.memories.filter(m => m.level === 'warm');
  const userMemories = hotMemories.filter(m => m.type === 'user');
  const projectMemories = hotMemories.filter(m => m.type === 'project');
  const dateMemories = hotMemories.filter(m => m.type === 'date');

  const handleDelete = (id) => {
    const updated = state.memories.filter(m => m.id !== id);
    dispatch({ type: 'SET_MEMORIES', payload: updated });
    saveMemories(updated);
  };

  const [dateReason, setDateReason] = useState('');
  const [dateRecurring, setDateRecurring] = useState(true);

  const confirmAddDate = () => {
    if (!dateTitle.trim() || !dateValue) return;
    const mem = {
      id: Date.now().toString(),
      content: `📅 ${dateTitle.trim()} | ${dateValue}`,
      type: 'date',
      level: 'hot',
      importance: 5,
      mentions: 1,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      expiresAt: Date.now() + 365 * 24 * 3600 * 1000,
      source: 'manual',
      reason: dateReason.trim(),
      recurring: dateRecurring,
      dateValue: dateValue,
    };
    const updated = [...state.memories, mem];
    dispatch({ type: 'SET_MEMORIES', payload: updated });
    saveMemories(updated);
    setShowDateInput(false);
    setDateTitle('');
    setDateValue('');
    setDateReason('');
    setDateRecurring(true);
  };

  const handleAddKnowledge = async () => {
    // Electron：用原生对话框获取文件路径（支持PDF/DOCX Python解析）
    if (window.electronAPI?.selectFiles) {
      try {
        const filePaths = await window.electronAPI.selectFiles();
        if (!filePaths || filePaths.length === 0) return;

        for (const filePath of filePaths) {
          const fileName = filePath.split(/[\\/]/).pop();
          const ext = fileName.split('.').pop()?.toLowerCase();
          setKnowledgeStatus(`正在处理 ${fileName}...`);

          if (['jpg', 'png', 'jpeg', 'gif', 'bmp'].includes(ext)) {
            addDocument(fileName, '', filePath);
            setKnowledgeStatus(`已记录图片: ${fileName}`);
          } else {
            await addDocumentFromFile(filePath);
            setKnowledgeStatus(`✅ 已入库: ${fileName}`);
          }

          // 创建记忆记录
          createKnowledgeMemory({ name: fileName, size: 0 });
          refreshKb();
        }
        setTimeout(() => setKnowledgeStatus(''), 2500);
      } catch (err) {
        console.error('知识库入库失败:', err);
        setKnowledgeStatus(`❌ 入库失败: ${err.message || '未知错误'}`);
        setTimeout(() => setKnowledgeStatus(''), 4000);
      }
      return;
    }

    // 浏览器回退：用 <input type="file">
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.md,.txt,.jpg,.png,.py,.js,.jsx,.ts,.tsx,.css,.html,.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setKnowledgeStatus(`正在处理 ${file.name}...`);
      const ext = file.name.split('.').pop()?.toLowerCase();

      try {
        if (['pdf', 'docx'].includes(ext)) {
          setKnowledgeStatus(`⚠️ PDF/DOCX需要在桌面应用中解析`);
          setTimeout(() => setKnowledgeStatus(''), 3000);
          return;
        }
        if (['jpg', 'png', 'jpeg', 'gif', 'bmp'].includes(ext)) {
          createKnowledgeMemory(file);
          setKnowledgeStatus(`已记录图片: ${file.name}`);
          setTimeout(() => setKnowledgeStatus(''), 2500);
          refreshKb();
          return;
        }
        const text = await readFileAsText(file);
        addDocument(file.name, text);
        createKnowledgeMemory(file);
        setKnowledgeStatus(`✅ 已入库: ${file.name}`);
        setTimeout(() => setKnowledgeStatus(''), 2500);
        refreshKb();
      } catch (err) {
        console.error('知识库入库失败:', err);
        setKnowledgeStatus(`❌ 入库失败: ${err.message || '未知错误'}`);
        setTimeout(() => setKnowledgeStatus(''), 4000);
      }
    };
    input.click();
  };

  const createKnowledgeMemory = (file) => {
    const mem = {
      id: Date.now().toString(),
      content: `📄 ${file.name} (${(file.size / 1024).toFixed(1)}KB)`,
      type: 'knowledge',
      level: 'hot',
      importance: 4,
      mentions: 1,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      expiresAt: Date.now() + 365 * 24 * 3600 * 1000,
      source: 'upload',
    };
    const updated = [...state.memories, mem];
    dispatch({ type: 'SET_MEMORIES', payload: updated });
    saveMemories(updated);
  };

  const refreshKb = () => {
    setKbDocs(listDocuments());
    setKbStats(getKnowledgeStats());
  };

  const handleRemoveKbDoc = (docId) => {
    removeDocument(docId);
    refreshKb();
  };

  const tabs = [
    { key: 'profile', label: '用户画像', count: Object.keys(profileFields).length },
    { key: 'project', label: '项目记忆', count: projectMemories.length },
    { key: 'dates', label: '重要日期', count: dateMemories.length },
    { key: 'knowledge', label: '知识库', count: kbStats.documentCount },
    { key: 'lessons', label: '经验教训', count: lessonsStats.total },
    { key: 'settings', label: '遗忘设置', count: null },
  ];

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
      {/* Header */}
      <div style={{
        padding: 20, borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>🧠 CC的记忆</div>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_MEMORY_PANEL' })}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            fontSize: 20, cursor: 'pointer',
          }}
        >✕</button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border)',
        padding: '0 12px', gap: 2, overflowX: 'auto',
      }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '8px 7px', fontSize: 11, border: 'none', flexShrink: 0,
              background: 'none', cursor: 'pointer',
              color: activeTab === t.key ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: activeTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}{t.count !== null && t.count > 0 ? `(${t.count})` : ''}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
        {activeTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* ─── 本周摘要 ─── */}
            {(profileFields['当前项目'] || profileFields['输出偏好'] || profileFields['决策规则']) && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(100,100,255,0.08), rgba(100,200,255,0.05))',
                border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
                padding: 14, marginBottom: 4,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--accent-light)' }}>
                  📌 你的当前状态
                </div>
                {profileFields['当前项目'] && (
                  <div style={{ fontSize: 12, marginBottom: 4, color: 'var(--text-main)' }}>
                    🔍 主要关注：{Array.isArray(profileFields['当前项目']) ? profileFields['当前项目'].join('、') : profileFields['当前项目']}
                  </div>
                )}
                {profileFields['输出偏好'] && (
                  <div style={{ fontSize: 12, marginBottom: 4, color: 'var(--text-main)' }}>
                    📝 输出偏好：{Array.isArray(profileFields['输出偏好']) ? profileFields['输出偏好'].join('、') : profileFields['输出偏好']}
                  </div>
                )}
                {profileFields['决策规则'] && Array.isArray(profileFields['决策规则']) && profileFields['决策规则'].length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-main)' }}>
                    ⚡ 你的规则：
                    {profileFields['决策规则'].slice(0, 5).map((r, i) => (
                      <div key={i} style={{ marginLeft: 12, marginTop: 2, fontSize: 11, color: 'var(--text-muted)' }}>
                        • {r.value}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              CC了解到的关于你的信息（自动提取 + 可手动编辑）：
            </div>
            {Object.keys(profileFields).length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>
                还没有用户画像。<br/>多和CC聊天，CC会慢慢了解你。
              </div>
            ) : (
              Object.entries(profileFields).map(([key, val]) => (
                <div key={key} style={{
                  background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
                  padding: '8px 12px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', gap: 8,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--accent-light)', marginBottom: 2, fontWeight: 600 }}>
                      {key}
                    </div>
                    {editingKey === key ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              setField(key, editValue.includes('、') ? editValue.split('、').map(s => s.trim()).filter(Boolean) : editValue);
                              setEditingKey(null);
                              refreshProfile();
                            }
                            if (e.key === 'Escape') { setEditingKey(null); }
                          }}
                          autoFocus
                          style={{
                            flex: 1, background: 'var(--bg-hover)', border: '1px solid var(--accent)',
                            borderRadius: 4, color: 'var(--text-primary)', padding: '4px 8px',
                            fontSize: 12, outline: 'none', fontFamily: 'inherit',
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, cursor: 'pointer' }}
                        onClick={() => {
                          setEditingKey(key);
                          setEditValue(Array.isArray(val) ? val.join('、') : String(val));
                        }}
                        title="点击编辑"
                      >
                        {Array.isArray(val) ? val.join('、') : String(val)}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => { deleteField(key); refreshProfile(); }}
                    style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 14, padding: 2, flexShrink: 0,
                    }}
                    title="删除此字段"
                  >✕</button>
                </div>
              ))
            )}
            {showAddField ? (
              <div style={{
                background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
                padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <input
                  value={newKey}
                  onChange={e => setNewKey(e.target.value)}
                  placeholder="字段名（如：饮食习惯）"
                  style={{
                    background: 'var(--bg-hover)', border: '1px solid var(--border)',
                    borderRadius: 4, color: 'var(--text-primary)', padding: '4px 8px',
                    fontSize: 12, outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <input
                  value={newVal}
                  onChange={e => setNewVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newKey.trim() && newVal.trim()) {
                      setField(newKey.trim(), newVal.trim());
                      setNewKey(''); setNewVal(''); setShowAddField(false);
                      refreshProfile();
                    }
                    if (e.key === 'Escape') { setShowAddField(false); setNewKey(''); setNewVal(''); }
                  }}
                  placeholder="值（多个用、分隔）"
                  style={{
                    background: 'var(--bg-hover)', border: '1px solid var(--border)',
                    borderRadius: 4, color: 'var(--text-primary)', padding: '4px 8px',
                    fontSize: 12, outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setShowAddField(false); setNewKey(''); setNewVal(''); }}
                    style={{
                      padding: '3px 10px', borderRadius: 4, border: '1px solid var(--border)',
                      background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11,
                    }}
                  >取消</button>
                  <button
                    onClick={() => {
                      if (newKey.trim() && newVal.trim()) {
                        setField(newKey.trim(), newVal.trim());
                        setNewKey(''); setNewVal(''); setShowAddField(false);
                        refreshProfile();
                      }
                    }}
                    disabled={!newKey.trim() || !newVal.trim()}
                    style={{
                      padding: '3px 10px', borderRadius: 4, border: 'none',
                      background: (newKey.trim() && newVal.trim()) ? 'var(--accent)' : 'var(--bg-hover)',
                      color: (newKey.trim() && newVal.trim()) ? '#fff' : 'var(--text-muted)',
                      cursor: (newKey.trim() && newVal.trim()) ? 'pointer' : 'default', fontSize: 11,
                    }}
                  >确认</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddField(true)}
                style={{
                  width: '100%', padding: 8, borderRadius: 'var(--radius-sm)',
                  border: '1px dashed var(--border)', background: 'none',
                  color: 'var(--accent)', cursor: 'pointer', fontSize: 13,
                }}
              >
                + 添加字段
              </button>
            )}
          </div>
        )}

        {activeTab === 'project' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!projectCtx ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>
                还没有设置工作区。<br/>点击左侧工具栏的📂设置项目文件夹，<br/>CC将自动分析项目结构和技术栈。
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  📂 {projectCtx.path}
                </div>

                {/* 项目概况 */}
                <div style={{
                  background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', padding: 12,
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {projectCtx.name}
                  </div>
                  {projectCtx.projectType && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      类型：{projectCtx.projectType}
                    </div>
                  )}
                  {projectCtx.techStack?.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {projectCtx.techStack.map(t => (
                        <span key={t} style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 10,
                          background: 'var(--accent)', color: '#fff',
                        }}>{t}</span>
                      ))}
                    </div>
                  )}
                  {projectCtx.gitBranch && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      git: {projectCtx.gitBranch} {projectCtx.gitStatus && projectCtx.gitStatus !== '(clean)' ? '· 有未提交变更' : '· 干净'}
                    </div>
                  )}
                  {projectCtx.structure && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                      结构: {projectCtx.structure.slice(0, 120)}{projectCtx.structure.length > 120 ? '...' : ''}
                    </div>
                  )}
                  {projectCtx.keyFiles?.length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      关键文件: {projectCtx.keyFiles.map(f => f.path).join(', ')}
                    </div>
                  )}
                  {projectCtx.lastAnalyzed && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      上次分析: {new Date(projectCtx.lastAnalyzed).toLocaleString('zh-CN')}
                    </div>
                  )}
                </div>

                {/* 上次任务 */}
                {projectCtx.lastTask && (
                  <div style={{
                    background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', padding: '10px 12px',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--accent-light)', marginBottom: 2 }}>
                      ⏮ 上次任务
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                      {projectCtx.lastTask}
                    </div>
                    {projectCtx.lastTaskAt && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        {new Date(projectCtx.lastTaskAt).toLocaleString('zh-CN')}
                      </div>
                    )}
                  </div>
                )}

                {/* 待办任务 */}
                <div style={{
                  background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', padding: '10px 12px',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--accent-light)', marginBottom: 6 }}>
                    📋 待办事项
                  </div>
                  {projectCtx.pendingTasks?.length > 0 ? (
                    projectCtx.pendingTasks.map((t, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        fontSize: 13, color: 'var(--text-primary)', padding: '4px 0',
                      }}>
                        <span>{i + 1}. {t}</span>
                        <button
                          onClick={() => { removePendingTask(i); refreshProject(); }}
                          style={{
                            background: 'none', border: 'none', color: 'var(--text-muted)',
                            cursor: 'pointer', fontSize: 12, padding: 2,
                          }}
                        >✕</button>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>暂无待办</div>
                  )}
                  {showPendingInput ? (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      <input
                        value={pendingText}
                        onChange={e => setPendingText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && pendingText.trim()) {
                            addPendingTask(pendingText.trim());
                            setPendingText(''); setShowPendingInput(false);
                            refreshProject();
                          }
                          if (e.key === 'Escape') { setShowPendingInput(false); setPendingText(''); }
                        }}
                        placeholder="新待办..."
                        autoFocus
                        style={{
                          flex: 1, background: 'var(--bg-hover)', border: '1px solid var(--accent)',
                          borderRadius: 4, color: 'var(--text-primary)', padding: '4px 8px',
                          fontSize: 12, outline: 'none', fontFamily: 'inherit',
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowPendingInput(true)}
                      style={{
                        padding: '3px 10px', borderRadius: 4, border: '1px dashed var(--border)',
                        background: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11,
                        marginTop: 6, alignSelf: 'flex-start',
                      }}
                    >+ 添加待办</button>
                  )}
                </div>

                {/* 笔记 */}
                <div style={{
                  background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', padding: '10px 12px',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--accent-light)', marginBottom: 6 }}>
                    📝 笔记
                  </div>
                  {projectCtx.notes?.length > 0 ? (
                    projectCtx.notes.map((n, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        fontSize: 12, color: 'var(--text-primary)', padding: '4px 0',
                        borderBottom: i < projectCtx.notes.length - 1 ? '1px solid var(--border)' : 'none',
                      }}>
                        <div style={{ flex: 1 }}>
                          <div>{n.text}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {new Date(n.time).toLocaleString('zh-CN')}
                          </div>
                        </div>
                        <button
                          onClick={() => { removeNote(i); refreshProject(); }}
                          style={{
                            background: 'none', border: 'none', color: 'var(--text-muted)',
                            cursor: 'pointer', fontSize: 12, padding: 2,
                          }}
                        >✕</button>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>暂无笔记</div>
                  )}
                  {showNoteInput ? (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      <input
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && noteText.trim()) {
                            addNote(noteText.trim());
                            setNoteText(''); setShowNoteInput(false);
                            refreshProject();
                          }
                          if (e.key === 'Escape') { setShowNoteInput(false); setNoteText(''); }
                        }}
                        placeholder="写个笔记..."
                        autoFocus
                        style={{
                          flex: 1, background: 'var(--bg-hover)', border: '1px solid var(--accent)',
                          borderRadius: 4, color: 'var(--text-primary)', padding: '4px 8px',
                          fontSize: 12, outline: 'none', fontFamily: 'inherit',
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNoteInput(true)}
                      style={{
                        padding: '3px 10px', borderRadius: 4, border: '1px dashed var(--border)',
                        background: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11,
                        marginTop: 6, alignSelf: 'flex-start',
                      }}
                    >+ 添加笔记</button>
                  )}
                </div>

                {/* 重新分析 */}
                <button
                  onClick={async () => {
                    if (projectCtx?.path && window.electronAPI?.listProjectFiles) {
                      await analyzeProject(projectCtx.path);
                      refreshProject();
                    }
                  }}
                  style={{
                    width: '100%', padding: 6, borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
                  }}
                >🔄 重新分析项目</button>
              </>
            )}
          </div>
        )}

        {activeTab === 'dates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              📅 重要日期和提醒：
            </div>
            {dateMemories.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>
                还没有重要日期记录。
              </div>
            ) : (
              dateMemories.map(m => (
                <div key={m.id} style={{
                  background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', gap: 8,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                      {m.content}
                    </div>
                    {m.reason && (
                      <div style={{ fontSize: 11, color: 'var(--accent-light)', marginTop: 2 }}>
                        原因: {m.reason}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {m.recurring !== false ? '🔄 每年重复' : '📍 单次'} · {m.source === 'auto' ? 'CC提取' : '手动添加'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(m.id)}
                    style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 14, padding: 2, flexShrink: 0,
                    }}
                  >✕</button>
                </div>
              ))
            )}
            {showDateInput ? (
              <div style={{
                background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
                padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <input
                  ref={dateInputRef}
                  value={dateTitle}
                  onChange={e => setDateTitle(e.target.value)}
                  placeholder="事件标题"
                  style={{
                    background: 'var(--bg-hover)', border: '1px solid var(--border)',
                    borderRadius: 6, color: 'var(--text-primary)', padding: '6px 10px',
                    fontSize: 13, outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <input
                  type="date"
                  value={dateValue}
                  onChange={e => setDateValue(e.target.value)}
                  style={{
                    background: 'var(--bg-hover)', border: '1px solid var(--border)',
                    borderRadius: 6, color: 'var(--text-primary)', padding: '6px 10px',
                    fontSize: 13, outline: 'none',
                  }}
                />
                <input
                  value={dateReason}
                  onChange={e => setDateReason(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && dateTitle.trim() && dateValue) confirmAddDate(); if (e.key === 'Escape') setShowDateInput(false); }}
                  placeholder="原因/备注（如：大学室友生日）"
                  style={{
                    background: 'var(--bg-hover)', border: '1px solid var(--border)',
                    borderRadius: 6, color: 'var(--text-primary)', padding: '6px 10px',
                    fontSize: 13, outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={dateRecurring}
                    onChange={e => setDateRecurring(e.target.checked)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  每年重复
                </label>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setShowDateInput(false); setDateReason(''); setDateRecurring(true); }}
                    style={{
                      padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)',
                      background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
                    }}
                  >取消</button>
                  <button
                    onClick={confirmAddDate}
                    disabled={!dateTitle.trim() || !dateValue}
                    style={{
                      padding: '4px 12px', borderRadius: 6, border: 'none',
                      background: (dateTitle.trim() && dateValue) ? 'var(--accent)' : 'var(--bg-hover)',
                      color: (dateTitle.trim() && dateValue) ? '#fff' : 'var(--text-muted)',
                      cursor: (dateTitle.trim() && dateValue) ? 'pointer' : 'default', fontSize: 12,
                    }}
                  >确认</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setShowDateInput(true); setDateTitle(''); setDateValue(''); setDateReason(''); setDateRecurring(true); setTimeout(() => dateInputRef.current?.focus(), 100); }}
                style={{
                  width: '100%', padding: 8, borderRadius: 'var(--radius-sm)',
                  border: '1px dashed var(--border)', background: 'none',
                  color: 'var(--accent)', cursor: 'pointer', fontSize: 13,
                }}
              >
                + 添加重要日期
              </button>
            )}
          </div>
        )}

        {activeTab === 'knowledge' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              📂 知识库文档（可被CC检索）：
            </div>

            {/* 状态提示 */}
            {knowledgeStatus && (
              <div style={{
                padding: '8px 12px', borderRadius: 6, fontSize: 12,
                background: knowledgeStatus.startsWith('✅') ? 'rgba(0,206,201,0.15)' :
                             knowledgeStatus.startsWith('❌') ? 'rgba(255,107,107,0.15)' :
                             knowledgeStatus.startsWith('⚠') ? 'rgba(253,203,110,0.15)' :
                             'rgba(108,92,231,0.15)',
                color: 'var(--text-primary)',
                animation: 'fadeIn 0.2s ease-out',
              }}>
                {knowledgeStatus}
              </div>
            )}

            {/* 知识库统计 */}
            {kbStats.documentCount > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 0' }}>
                {kbStats.documentCount} 篇文档 · {kbStats.chunkCount} 个片段 · {(kbStats.totalChars / 1024).toFixed(0)}KB
              </div>
            )}

            {/* 已入库文档列表 */}
            {kbDocs.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>
                还没有上传文档。<br/>上传后CC在对话中就能引用你的资料了。
              </div>
            ) : (
              kbDocs.map(doc => (
                <div key={doc.id} style={{
                  background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', gap: 8,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                      📄 {doc.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {doc.type?.toUpperCase()} · {doc.chunkCount}片段 · {new Date(doc.addedAt).toLocaleDateString('zh-CN')}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveKbDoc(doc.id)}
                    style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 14, padding: 2, flexShrink: 0,
                    }}
                    title="从知识库中移除"
                  >✕</button>
                </div>
              ))
            )}

            {/* 上传按钮 */}
            <button
              onClick={handleAddKnowledge}
              style={{
                width: '100%', padding: 8, borderRadius: 'var(--radius-sm)',
                border: '1px dashed var(--border)', background: 'none',
                color: 'var(--accent)', cursor: 'pointer', fontSize: 13,
              }}
            >
              + 添加资料（PDF/Word/MD/TXT/代码/图片）
            </button>

            {/* 旧记忆记录（向后兼容） */}
            {(() => {
              const mems = state.memories.filter(m => m.type === 'knowledge');
              if (mems.length === 0) return null;
              return (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                    旧版记录（仅元数据）：
                  </div>
                  {mems.map(m => (
                    <MemoryCard key={m.id} memory={m} onDelete={handleDelete} />
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'lessons' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              🧠 CC从对话中学到的经验：
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              成功 {lessonsStats.successes} 条 · 教训 {lessonsStats.mistakes} 条
            </div>
            {lessonsList.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>
                还没有经验记录。<br/>当你说"不对"、"太好了"等反馈时，<br/>CC会自动学习。
              </div>
            ) : (
              lessonsList.map(l => (
                <div key={l.id} style={{
                  background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', gap: 8,
                  borderLeft: l.isMistake ? '3px solid var(--danger)' : '3px solid #00cec9',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: l.isMistake ? 'var(--danger)' : '#00cec9', marginBottom: 4 }}>
                      {l.isMistake ? '❌ 教训' : '✅ 成功经验'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      场景：{l.context}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', marginTop: 2 }}>
                      {l.approach}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--accent-light)', marginTop: 2 }}>
                      用户反馈：{l.result}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {new Date(l.createdAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  <button
                    onClick={() => { removeLesson(l.id); refreshLessons(); }}
                    style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 14, padding: 2, flexShrink: 0,
                    }}
                  >✕</button>
                </div>
              ))
            )}
            {lessonsList.length > 0 && (
              <button
                onClick={() => { clearLessons(); refreshLessons(); }}
                style={{
                  width: '100%', padding: 6, borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)', background: 'var(--bg-card)',
                  color: 'var(--danger)', cursor: 'pointer', fontSize: 12,
                }}
              >🗑 清空经验记录</button>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              ⚙️ 遗忘策略
            </div>

            {/* Toggle: Enable auto-forgetting */}
            <label style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>启用自动遗忘</span>
              <Toggle
                checked={forgetConfig.enabled}
                onChange={v => {
                  const c = { ...forgetConfig, enabled: v };
                  setForgetConfig(c);
                  saveForgetConfig(c);
                }}
              />
            </label>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', opacity: forgetConfig.enabled ? 1 : 0.4, transition: 'opacity 0.2s' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
                marginBottom: 8,
              }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>💬 闲聊记忆自动删除</span>
                <select
                  value={forgetConfig.chatDeleteDays}
                  onChange={e => {
                    const c = { ...forgetConfig, chatDeleteDays: Number(e.target.value) };
                    setForgetConfig(c);
                    saveForgetConfig(c);
                  }}
                  disabled={!forgetConfig.enabled}
                  style={{
                    background: 'var(--bg-hover)', border: '1px solid var(--border)',
                    borderRadius: 6, color: 'var(--text-primary)', padding: '4px 8px',
                    fontSize: 12, cursor: 'pointer',
                  }}
                >
                  <option value={3}>3天</option>
                  <option value={7}>7天</option>
                  <option value={14}>14天</option>
                  <option value={30}>30天</option>
                </select>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>💼 工作记忆归档</span>
                <select
                  value={forgetConfig.workArchiveDays}
                  onChange={e => {
                    const c = { ...forgetConfig, workArchiveDays: Number(e.target.value) };
                    setForgetConfig(c);
                    saveForgetConfig(c);
                  }}
                  disabled={!forgetConfig.enabled}
                  style={{
                    background: 'var(--bg-hover)', border: '1px solid var(--border)',
                    borderRadius: 6, color: 'var(--text-primary)', padding: '4px 8px',
                    fontSize: 12, cursor: 'pointer',
                  }}
                >
                  <option value={14}>14天</option>
                  <option value={30}>30天</option>
                  <option value={60}>60天</option>
                  <option value={90}>90天</option>
                </select>
              </div>
            </div>

            {/* Static rules */}
            <div style={{
              background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
              padding: 14, fontSize: 13, lineHeight: 2, color: 'var(--text-secondary)',
            }}>
              <div>⭐ 重要记忆 → <span style={{ color: '#00cec9' }}>永久保存</span></div>
              <div>🔄 重复≥3次 → <span style={{ color: '#a78bfa' }}>自动升级为热记忆</span></div>
              <div>😊 情绪强烈 → <span style={{ color: '#ff6b6b' }}>自动标记重要</span></div>
            </div>

            {/* Run cleanup button */}
            <button
              onClick={async () => {
                setCleaning(true);
                const cleaned = await applyForgettingRules();
                dispatch({ type: 'SET_MEMORIES', payload: cleaned });
                setCleaning(false);
              }}
              disabled={cleaning}
              style={{
                width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', background: 'var(--bg-card)',
                color: cleaning ? 'var(--text-muted)' : 'var(--danger)',
                cursor: cleaning ? 'default' : 'pointer', fontSize: 13,
              }}
            >
              {cleaning ? '清理中...' : '🗑 立即清理过期记忆'}
            </button>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              记忆总数: {state.memories.length} | 热记忆: {hotMemories.length} | 温记忆: {warmMemories.length}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MemoryCard({ memory, onDelete }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
      padding: '10px 12px', display: 'flex', justifyContent: 'space-between',
      alignItems: 'flex-start', gap: 8,
    }}>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1, lineHeight: 1.5 }}>
        {memory.content}
      </div>
      <button
        onClick={() => onDelete(memory.id)}
        style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', fontSize: 14, padding: 2,
          flexShrink: 0,
        }}
        title="删除此记忆"
      >
        ✕
      </button>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
        background: checked ? 'var(--accent)' : 'var(--border)',
        position: 'relative', transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3,
        left: checked ? 23 : 3,
        transition: 'left 0.2s',
      }} />
    </div>
  );
}
