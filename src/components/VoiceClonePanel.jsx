import { useState, useRef, useEffect, useCallback } from 'react';
import {
  setTTSBackend, getTTSBackend, getTTSBackends,
  testVoice, getVoiceSummary,
  startRecording, stopRecording, saveVoiceSample, hasVoiceSample,
  runCloneDiagnostics,
} from '../services/speech';

const REF_TEXT = '清晨的阳光透过玻璃窗洒在书桌上，我端起一杯温热的绿茶，轻轻吹了吹水面上的茶叶。窗外的鸟儿在枝头欢快地歌唱，微风拂过，带来了阵阵花香。';

export default function VoiceClonePanel({ onClose }) {
  const [backend, setBackend] = useState(getTTSBackend());
  const [testText, setTestText] = useState('你好，我是CC，这是我的声音。');
  const [message, setMessage] = useState('');
  const [cloneStatus, setCloneStatus] = useState(null); // null | checking | online | offline
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasSample, setHasSample] = useState(hasVoiceSample());
  const recordTimerRef = useRef(null);
  const handleRecordStopRef = useRef(null);

  const backends = getTTSBackends();
  const timerRef = useRef(null);

  // Poll clone server status
  useEffect(() => {
    if (backend !== 'clone') { setCloneStatus(null); return; }

    const check = async () => {
      if (!window.electronAPI?.ttsServerStatus) { setCloneStatus('offline'); return; }
      try {
        const s = await window.electronAPI.ttsServerStatus();
        setCloneStatus(s.running ? 'online' : 'offline');
      } catch {
        setCloneStatus('offline');
      }
    };
    check();
    timerRef.current = setInterval(check, 10000);
    return () => clearInterval(timerRef.current);
  }, [backend]);

  const showMsg = (msg, type) => { setMessage(msg); setTimeout(() => setMessage(''), 2500); };

  const handleDiagnose = async () => {
    setMessage('🔍 诊断中...');
    try {
      const results = await runCloneDiagnostics();
      const lines = results.map(r => `${r.ok ? '✅' : '❌'} ${r.step}: ${r.detail}`);
      setMessage(lines.join('\n'));
    } catch (e) {
      setMessage(`诊断异常: ${e.message}`);
    }
  };

  const handleBackendChange = (b) => {
    setBackend(b);
    setTTSBackend(b);
    showMsg(`已切换为: ${backends[b]?.name || b}`);
  };

  const handleTest = () => {
    if (backend === 'clone' && cloneStatus === 'online') {
      testVoice(testText);
    } else {
      window.speechSynthesis?.cancel();
      const utter = new SpeechSynthesisUtterance(testText);
      utter.rate = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const zh = voices.find(v => v.lang.startsWith('zh'));
      if (zh) utter.voice = zh;
      window.speechSynthesis.speak(utter);
    }
    showMsg('正在播放...');
  };

  const handleRecordStart = useCallback(async () => {
    try {
      await startRecording();
      setIsRecording(true);
      setRecordingTime(0);
      recordTimerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);

      const onGlobalUp = () => {
        handleRecordStopRef.current();
        window.removeEventListener('mouseup', onGlobalUp);
        window.removeEventListener('touchend', onGlobalUp);
      };
      window.addEventListener('mouseup', onGlobalUp);
      window.addEventListener('touchend', onGlobalUp);
    } catch (e) {
      showMsg(`录音失败: ${e.message}`);
    }
  }, []);

  const handleRecordStop = useCallback(async () => {
    if (!isRecording) return;
    setIsRecording(false);
    clearInterval(recordTimerRef.current);

    const result = await stopRecording();
    if (result?.base64) {
      await saveVoiceSample(result.base64, result.mimeType || 'audio/webm');
      setHasSample(true);
      showMsg('语音样本已保存！克隆引擎将使用你的声音');
    }
  }, [isRecording]);
  handleRecordStopRef.current = handleRecordStop;

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearInterval(recordTimerRef.current);
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
      fontFamily: '"Microsoft YaHei","PingFang SC",sans-serif',
    }} onClick={onClose}>
      <div style={{
        background: 'rgba(15,14,26,0.95)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 24, padding: '36px 40px', maxWidth: 480, width: '90%',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', gap: 24,
      }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#e0ddf0', margin: 0 }}>🔊 语音设置</h2>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.03)', color: '#8b8baa', fontSize: 18, cursor: 'pointer',
          }}>✕</button>
        </div>

        {message && (
          <div style={{
            padding: '8px 16px', borderRadius: 10, fontSize: 12, textAlign: 'left',
            background: 'rgba(6,214,160,0.08)', color: '#06d6a0',
            border: '1px solid rgba(6,214,160,0.15)',
            whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto',
          }}>{message}</div>
        )}

        {/* Engine selector */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 500, color: '#d0cce0', margin: 0 }}>语音引擎</h3>
          {Object.entries(backends).map(([key, info]) => (
            <label key={key} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderRadius: 12, cursor: 'pointer',
              background: backend === key ? 'rgba(124,58,237,0.1)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${backend === key ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.05)'}`,
            }}>
              <input type="radio" name="tts_backend" checked={backend === key}
                onChange={() => handleBackendChange(key)}
                style={{ accentColor: '#7c3aed' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: '#d0cce0', fontWeight: 500 }}>
                  {info.name}
                  {key === 'clone' && cloneStatus === 'online' && (
                    <span style={{ fontSize: 10, color: '#06d6a0', marginLeft: 8 }}>● 就绪</span>
                  )}
                  {key === 'clone' && cloneStatus === 'offline' && (
                    <span style={{ fontSize: 10, color: '#6b6b8a', marginLeft: 8 }}>○ 离线</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#6b6b8a', marginTop: 2 }}>{info.desc}</div>
              </div>
            </label>
          ))}

          {backend === 'clone' && cloneStatus === 'offline' && (
            <div style={{ fontSize: 12, color: '#6b6b8a', lineHeight: 1.6, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)' }}>
              GPT-SoVITS 未启动。请运行: cd GPT-SoVITS && python api_v2.py -a 127.0.0.1 -p 9880
            </div>
          )}
          {backend === 'clone' && cloneStatus === 'online' && (
            <div style={{ fontSize: 12, color: '#06d6a0', lineHeight: 1.6, padding: '8px 12px', borderRadius: 10, background: 'rgba(6,214,160,0.05)' }}>
              ✅ GPT-SoVITS 已就绪，CC将用你的克隆音色说话。
            </div>
          )}
        </div>

        {/* Voice Sample Recording — 仅克隆引擎需要 */}
        {backend === 'clone' && (
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 15, fontWeight: 500, color: '#d0cce0', margin: 0 }}>录制语音样本</h3>
            {hasSample && (
              <span style={{ fontSize: 12, color: '#06d6a0', background: 'rgba(6,214,160,0.08)', padding: '2px 10px', borderRadius: 8 }}>✅ 已录制</span>
            )}
          </div>

          <div style={{
            fontSize: 12, color: '#6b6b8a', lineHeight: 1.8,
            padding: '12px 16px', borderRadius: 10,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.04)',
          }}>
            <div style={{ marginBottom: 6, color: '#8b8baa', fontWeight: 500 }}>📖 请朗读以下文本：</div>
            {REF_TEXT}
          </div>

          <button
            onMouseDown={handleRecordStart}
            onTouchStart={handleRecordStart}
            style={{
              width: '100%', padding: '14px 24px', borderRadius: 12, border: 'none',
              cursor: 'pointer', fontSize: 15, fontWeight: 600,
              transition: 'all 0.2s',
              background: isRecording
                ? '#dc2626'
                : 'linear-gradient(135deg, #7c3aed, #a78bfa)',
              color: '#fff',
              animation: isRecording ? 'pulse-rec 1.2s ease-in-out infinite' : 'none',
              userSelect: 'none',
            }}>
            {isRecording
              ? `⏺ 录音中... ${recordingTime}s (松开停止)`
              : hasSample
                ? '🎤 按住重新录制'
                : '🎤 按住开始录制'}
          </button>
          {isRecording && (
            <div style={{ fontSize: 12, color: '#ef4444', textAlign: 'center' }}>
              正在录制，请朗读上方文本。松开按钮停止。
            </div>
          )}
        </div>
        )}

        {/* Test */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 500, color: '#d0cce0', margin: 0 }}>测试语音</h3>
          <input
            value={testText}
            onChange={e => setTestText(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#d0cce0', fontSize: 13, outline: 'none', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={handleTest} style={{
              padding: '10px 24px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
              color: '#fff', fontSize: 14, cursor: 'pointer',
            }}>
              🔊 试听
            </button>
            {backend === 'clone' && (
              <button onClick={handleDiagnose} style={{
                padding: '10px 24px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: '#d0cce0', fontSize: 13, cursor: 'pointer',
              }}>
                🔧 诊断克隆链路
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
