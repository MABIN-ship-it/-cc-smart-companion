import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../store/AppContext';
import { sendMessage, subconsciousThink, angelDevilThink } from '../services/agent';
import { loadMemories, extractMemoryFromConversation, applyForgettingRules } from '../services/memory';
import { extractProfileDiff, applyDiff } from '../services/userProfile';
import { detectUserFeedback, addLesson } from '../services/lessonsLearned';
import { addFavorite, addFeedback, addReport } from '../services/interactions';
import { isSpeechSupported, isMediaRecorderSupported, startListening, speakText, stopListening, startVoiceRecording, stopVoiceRecording, cancelVoiceRecording, transcribeAudio } from '../services/speech';
import { startProactiveEngine } from '../services/proactive';
import { startScheduledScan, stopScheduledScan } from '../services/feishuMonitor';
import { dispatchFeishuMessage, extractTextFromEvent, extractSenderOpenId, sendWelcomeMessage, replyToMessage, sendMessage as feishuSendMessage, isFeishuConfigured, getFeishuConfig } from '../services/feishu';
import { createExpressionEngine } from '../services/expressionEngine';
import { createEmotionEngine } from '../services/emotionEngine';
import { createPresenceManager } from '../services/presenceManager';
import { getRelationship, recordConversation, getLevelInfo } from '../services/relationshipTracker';
import { initNetworkMonitor, categorizeError, isRetryable, withRetry } from '../services/errorHandler';
import { getAvailableModels, getCurrentModel, setCurrentModel, setApiKey, getApiKey, getUserModelName, setUserModelName, getExtraHeader, setExtraHeader, getCustomProviders, saveCustomProvider, deleteCustomProvider } from '../services/modelAdapter';
import { setWorkspaceContext } from '../services/toolRegistry';
import { analyzeProject } from '../services/projectContext';
import { addDocumentFromFile } from '../services/knowledgeBase';
import { getKnowledgeSystem } from '../knowledge/KnowledgeSystem.js';
import MemoryPanel from './MemoryPanel';
import PersonalityPanel from './PersonalityPanel';
import SessionsPanel from './SessionsPanel';
import SessionBubbles from './SessionBubbles';
import VoiceClonePanel from './VoiceClonePanel';
import KnowledgeGraphPanel from './panels/KnowledgeGraphPanel';
import PlanCard from './PlanCard';
import ToolCallCard from './ToolCallCard';
import CharacterScene from './CharacterScene';
import AngelDevilOverlay from './AngelDevilOverlay';
import StageBackground from './StageBackground';
import ChatBubbleLayer from './ChatBubbleLayer';
import InputBar from './InputBar';
import ToolIcon, {
  ApiKeyIcon, PersonalityIcon, VoiceIcon, VoiceCloneIcon,
  MemoryIcon, FolderIcon, ChatHistoryIcon, KnowledgeGraphIcon, ToolboxIcon,
} from './ToolIcon';
import ToolboxPanel from './ToolboxPanel';
import ProactivePrompt from './ProactivePrompt';

export default function ChatInterface() {
  const { state, dispatch } = useApp();
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [thinkingText, setThinkingText] = useState('');
  const thinkingTextRef = useRef('');
  const [showApiModal, setShowApiModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(getCurrentModel());
  const [apiSearch, setApiSearch] = useState('');
  const [modelNameInput, setModelNameInput] = useState('');
  const [showModelNameInput, setShowModelNameInput] = useState(false);
  const [extraHeaderInputs, setExtraHeaderInputs] = useState({});
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customForm, setCustomForm] = useState({ name: '', endpoint: '', modelName: '' });
  const [toolSteps, setToolSteps] = useState([]);
  const [streamingText, setStreamingText] = useState('');
  const [animParams, setAnimParams] = useState({});
  const [angelDevil, setAngelDevil] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [retrying, setRetrying] = useState(false);
  const [showOnlineToast, setShowOnlineToast] = useState(false);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [knowledgeGraphPanelOpen, setKnowledgeGraphPanelOpen] = useState(false);
  const [planPanelOpen, setPlanPanelOpen] = useState(false);
  const [planContent, setPlanContent] = useState('');
  const [pendingImages, setPendingImages] = useState([]); // base64 图片等待发送
  const [transcribing, setTranscribing] = useState(false); // STT转写中
  const [updateStatus, setUpdateStatus] = useState(null); // null | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  const wasOfflineRef = useRef(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const apiKeyInputRef = useRef(null);
  const abortRef = useRef(null);
  const stateRef = useRef(state);
  const engineRef = useRef(null);
  const emotionRef = useRef(null);
  const presenceRef = useRef(null);
  const animFrameRef = useRef(0);
  const feishuReplyRef = useRef(null); // { type: 'reply', eventData } | { type: 'chat', chatId }
  const processUserMessageRef = useRef(null);
  stateRef.current = state;

  // Init engines
  useEffect(() => {
    engineRef.current = createExpressionEngine();
    emotionRef.current = createEmotionEngine();
    presenceRef.current = createPresenceManager();

    // Wire presence manager callbacks
    presenceRef.current.setCallbacks({
      onGreeting(msg) {
        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: msg, type: 'care' } });
      },
      onReturn(msg) {
        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: msg, type: 'share' } });
      },
      onSilence(msg) {
        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: msg, type: 'share' } });
      },
      onWakeUp() {
        engineRef.current?.onUserActivity();
      },
    });

    presenceRef.current.start();

    // Network monitoring
    const cleanupNetwork = initNetworkMonitor((status) => {
      setIsOnline(status === 'online');
      if (status === 'offline') {
        wasOfflineRef.current = true;
        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: '⚠️ 网络连接已断开，消息可能无法发送', type: 'system' } });
      } else if (status === 'online' && wasOfflineRef.current) {
        wasOfflineRef.current = false;
        setShowOnlineToast(true);
        setTimeout(() => setShowOnlineToast(false), 2500);
      }
    });

    // Relationship: check for level-up question on mount
    const rel = getRelationship();
    if (rel.askedQuestions) {
      // Already handled in recordConversation
    }

    // Initialize KnowledgeSystem (await migration)
    const ks = getKnowledgeSystem();
    if (ks) {
      (async () => {
        try {
          await ks.initialize();
          const stats = ks.getStats();
          console.log('[KS] 初始化完成, 实体数:', stats?.totalEntities);

          // 兜底：迁移后仍为空，从旧系统直接导入
          if (!stats?.totalEntities) {
            const { loadMemories } = await import('../services/memory.js');
            const { loadProfile } = await import('../services/userProfile.js');
            const { getRecentLessons } = await import('../services/lessonsLearned.js');

            const memories = loadMemories();
            const profile = loadProfile();
            const lessons = getRecentLessons(100);

            if (memories.length || Object.keys(profile.fields || {}).length || lessons.length) {
              for (const m of memories) {
                try {
                  ks._storage.putEntity(m.id || `mem_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, {
                    type: 'memory', content: m.content, level: m.level || 'warm',
                    importance: m.importance || 5, memoryType: m.type || 'user',
                    mentions: m.mentions || 1, source: m.source || 'auto',
                    createdAt: m.createdAt || Date.now(), lastAccessed: m.lastAccessed || Date.now(),
                    expiresAt: m.expiresAt || null, _updatedAt: m.createdAt || Date.now(),
                  });
                } catch {}
              }
              for (const [key, value] of Object.entries(profile.fields || {})) {
                try {
                  if (value && typeof value === 'string' && key !== 'updatedAt') {
                    ks._storage.putEntity(`profile_${key}`, {
                      type: 'profile_fact', category: 'general', key, value,
                      confidence: 0.5, evidence: '(从旧版数据导入)', _updatedAt: profile.updatedAt || Date.now(),
                    });
                  }
                } catch {}
              }
              for (const l of lessons) {
                try {
                  ks._storage.putEntity(l.id || `lesson_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, {
                    type: 'lesson', context: l.context, approach: l.approach || '',
                    result: l.result || '', isMistake: l.isMistake || false,
                    createdAt: l.createdAt || Date.now(), _updatedAt: l.createdAt || Date.now(),
                  });
                } catch {}
              }
              ks._storage.tryPersist();
              console.log('[KS] 兜底导入完成, 实体数:', ks.getStats()?.totalEntities);
            }
          }
        } catch (e) {
          console.warn('[KS] 初始化失败:', e);
        }
      })();
    }

    return () => {
      presenceRef.current?.stop();
      cleanupNetwork();
    };
  }, []);

  // Animation loop: tick expression engine → update animParams
  useEffect(() => {
    let running = true;
    let lastTime = performance.now();
    function loop() {
      if (!running) return;
      animFrameRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      if (engineRef.current) {
        const params = engineRef.current.tick(dt);
        setAnimParams(params);
      }
    }
    loop();
    return () => { running = false; cancelAnimationFrame(animFrameRef.current); };
  }, []);

  // Wire engine to app state
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (state.isProcessing) {
      engine.onMessageSent();
    } else if (thinking) {
      engine.onProcessingComplete();
    }
  }, [state.isProcessing, thinking]);

  // Wire engine to input focus/typing
  const handleInputFocus = useCallback(() => {
    engineRef.current?.onInputFocus();
  }, []);
  const handleInputBlur = useCallback(() => {
    engineRef.current?.onInputBlur();
  }, []);
  const handleInputChange = useCallback((e) => {
    setInput(e.target.value);
    engineRef.current?.onUserTyping();
    presenceRef.current?.onActivity();
  }, []);

  // Clear angel/devil after decision messages age out
  useEffect(() => {
    if (angelDevil) {
      const t = setTimeout(() => setAngelDevil(null), 15000);
      return () => clearTimeout(t);
    }
  }, [angelDevil]);

  useEffect(() => {
    const mems = loadMemories();
    dispatch({ type: 'SET_MEMORIES', payload: mems });
    applyForgettingRules().then(c => dispatch({ type: 'SET_MEMORIES', payload: c }));
  }, []);

  useEffect(() => {
    dispatch({ type: 'LOAD_SESSIONS' });
  }, []);

  useEffect(() => {
    const stop = startProactiveEngine({
      onReminder: (t) => dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: t, type: 'reminder' } }),
      onWellbeing: (t) => dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: t, type: 'care' } }),
      onShare: (t) => dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: t, type: 'share' } }),
    });
    return stop;
  }, []);

  // 同步 workspace 到 toolRegistry，并自动分析项目
  useEffect(() => {
    setWorkspaceContext(state.currentProject);
    if (state.currentProject) analyzeProject(state.currentProject);
  }, [state.currentProject]);

  // ─── 自动更新监听 ──────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return;
    const remove = window.electronAPI.onUpdateStatus((data) => {
      setUpdateStatus(data.status);
      if (data.status === 'available') {
        setUpdateInfo({ version: data.version, releaseDate: data.releaseDate });
      } else if (data.status === 'downloading') {
        setUpdateProgress(data.percent || 0);
      } else if (data.status === 'not-available' || data.status === 'error') {
        // 静默：无更新或检查错误不打扰用户
      }
    });
    return remove;
  }, []);

  // ─── 启动时自动连接飞书 ──────────────────────────────
  useEffect(() => {
    if (state.feishuStatus === 'connected' || state.feishuStatus === 'connecting') return;
    if (!isFeishuConfigured()) return;
    const config = getFeishuConfig(); // imported from feishu.js
    if (config?.appId && config?.appSecret) {
      dispatch({ type: 'SET_FEISHU_STATUS', payload: 'connecting' });
      window.electronAPI?.feishuConfigure(config.appId, config.appSecret).then(result => {
        if (result?.success) {
          // 状态由 onFeishuStatusChange 推送更新
        } else {
          dispatch({ type: 'SET_FEISHU_STATUS', payload: 'disconnected' });
        }
      }).catch(() => {
        dispatch({ type: 'SET_FEISHU_STATUS', payload: 'disconnected' });
      });
    }
  }, []);

  // ─── 飞书监测引擎 ──────────────────────────────────────
  useEffect(() => {
    if (state.feishuStatus !== 'connected') return;

    // 连接后向第一个联系人发送欢迎消息
    sendWelcomeMessage();

    // 监听WS状态变更（断线/重连）
    let unsubFeishuStatus = null;
    if (window.electronAPI?.onFeishuStatusChange) {
      unsubFeishuStatus = window.electronAPI.onFeishuStatusChange((status) => {
        if (status.event === 'error' || status.event === 'reconnecting') {
          dispatch({ type: 'SET_FEISHU_STATUS', payload: status.running ? 'connected' : 'connecting' });
        }
        if (status.event === 'reconnected' || status.event === 'ready') {
          dispatch({ type: 'SET_FEISHU_STATUS', payload: 'connected' });
        }
      });
    }

    // 实时消息监听：主进程 WebSocket → IPC → 完整AI处理 → 自动回复飞书
    let unsubFeishuMsg = null;
    if (window.electronAPI?.onFeishuMessage) {
      unsubFeishuMsg = window.electronAPI.onFeishuMessage((data) => {
        dispatchFeishuMessage(data);

        const text = extractTextFromEvent(data);
        if (!text) return;

        // 将飞书消息送入完整AI处理流程（和CC聊天互通、记忆互通）
        feishuReplyRef.current = { type: 'reply', eventData: data };
        processUserMessageRef.current?.(`[来自飞书] ${text}`, { source: 'feishu', feishuData: data });

        // 同时做任务检测（长消息）
        if (text.length > 10) {
          import('../services/feishuMonitor.js').then(({ scanForTasks }) => {
            scanForTasks().then(result => {
              if (result.tasks?.length > 0) {
                const prompts = result.tasks.map(t => ({
                  id: t.id,
                  description: t.description,
                  senderName: t.senderName,
                  chatName: t.chatName,
                  capabilities: t.capabilities,
                  type: t.type,
                  onAccept: (instruction) => {
                    feishuReplyRef.current = { type: 'reply', eventData: data };
                    processUserMessageRef.current?.(instruction, { source: 'feishu_proactive', feishuData: data });
                  },
                }));
                dispatch({ type: 'SET_PROACTIVE_PROMPTS', payload: prompts });
              }
            });
          });
        }
      });
    }

    // 定时扫描（每日11:00/15:00/19:00 + 连接后5秒首次扫描）
    startScheduledScan((tasks) => {
      const prompts = tasks.map(t => ({
        id: t.id,
        description: t.description,
        senderName: t.senderName,
        chatName: t.chatName,
        capabilities: t.capabilities,
        type: t.type,
        onAccept: (instruction) => {
          feishuReplyRef.current = { type: 'chat', chatId: t.chatId };
          processUserMessageRef.current?.(instruction, { source: 'feishu_proactive' });
        },
      }));
      dispatch({ type: 'SET_PROACTIVE_PROMPTS', payload: prompts });
    });

    return () => {
      stopScheduledScan();
      if (unsubFeishuMsg) unsubFeishuMsg();
      if (unsubFeishuStatus) unsubFeishuStatus();
    };
  }, [state.feishuStatus]);

  // 监听AI响应 → 转发到飞书
  useEffect(() => {
    if (!feishuReplyRef.current || state.messages.length === 0) return;
    const lastMsg = state.messages[state.messages.length - 1];
    if (lastMsg.role !== 'assistant' || lastMsg._fw) return;
    lastMsg._fw = true;
    const target = feishuReplyRef.current;
    feishuReplyRef.current = null;
    (async () => {
      try {
        if (target.type === 'reply') {
          await replyToMessage(target.eventData, lastMsg.content);
        } else if (target.type === 'chat') {
          await feishuSendMessage('chat_id', target.chatId, lastMsg.content);
        }
      } catch (e) {
        console.error('[Feishu] 转发AI响应失败:', e);
      }
    })();
  }, [state.messages]);

  const handleDownloadUpdate = async () => {
    setUpdateStatus('downloading');
    setUpdateProgress(0);
    try {
      await window.electronAPI.downloadUpdate();
    } catch {
      setUpdateStatus('error');
    }
  };

  const handleInstallUpdate = () => {
    window.electronAPI.installUpdate();
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [state.messages, toolSteps]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { if (showApiModal) apiKeyInputRef.current?.focus(); }, [showApiModal]);

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    dispatch({ type: 'SET_PROCESSING', payload: false });
    setThinking(false);
    setThinkingText('');
    thinkingTextRef.current = '';
    setToolSteps([]);
    setStreamingText('');
    setAngelDevil(null);
    engineRef.current?.onStop();
  }, []);

  // 核心AI管道：文字/图片/语音消息统一入口
  const processUserMessage = useCallback(async (text, extra = {}) => {
    const { images, audio } = extra;
    const s = stateRef.current;

    if (s.isProcessing) {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      dispatch({ type: 'SET_PROCESSING', payload: false });
      setThinking(false);
      setToolSteps([]);
      setStreamingText('');
      setAngelDevil(null);
      engineRef.current?.onStop();
      await new Promise(r => setTimeout(r, 100));
    }

    setToolSteps([]);
    setAngelDevil(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const hasUserMessages = s.messages.some(m => m.role === 'user');
    const isFirstMessage = !s.activeSessionId && !hasUserMessages;
    dispatch({ type: 'ADD_MESSAGE', payload: { role: 'user', content: text, images: images?.length > 0 ? images : undefined, audio: audio || undefined } });
    if (isFirstMessage) {
      dispatch({ type: 'NEW_SESSION', payload: text });
    }
    dispatch({ type: 'SET_PROCESSING', payload: true });
    setThinkingText('');
    thinkingTextRef.current = '';
    engineRef.current?.onMessageSent();
    presenceRef.current?.onActivity();

    const userEmotion = emotionRef.current?.detectUserEmotion(text);
    if (userEmotion === 'happy' || userEmotion === 'excited') {
      engineRef.current?.onHappy();
    }

    const relResult = recordConversation();
    if (relResult.leveledUp && relResult.question) {
      dispatch({
        type: 'ADD_MESSAGE',
        payload: { role: 'assistant', content: `🎉 我们的关系升级了！\n\n${relResult.question}`, type: 'share' },
      });
    }

    const decisionKeywords = /要不要|怎么选|帮你分析|你怎么看|优劣|权衡|利弊|做个方案|帮我决策|二选一|推荐哪个|选哪个/;
    if (decisionKeywords.test(text)) {
      angelDevilThink(text, s, controller.signal).then(result => {
        if (!controller.signal.aborted) {
          setAngelDevil(result);
          dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: `${result.angel}\n\n${result.devil}`, type: 'thinking' } });
        }
      }).catch(() => {});
    }

    const collectedSteps = [];
    const onProgress = (event) => {
      const { type, data } = event;
      if (type === 'tool_call') {
        const step = { id: data.id, name: data.name, input: data.input, status: 'running', result: '', duration: 0 };
        setToolSteps(prev => [...prev, step]);
        collectedSteps.push(step);
      } else if (type === 'tool_result') {
        setToolSteps(prev => prev.map(s =>
          s.id === data.id ? { ...s, result: data.result, duration: data.duration, status: 'done' } : s
        ));
        const existing = collectedSteps.find(s => s.id === data.id);
        if (existing) {
          existing.result = data.result;
          existing.duration = data.duration;
          existing.status = 'done';
        }
      } else if (type === 'text') {
        setStreamingText(prev => (data.length >= (prev || '').length) ? data : (prev || '') + '\n' + data);
      } else if (type === 'think') {
        setThinking(true);
        thinkingTextRef.current = data;
        setThinkingText(data);
      }
    };

    const isDup = (a, b) => {
      if (!a || !b || a.length < 50) return false;
      const sa = a.slice(0, 200), sb = b.slice(0, 200);
      return sa === sb || sa.includes(sb.slice(0, 100)) || sb.includes(sa.slice(0, 100));
    };

    try {
      const response = await sendMessage(text, s, onProgress, controller.signal);
      setStreamingText('');

      if (controller.signal.aborted) return;

      const rawThinking = thinkingTextRef.current;
      const finalThinking = (rawThinking && rawThinking.length >= 15 && !isDup(rawThinking, response)) ? rawThinking : undefined;

      const isPlanOutput = response.includes('<!--PLAN_OUTPUT_START-->');
      if (isPlanOutput) {
        const cleanContent = response
          .replace('<!--PLAN_OUTPUT_START-->', '')
          .replace('<!--PLAN_OUTPUT_END-->', '')
          .trim();
        setPlanContent(cleanContent);
        setPlanPanelOpen(true);
        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: '📋 方案已生成，请在右侧面板查看详情。', type: 'plan' } });
      } else if (collectedSteps.length > 0) {
        dispatch({
          type: 'ADD_MESSAGE',
          payload: {
            role: 'assistant',
            content: response,
            type: 'tool_response',
            toolSteps: [...collectedSteps],
            thinkingText: finalThinking,
          },
        });
      } else {
        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: response, thinkingText: finalThinking } });
      }

      if (/太好了|很棒|不错|谢谢|感谢|搞定|完成|成功/.test(response.slice(0, 100))) {
        engineRef.current?.onHappy();
      }

      const newMems = extractMemoryFromConversation(text, response);
      for (const mem of newMems) dispatch({ type: 'ADD_MEMORY', payload: mem });

      const profileDiff = extractProfileDiff(text, response);
      if (profileDiff) applyDiff(profileDiff);
      const lastAiMsg = [...s.messages].reverse().find(m => m.role === 'assistant');
      const feedback = detectUserFeedback(text, lastAiMsg?.content || '');
      if (feedback) addLesson(feedback);

      try { getKnowledgeSystem()?.onConversationTurn(text, response); } catch {}

      if (s.voiceEnabled) speakText(response.slice(0, 200));
      engineRef.current?.onResponseReceived();
      setTimeout(() => dispatch({ type: 'SAVE_SESSION' }), 50);
    } catch (err) {
      if (err.name === 'AbortError') return;

      const friendlyMsg = categorizeError(err);

      if (isRetryable(err) && !controller.signal.aborted) {
        setRetrying(true);
        dispatch({
          type: 'ADD_MESSAGE',
          payload: { role: 'assistant', content: `${friendlyMsg}\n\n正在自动重试...`, type: 'system' },
        });

        try {
          const retryRes = await withRetry(
            () => sendMessage(text, stateRef.current, onProgress, controller.signal),
            { maxRetries: 2, delay: 2000, signal: controller.signal }
          );

          if (controller.signal.aborted) return;
          setRetrying(false);

          dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: retryRes } });
          engineRef.current?.onResponseReceived();
          setTimeout(() => dispatch({ type: 'SAVE_SESSION' }), 50);
          if (stateRef.current.voiceEnabled) speakText(retryRes.slice(0, 200));

          const newMems = extractMemoryFromConversation(text, retryRes);
          for (const mem of newMems) dispatch({ type: 'ADD_MEMORY', payload: mem });

          const profileDiff2 = extractProfileDiff(text, retryRes);
          if (profileDiff2) applyDiff(profileDiff2);
          const lastAiMsg2 = [...stateRef.current.messages].reverse().find(m => m.role === 'assistant');
          const feedback2 = detectUserFeedback(text, lastAiMsg2?.content || '');
          if (feedback2) addLesson(feedback2);

          try { getKnowledgeSystem()?.onConversationTurn(text, retryRes); } catch {}

          return;
        } catch (retryErr) {
          if (retryErr.name === 'AbortError') return;
          setRetrying(false);
          dispatch({
            type: 'ADD_MESSAGE',
            payload: { role: 'assistant', content: `重试失败: ${categorizeError(retryErr)}`, type: 'system' },
          });
          return;
        }
      }

      dispatch({
        type: 'ADD_MESSAGE',
        payload: { role: 'assistant', content: friendlyMsg, type: 'system' },
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      dispatch({ type: 'SET_PROCESSING', payload: false });
      setThinking(false);
      setThinkingText('');
      setToolSteps([]);
      setStreamingText('');
      inputRef.current?.focus();
    }
  }, []);

  processUserMessageRef.current = processUserMessage;

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    const imgs = pendingImages;
    setPendingImages([]);
    processUserMessage(text, { images: imgs.length > 0 ? imgs : undefined });
  }, [input, pendingImages, processUserMessage]);

  // 从计划面板点击"执行"后的自动发送
  const handlePlanExecute = useCallback((execMsg) => {
    const s = stateRef.current;
    if (s.isProcessing) return;

    const controller = new AbortController();
    abortRef.current = controller;

    dispatch({ type: 'ADD_MESSAGE', payload: { role: 'user', content: execMsg } });
    dispatch({ type: 'SET_PROCESSING', payload: true });
    setThinkingText('');
    thinkingTextRef.current = '';
    engineRef.current?.onMessageSent();
    presenceRef.current?.onActivity();

    const onProgress = (event) => {
      const { type, data } = event;
      if (type === 'tool_call') {
        setToolSteps(prev => [...prev, { id: data.id, name: data.name, input: data.input, status: 'running', result: '', duration: 0 }]);
      } else if (type === 'tool_result') {
        setToolSteps(prev => prev.map(st => st.id === data.id ? { ...st, result: data.result, duration: data.duration, status: 'done' } : st));
      } else if (type === 'text') {
        setStreamingText(prev => (data.length >= (prev || '').length) ? data : (prev || '') + '\n' + data);
      } else if (type === 'think') {
        setThinking(true);
        thinkingTextRef.current = data;
        setThinkingText(data);
      }
    };

    const isDup = (a, b) => {
      if (!a || !b || a.length < 50) return false;
      const sa = a.slice(0, 200), sb = b.slice(0, 200);
      return sa === sb || sa.includes(sb.slice(0, 100)) || sb.includes(sa.slice(0, 100));
    };

    (async () => {
      try {
        const response = await sendMessage(execMsg, s, onProgress, controller.signal);
        setStreamingText('');
        if (controller.signal.aborted) return;
        const rawThinking = thinkingTextRef.current;
      const finalThinking = (rawThinking && rawThinking.length >= 15 && !isDup(rawThinking, response)) ? rawThinking : undefined;
        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: response, thinkingText: finalThinking } });
        try { getKnowledgeSystem()?.onConversationTurn(execMsg, response); } catch {}
        if (s.voiceEnabled) speakText(response.slice(0, 200));
        engineRef.current?.onResponseReceived();
      } catch (err) {
        if (err.name === 'AbortError') return;
        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: categorizeError(err), type: 'system' } });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        dispatch({ type: 'SET_PROCESSING', payload: false });
        setThinking(false);
        setThinkingText('');
        setToolSteps([]);
        setStreamingText('');
      }
    })();
  }, []);

  const handleProjectFolder = useCallback(async () => {
    try {
      const folderPath = await window.electronAPI?.selectFolder();
      if (folderPath) {
        dispatch({ type: 'SET_CURRENT_PROJECT', payload: folderPath });
        setWorkspaceContext(folderPath);
        analyzeProject(folderPath);
      }
    } catch (e) {
      console.error('项目文件夹选择失败:', e);
    }
  }, [state.currentProject, dispatch]);

  const [voiceMode, setVoiceMode] = useState(null); // null | 'speech' | 'recorder'

  const toggleVoiceInput = async () => {
    if (listening) {
      stopListening();
      const wasRecorder = voiceMode === 'recorder';
      setVoiceMode(null);
      setListening(false);
      if (wasRecorder) {
        try {
          const audio = await stopVoiceRecording();
          if (audio?.base64) {
            setTranscribing(true);
            setInput('');
            const result = await transcribeAudio(audio.base64, audio.mimeType);
            setTranscribing(false);
            if (result.success && result.text) {
              setInput(result.text);
              // 自动聚焦输入框让用户确认/修改
              setTimeout(() => inputRef.current?.focus(), 100);
            } else {
              // 转写失败时fallback: 显示原音频消息
              dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: `语音识别失败: ${result.error || '未知错误'}。语音已保留，可手动输入文字。`, type: 'system' } });
            }
          }
        } catch (e) {
          setTranscribing(false);
          console.warn('停止录音失败:', e);
        }
      }
    } else {
      // Electron 环境直接用 MediaRecorder 录音（SpeechRecognition 依赖Google不可用）
      if (window.electronAPI || !isSpeechSupported()) {
        if (!isMediaRecorderSupported()) {
          dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: '录音功能不可用：无法访问麦克风。请检查系统隐私设置中是否允许此应用使用麦克风。', type: 'system' } });
          return;
        }
        try {
          setVoiceMode('recorder');
          await startVoiceRecording(
            () => setListening(true),
            (err) => {
              setListening(false); setVoiceMode(null);
              dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: `录音启动失败: ${err}`, type: 'system' } });
            }
          );
        } catch (e) {
          setListening(false); setVoiceMode(null);
          dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: `麦克风访问被拒绝: ${e.message}`, type: 'system' } });
        }
        return;
      }

      // 浏览器环境：使用 SpeechRecognition
      if (isSpeechSupported()) {
        setVoiceMode('speech');
        const ok = startListening(
          t => { setInput(t); setListening(false); setVoiceMode(null); },
          (err) => {
            setListening(false); setVoiceMode(null);
            dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: `语音识别失败: ${err}`, type: 'system' } });
          },
          () => { setListening(false); setVoiceMode(null); }
        );
        if (ok) { setListening(true); return; }
        setVoiceMode(null);
      }

      dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: '语音输入不可用：当前环境不支持语音识别和录音功能。', type: 'system' } });
    }
  };

  const handleFileUpload = useCallback(async () => {
    try {
      let files;
      if (window.electronAPI?.selectFiles) {
        files = await window.electronAPI.selectFiles();
      } else {
        // Fallback: browser file input
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.pdf,.docx,.md,.txt,.py,.js,.jsx,.ts,.tsx,.css,.html,.json,.jpg,.png';
        files = await new Promise((resolve) => {
          input.onchange = (e) => resolve(Array.from(e.target.files).map(f => f.path || f));
          input.click();
        });
      }
      if (!files || files.length === 0) return;
      let added = 0;
      for (const filePath of files) {
        try {
          await addDocumentFromFile(filePath);
          added++;
        } catch (e) {
          console.warn(`上传文件失败 ${filePath}:`, e.message);
        }
      }
      if (added > 0) {
        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: `已添加 ${added} 个文档到知识库。`, type: 'system' } });
      }
    } catch (e) {
      console.error('文件上传失败:', e);
    }
  }, []);

  const handleImagePaste = useCallback((base64) => {
    setPendingImages(prev => [...prev, base64]);
  }, []);

  const handleRemoveImage = useCallback((index) => {
    setPendingImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // ---- 消息操作按钮回调 ----

  const handleRefresh = useCallback(async (msg) => {
    // Find the user message right before this assistant message
    const s = stateRef.current;
    const msgIdx = s.messages.findIndex(m => m.id === msg.id);
    if (msgIdx < 0) return;
    // Find the closest preceding user message
    let userMsg = null;
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (s.messages[i].role === 'user') { userMsg = s.messages[i]; break; }
    }
    if (!userMsg) return;
    if (s.isProcessing) return;

    // Remove this assistant message from state and regenerate
    dispatch({ type: 'REMOVE_MESSAGE', payload: msg.id });

    const controller = new AbortController();
    abortRef.current = controller;

    const text = userMsg.content;
    dispatch({ type: 'SET_PROCESSING', payload: true });
    setThinkingText('');
    thinkingTextRef.current = '';
    engineRef.current?.onMessageSent();
    presenceRef.current?.onActivity();

    const collectedSteps = [];
    const onProgress = (event) => {
      const { type, data } = event;
      if (type === 'tool_call') {
        const step = { id: data.id, name: data.name, input: data.input, status: 'running', result: '', duration: 0 };
        setToolSteps(prev => [...prev, step]);
        collectedSteps.push(step);
      } else if (type === 'tool_result') {
        setToolSteps(prev => prev.map(st => st.id === data.id ? { ...st, result: data.result, duration: data.duration, status: 'done' } : st));
        const existing = collectedSteps.find(s => s.id === data.id);
        if (existing) { existing.result = data.result; existing.duration = data.duration; existing.status = 'done'; }
      } else if (type === 'text') {
        setStreamingText(prev => (data.length >= (prev || '').length) ? data : (prev || '') + '\n' + data);
      } else if (type === 'think') {
        setThinking(true);
        thinkingTextRef.current = data;
        setThinkingText(data);
      }
    };

    const isDup = (a, b) => {
      if (!a || !b || a.length < 50) return false;
      const sa = a.slice(0, 200), sb = b.slice(0, 200);
      return sa === sb || sa.includes(sb.slice(0, 100)) || sb.includes(sa.slice(0, 100));
    };

    try {
      const response = await sendMessage(text, s, onProgress, controller.signal);
      setStreamingText('');
      if (controller.signal.aborted) return;
      const rawThinking = thinkingTextRef.current;
      const finalThinking = (rawThinking && rawThinking.length >= 15 && !isDup(rawThinking, response)) ? rawThinking : undefined;
      dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: response, thinkingText: finalThinking } });
      try { getKnowledgeSystem()?.onConversationTurn(text, response); } catch {}
      if (s.voiceEnabled) speakText(response.slice(0, 200));
      engineRef.current?.onResponseReceived();
      setTimeout(() => dispatch({ type: 'SAVE_SESSION' }), 50);
    } catch (err) {
      if (err.name === 'AbortError') return;
      dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: categorizeError(err), type: 'system' } });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      dispatch({ type: 'SET_PROCESSING', payload: false });
      setThinking(false);
      setThinkingText('');
      setToolSteps([]);
      setStreamingText('');
    }
  }, []);

  const handleSpeak = useCallback((msg) => {
    speakText(msg.content);
  }, []);

  const handleLike = useCallback((msg, isLiking) => {
    if (isLiking) {
      addLesson({
        context: msg.content.slice(0, 80),
        approach: '用户点赞',
        result: '用户喜欢这个回复',
        isMistake: false,
      });
    }
  }, []);

  const handleDislike = useCallback((msg, isDisliking) => {
    if (isDisliking) {
      addLesson({
        context: msg.content.slice(0, 80),
        approach: '用户点踩',
        result: '用户不喜欢这个回复',
        isMistake: true,
      });
    }
  }, []);

  const handleForward = useCallback((msg) => {
    dispatch({ type: 'START_NEW_CHAT' });
    setTimeout(() => {
      dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: msg.content } });
      dispatch({ type: 'SAVE_SESSION' });
    }, 100);
  }, []);

  const handleMoreAction = useCallback((msg, action) => {
    switch (action) {
      case 'forward':
        dispatch({ type: 'START_NEW_CHAT' });
        setTimeout(() => {
          dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: msg.content } });
          dispatch({ type: 'SAVE_SESSION' });
        }, 100);
        break;
      case 'bookmark':
        addFavorite(msg);
        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: '已收藏到收藏夹。', type: 'system' } });
        break;
      case 'feedback': {
        const note = prompt('请输入你的反馈意见：');
        if (note) {
          addFeedback(msg, note);
          dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: '感谢你的反馈！', type: 'system' } });
        }
        break;
      }
      case 'report':
        addReport(msg, '用户举报');
        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: '已记录举报，我们会持续改进。', type: 'system' } });
        break;
    }
  }, []);

  // We need REMOVE_MESSAGE action for refresh to work
  // Will be added to reducer below

  const openApiModal = () => {
    const model = getCurrentModel();
    setSelectedModel(model);
    setApiKeyInput(getApiKey(model) || '');
    setApiSearch('');
    setModelNameInput(getUserModelName(model) || '');
    setShowModelNameInput(false);
    setExtraHeaderInputs({});
    setShowCustomForm(false);
    setCustomForm({ name: '', endpoint: '', modelName: '', apiKey: '' });
    setShowApiModal(true);
  };

  const confirmApiKey = () => {
    const key = apiKeyInput.trim();
    if (key) {
      setApiKey(selectedModel, key);
      dispatch({ type: 'SET_API_KEY', payload: key });
    }
    if (modelNameInput.trim()) {
      setUserModelName(selectedModel, modelNameInput.trim());
    }
    Object.entries(extraHeaderInputs).forEach(([field, value]) => {
      if (value.trim()) setExtraHeader(selectedModel, field, value.trim());
    });
    setCurrentModel(selectedModel);
    dispatch({ type: 'SET_MODEL', payload: selectedModel });
    setShowApiModal(false);
  };

  const toolsAvailable = typeof window !== 'undefined'
    && window.electronAPI
    && typeof window.electronAPI.shellExecute === 'function';

  // Scene status label
  const getSceneStatus = () => {
    if (state.isProcessing && toolSteps.length > 0) return { label: '执行中', dot: 'thinking' };
    if (state.isProcessing) return { label: '思考中', dot: 'thinking' };
    if (thinking) return { label: '回复中', dot: 'speaking' };
    const engine = engineRef.current;
    if (engine) {
      const st = engine.getState();
      if (st === 'listening') return { label: '倾听中', dot: 'listening' };
      if (st === 'dozing') return { label: '打盹中', dot: 'dozing' };
      if (st === 'speaking') return { label: '回复中', dot: 'speaking' };
      if (st === 'thinking') return { label: '思考中', dot: 'thinking' };
      if (st === 'happy') return { label: '开心', dot: 'speaking' };
    }
    return { label: '在线', dot: '' };
  };
  const sceneStatus = getSceneStatus();

  const handleBubbleClick = useCallback((sessionId) => {
    if (sessionId === state.activeSessionId) return;
    dispatch({ type: 'SWITCH_SESSION', payload: sessionId });
  }, [state.activeSessionId, dispatch]);

  const handleBubbleRemove = useCallback((sessionId) => {
    dispatch({ type: 'DELETE_SESSION', payload: sessionId });
  }, [dispatch]);

  const handleNewSession = useCallback(() => {
    dispatch({ type: 'START_NEW_CHAT' });
  }, [dispatch]);

  return (
    <div className="chat-interface">
      {/* ====== Layer 0: StageBackground ====== */}
      <StageBackground />

      {/* ====== Layer 1: 3D Character Stage (centered, full viewport) ====== */}
      <div className="character-stage">
        <CharacterScene animParams={animParams} />

        {/* Relationship level badge */}
        {(() => {
          const rel = getRelationship();
          const info = getLevelInfo(rel.currentLevel);
          return (
            <div className={`rl-badge lv${rel.currentLevel}`}>
              <span>{info.emoji}</span>
              <span>Lv{info.level} {info.name}</span>
            </div>
          );
        })()}

        {/* Status indicator */}
        <div className="scene-status">
          <span className={`scene-status-dot ${sceneStatus.dot}`} />
          <span>{sceneStatus.label}</span>
        </div>

        {/* Emotion indicator */}
        {(() => {
          const em = emotionRef.current?.getCCEmotion();
          if (!em || (Math.abs(em.valence) < 0.2 && Math.abs(em.arousal) < 0.2)) return null;
          const mood = emotionRef.current?.getMoodLabel() || 'neutral';
          const labels = { happy: '😊 开心', excited: '🤩 兴奋', sad: '😔 低落', anxious: '😰 忐忑', calm: '😌 平静', neutral: '' };
          return (
            <div className={`emotion-indicator visible ${mood}`}>
              <span>{labels[mood] || ''}</span>
            </div>
          );
        })()}

        {/* Angel/Devil overlay */}
        <AngelDevilOverlay
          visible={state.isProcessing || !!angelDevil}
          angelText={angelDevil?.angel?.replace('[天使视角] ', '') || ''}
          devilText={angelDevil?.devil?.replace('[恶魔视角] ', '') || ''}
        />

        {/* ChatBubbleLayer — 角色周围浮动气泡 */}
        <ChatBubbleLayer
          messages={state.messages}
          isProcessing={state.isProcessing}
          streamingText={streamingText}
          thinking={thinking}
          thinkingText={thinkingText}
          onRefresh={handleRefresh}
          onSpeak={handleSpeak}
          onLike={handleLike}
          onDislike={handleDislike}
          onForward={handleForward}
          onMoreAction={handleMoreAction}
        />
      </div>

      {/* ====== Session Bubbles ====== */}
      <SessionBubbles
        sessions={state.sessions}
        activeSessionId={state.activeSessionId}
        onBubbleClick={handleBubbleClick}
        onRemove={handleBubbleRemove}
      />

      {/* ====== Layer 2: Left Toolbar ====== */}
      <div className="toolbar-left">
        <ToolIcon
          icon={<ApiKeyIcon />} label="API Key"
          active={!!state.apiKey}
          onClick={openApiModal}
        />
        <ToolIcon
          icon={<PersonalityIcon />} label="人格设置"
          active={state.personalityPanelOpen}
          onClick={() => dispatch({ type: 'TOGGLE_PERSONALITY_PANEL' })}
        />
        <ToolIcon
          icon={<VoiceIcon enabled={state.voiceEnabled} />}
          label={state.voiceEnabled ? '关闭语音' : '开启语音'}
          active={state.voiceEnabled}
          onClick={() => dispatch({ type: 'TOGGLE_VOICE' })}
        />
        <ToolIcon
          icon={<VoiceCloneIcon />} label="语音克隆"
          active={voicePanelOpen}
          onClick={() => setVoicePanelOpen(true)}
        />
        <ToolIcon
          icon={<MemoryIcon />} label="记忆面板"
          active={state.memoryPanelOpen}
          onClick={() => dispatch({ type: 'TOGGLE_MEMORY_PANEL' })}
        />
        <ToolIcon
          icon={<ChatHistoryIcon />} label="聊天记录"
          active={state.sessionsPanelOpen}
          onClick={() => dispatch({ type: 'TOGGLE_SESSIONS_PANEL' })}
        />
        <ToolIcon
          icon={<KnowledgeGraphIcon />} label="知识图谱"
          active={knowledgeGraphPanelOpen}
          onClick={() => setKnowledgeGraphPanelOpen(true)}
        />
        <ToolIcon
          icon={<ToolboxIcon />} label="工具箱"
          active={state.toolboxPanelOpen}
          onClick={() => dispatch({ type: 'TOGGLE_TOOLBOX' })}
        />
        <ToolIcon
          icon={<FolderIcon />}
          label={state.currentProject
            ? `工作区: ${state.currentProject.split('\\').pop() || state.currentProject}`
            : '选择项目文件夹'}
          active={!!state.currentProject}
          onClick={handleProjectFolder}
        />
        <div className="toolbar-spacer" />
      </div>

      {/* ====== Layer 3: Bottom InputBar ====== */}
      <InputBar
        input={input}
        onInputChange={handleInputChange}
        onSend={handleSend}
        onStop={handleStop}
        onVoiceToggle={toggleVoiceInput}
        listening={listening}
        isProcessing={state.isProcessing}
        transcribing={transcribing}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        inputRef={inputRef}
        onFileUpload={handleFileUpload}
        pendingImages={pendingImages}
        onImagePaste={handleImagePaste}
        onRemoveImage={handleRemoveImage}
      />

      {/* ====== Layer 4: Toast notifications ====== */}
      {!isOnline && <div className="offline-toast">⚠️ 网络已断开，消息无法发送</div>}
      {showOnlineToast && <div className="online-toast">✅ 网络已恢复</div>}

      {/* ====== Layer 5: Update banner ====== */}
      {updateStatus && updateStatus !== 'not-available' && (
        <div className={`update-banner ${updateStatus}`}>
          {updateStatus === 'downloaded' ? (
            <>
              <span>✅</span>
              <div className="update-banner-text">
                <div>新版本已下载完成 {updateInfo?.version ? `v${updateInfo.version}` : ''}</div>
                <div className="update-banner-sub">重启应用即可安装更新</div>
              </div>
              <button className="update-banner-btn install" onClick={handleInstallUpdate}>立即重启</button>
            </>
          ) : updateStatus === 'downloading' ? (
            <>
              <span>📥</span>
              <div className="update-banner-text" style={{ flex: 1 }}>
                <div>正在下载更新...</div>
                <div className="update-progress-bar">
                  <div className="update-progress-fill" style={{ width: `${updateProgress}%` }}/>
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#6b6b8a' }}>{updateProgress}%</span>
            </>
          ) : updateStatus === 'available' ? (
            <>
              <span>🔔</span>
              <div className="update-banner-text">
                <div>发现新版本 {updateInfo?.version ? `v${updateInfo.version}` : ''}</div>
              </div>
              <button className="update-banner-btn download" onClick={handleDownloadUpdate}>下载更新</button>
            </>
          ) : updateStatus === 'checking' ? (
            <><span className="update-spinner" /> <span>正在检查更新...</span></>
          ) : updateStatus === 'error' ? (
            <><span>⚠️</span> <span>更新检查失败，请稍后重试</span></>
          ) : null}
        </div>
      )}

      {/* ====== Panels & Modals ====== */}
      {(state.personalityPanelOpen || state.memoryPanelOpen || state.sessionsPanelOpen) && (
        <div
          onClick={() => dispatch({ type: 'CLOSE_PANELS' })}
          style={{ position: 'fixed', inset: 0, zIndex: 4 }}
        />
      )}
      {state.memoryPanelOpen && <MemoryPanel />}
      {state.personalityPanelOpen && <PersonalityPanel />}
      {state.sessionsPanelOpen && <SessionsPanel />}
      {state.toolboxPanelOpen && (
        <>
          <div className="toolbox-backdrop" onClick={() => dispatch({ type: 'TOGGLE_TOOLBOX' })} />
          <ToolboxPanel />
        </>
      )}
      {state.proactivePrompts?.length > 0 && <ProactivePrompt />}
      {voicePanelOpen && <VoiceClonePanel onClose={() => setVoicePanelOpen(false)} />}
      {knowledgeGraphPanelOpen && (
        <KnowledgeGraphPanel
          onClose={() => setKnowledgeGraphPanelOpen(false)}
          getKnowledgeSystem={getKnowledgeSystem}
        />
      )}
      {planPanelOpen && (
        <div className="plan-panel-overlay" onClick={() => setPlanPanelOpen(false)}>
          <div className="plan-panel" onClick={e => e.stopPropagation()}>
            <div className="plan-panel-header">
              <h2>📋 执行方案</h2>
              <button className="plan-panel-close" onClick={() => setPlanPanelOpen(false)}>✕</button>
            </div>
            <div className="plan-panel-body">
              <PlanCard
                content={planContent}
                onSwitchToExecute={(feedback) => {
                  dispatch({ type: 'SET_INPUT_MODE', payload: 'execute' });
                  setPlanPanelOpen(false);
                  let execMsg = `请按照以下方案执行：\n\n${planContent}`;
                  if (feedback) {
                    execMsg += `\n\n用户补充：${feedback}`;
                  }
                  setTimeout(() => {
                    const s = stateRef.current;
                    if (!s.isProcessing) {
                      handlePlanExecute(execMsg);
                    }
                  }, 200);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      {showApiModal && (
        <div className="api-modal-overlay" onClick={() => setShowApiModal(false)}>
          <div className="api-modal" onClick={e => e.stopPropagation()}>
            <h3>模型设置</h3>

            {/* Search */}
            <input
              className="api-modal-search"
              placeholder="搜索模型..."
              value={apiSearch}
              onChange={e => setApiSearch(e.target.value)}
            />

            {/* Provider list */}
            <div className="api-modal-provider-list">
              {getAvailableModels()
                .filter(m => !apiSearch || m.name.toLowerCase().includes(apiSearch.toLowerCase()) || m.id.toLowerCase().includes(apiSearch.toLowerCase()))
                .map(m => {
                  const isSelected = selectedModel === m.id;
                  const modelName = m.modelName || getUserModelName(m.id) || '';
                  return (
                    <div
                      key={m.id}
                      className={`api-provider-item${isSelected ? ' selected' : ''}`}
                      onClick={() => {
                        setSelectedModel(m.id);
                        setApiKeyInput(getApiKey(m.id) || '');
                        setModelNameInput(getUserModelName(m.id) || m.modelName || '');
                        setShowModelNameInput(false);
                        setExtraHeaderInputs({});
                      }}
                    >
                      <div className="api-provider-main">
                        <span className="api-provider-name">{m.name}</span>
                        {m.note && <span className="api-provider-note">{m.note}</span>}
                        {m.hasKey && <span className="api-provider-check">✓</span>}
                      </div>
                      {modelName && <span className="api-provider-model">模型：{modelName}</span>}
                      <div className="api-provider-actions">
                        {m.registerUrl && (
                          <span className="api-provider-register" onClick={e => {
                            e.stopPropagation();
                            window.electronAPI?.openExternal?.(m.registerUrl);
                          }} title="注册获取API Key">注册</span>
                        )}
                        {m.isCustom && (
                          <span className="api-provider-delete" onClick={e => {
                            e.stopPropagation();
                            deleteCustomProvider(m.id);
                            if (selectedModel === m.id) {
                              setSelectedModel('deepseek-chat');
                              setApiKeyInput(getApiKey('deepseek-chat') || '');
                            }
                            // force re-render
                            setApiSearch(prev => prev);
                          }} title="删除自定义供应商">×</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Selected model info */}
            {(() => {
              const selModel = getAvailableModels().find(m => m.id === selectedModel);
              if (!selModel) return null;
              return (
                <div className="api-modal-info">
                  <span>上下文：{selModel.contextWindow?.toLocaleString() || '未知'} tokens</span>
                  <span>协议：{selModel.protocol === 'anthropic' ? 'Anthropic' : 'OpenAI'}</span>
                </div>
              );
            })()}

            {/* API Key input */}
            <div>
              <label>{getAvailableModels().find(m => m.id === selectedModel)?.apiKeyLabel || 'API Key'}</label>
              <input
                ref={apiKeyInputRef}
                type="password"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmApiKey(); if (e.key === 'Escape') setShowApiModal(false); }}
                placeholder="输入API Key..."
                className="api-modal-input"
              />
            </div>

            {/* Model selection */}
            {(() => {
              const selModel = getAvailableModels().find(m => m.id === selectedModel);
              const options = selModel?.modelOptions || [];
              const currentModelName = modelNameInput || selModel?.modelName || '';
              return (
                <div className="api-model-select-section">
                  <label>选择模型</label>
                  <div className="api-model-chips">
                    {options.map(opt => (
                      <span
                        key={opt}
                        className={`api-model-chip${currentModelName === opt ? ' active' : ''}`}
                        onClick={() => {
                          setModelNameInput(opt);
                          setShowModelNameInput(false);
                        }}
                      >
                        {opt}
                      </span>
                    ))}
                    {!showModelNameInput ? (
                      <span className="api-model-chip custom" onClick={() => setShowModelNameInput(true)}>
                        + 自定义
                      </span>
                    ) : (
                      <input
                        className="api-model-name-input-inline"
                        placeholder="输入模型名..."
                        value={modelNameInput}
                        onChange={e => setModelNameInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') setShowModelNameInput(false); }}
                        onBlur={() => { if (!modelNameInput.trim()) setShowModelNameInput(false); }}
                        autoFocus
                      />
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Baidu extra header (appid) */}
            {(() => {
              const selModel = getAvailableModels().find(m => m.id === selectedModel);
              if (!selModel?.extraHeaderFields?.length) return null;
              return selModel.extraHeaderFields.map(field => (
                <div key={field}>
                  <label>{field.toUpperCase()}</label>
                  <input
                    className="api-modal-input"
                    placeholder={`输入${field}...`}
                    value={extraHeaderInputs[field] || getExtraHeader(selectedModel, field)}
                    onChange={e => setExtraHeaderInputs(prev => ({ ...prev, [field]: e.target.value }))}
                  />
                </div>
              ));
            })()}

            {/* Custom provider form */}
            <div className="api-modal-section">
              <span className="api-modal-section-title" onClick={() => setShowCustomForm(!showCustomForm)}>
                {showCustomForm ? '▾ 自定义供应商' : '▸ 自定义供应商'}
              </span>
              {showCustomForm && (
                <div className="api-modal-form">
                  <input className="api-modal-input" placeholder="供应商名称（必填）" value={customForm.name}
                    onChange={e => setCustomForm(prev => ({ ...prev, name: e.target.value }))} />
                  <input className="api-modal-input" placeholder="API端点URL（必填）" value={customForm.endpoint}
                    onChange={e => setCustomForm(prev => ({ ...prev, endpoint: e.target.value }))} />
                  <input className="api-modal-input" placeholder="API Key" type="password" value={customForm.apiKey || ''}
                    onChange={e => setCustomForm(prev => ({ ...prev, apiKey: e.target.value }))} />
                  <input className="api-modal-input" placeholder="模型名（可选）" value={customForm.modelName}
                    onChange={e => setCustomForm(prev => ({ ...prev, modelName: e.target.value }))} />
                  <div className="api-modal-form-actions">
                    <button className="api-modal-btn cancel" onClick={() => setShowCustomForm(false)}>取消</button>
                    <button className="api-modal-btn confirm active" onClick={() => {
                      if (!customForm.name.trim() || !customForm.endpoint.trim()) return;
                      saveCustomProvider({
                        name: customForm.name.trim(),
                        endpoint: customForm.endpoint.trim(),
                        modelName: customForm.modelName.trim(),
                      });
                      if (customForm.apiKey?.trim()) {
                        setApiKey(customForm.name.trim(), customForm.apiKey.trim());
                      }
                      setSelectedModel(customForm.name.trim());
                      setApiKeyInput(customForm.apiKey?.trim() || '');
                      setModelNameInput(customForm.modelName.trim());
                      setShowCustomForm(false);
                      setCustomForm({ name: '', endpoint: '', modelName: '', apiKey: '' });
                    }}>添加</button>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="api-modal-actions">
              <button className="api-modal-btn cancel" onClick={() => setShowApiModal(false)}>取消</button>
              <button className={`api-modal-btn confirm ${apiKeyInput.trim() ? 'active' : ''}`} onClick={confirmApiKey}>确认</button>
            </div>

            <div className="api-modal-reset">
              <span onClick={() => {
                try { localStorage.removeItem('cc_onboarding_done'); } catch {}
                window.location.reload();
              }}>重新运行引导流程</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
