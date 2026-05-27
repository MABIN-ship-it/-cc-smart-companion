/**
 * Speech Service — STT + multi-backend TTS with voice cloning support.
 *
 * TTS Backends:
 *   web-speech (default) — Web Speech API, free, offline-capable
 *   edge-tts       — Microsoft Edge neural voices via PowerShell, needs network
 *   clone          — 本地 GPT-SoVITS 语音克隆 (需用户自行下载)
 *
 * GPT-SoVITS: GitHub RVC-Boss/GPT-SoVITS, CPU运行, ~2.4GB
 * 启动: python api_v2.py -a 127.0.0.1 -p 9880  → http://127.0.0.1:9880
 *
 * Voice clone flow:
 *   1. User downloads & starts GPT-SoVITS
 *   2. User records a sample (or uses built-in reference audio)
 *   3. Sample is saved to localStorage + disk
 *   4. CC sends clone request to local GPT-SoVITS server
 */

/* ---------- TTS Backend Config ---------- */
const TTS_BACKENDS = {
  'clone': { name: 'CC本音', desc: 'GPT-SoVITS 本地克隆，需下载启动' },
  'web-speech': { name: '系统语音', desc: '浏览器内置TTS，免费离线' },
  'edge-tts': { name: 'Edge 神经语音', desc: '微软Edge高质量语音，需联网' },
};

/** Built-in reference text — shipped with the app, no user setup needed. */
const BUILT_IN_REF_TEXT = '清晨的阳光透过玻璃窗洒在书桌上，我端起一杯温热的绿茶，轻轻吹了吹水面上的茶叶。窗外的鸟儿在枝头欢快地歌唱，微风拂过，带来了阵阵花香。今天是个美好的日子，我打算去公园散步。路上遇到了几位老朋友，我们热情地打招呼，聊了聊最近的生活。公园里的花开得正艳，红的、黄的、紫的，五彩缤纷，美丽极了。';

/** Cached built-in reference audio path (resolved once from main process). */
let builtInRefAudioPath = null;

let currentBackend = (() => {
  let stored = null;
  try { stored = localStorage.getItem('cc_tts_backend'); } catch {}
  // 迁移：忽略旧 'clone' 值，默认使用晓伊(edge-tts)
  const backend = (stored && stored !== 'clone') ? stored : 'edge-tts';
  try { localStorage.setItem('cc_tts_backend', backend); } catch {}
  return backend;
})();

let voiceSampleBase64 = null;
try { voiceSampleBase64 = localStorage.getItem('cc_voice_sample'); } catch {}

let voiceSamplePath = null;

// 用于取消当前播放的音频
let currentAudio = null;
let cancelled = false;

/* ---------- STT ---------- */

let recognition = null;

export function isSpeechSupported() {
  // Electron 环境下 SpeechRecognition 依赖 Google 云服务，在中国不可用
  // 直接返回 false 走 MediaRecorder 录音方案
  if (window.electronAPI) return false;
  try {
    return ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  } catch { return false; }
}

export function isMediaRecorderSupported() {
  try {
    return navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
  } catch { return false; }
}

export function startListening(onResult, onError, onEnd) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    onError?.('SpeechRecognition 不可用');
    return false;
  }

  try {
    recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) onResult(transcript);
    };

    recognition.onerror = (event) => {
      onError?.(event.error);
      onEnd?.();
    };

    recognition.onend = () => onEnd?.();

    recognition.start();
    return true;
  } catch (e) {
    onError?.(e.message);
    return false;
  }
}

export function stopListening() {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
}

/* ---------- MediaRecorder-based voice recording (fallback) ---------- */

let voiceRecorder = null;
let voiceChunks = [];

export async function startVoiceRecording(onStart, onError) {
  voiceChunks = [];
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    voiceRecorder = new MediaRecorder(stream, { mimeType });
    voiceRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) voiceChunks.push(e.data);
    };

    voiceRecorder.onstart = () => onStart?.();
    voiceRecorder.onerror = (e) => onError?.(e.message);
    voiceRecorder.start();
  } catch (e) {
    onError?.(`无法访问麦克风: ${e.message}`);
    throw e;
  }
}

export function stopVoiceRecording() {
  return new Promise((resolve) => {
    if (!voiceRecorder || voiceRecorder.state === 'inactive') {
      resolve(null);
      return;
    }

    voiceRecorder.onstop = () => {
      const mimeType = voiceRecorder.mimeType || 'audio/webm';
      const blob = new Blob(voiceChunks, { type: mimeType });

      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          base64: reader.result.split(',')[1],
          mimeType,
          fullDataUrl: reader.result,
          size: blob.size,
        });
      };
      reader.readAsDataURL(blob);

      voiceRecorder.stream.getTracks().forEach(t => t.stop());
    };

    voiceRecorder.stop();
  });
}

export function cancelVoiceRecording() {
  if (voiceRecorder && voiceRecorder.state !== 'inactive') {
    voiceRecorder.stream.getTracks().forEach(t => t.stop());
    voiceRecorder = null;
    voiceChunks = [];
  }
}

/* ---------- STT: Speech-to-Text via local faster-whisper ---------- */

/**
 * Transcribe recorded audio to text using local faster-whisper STT server.
 * @param {string} audioBase64 - Base64-encoded audio data (without data URL prefix)
 * @param {string} mimeType - MIME type of the audio (e.g. 'audio/webm')
 * @returns {Promise<{success: boolean, text?: string, error?: string}>}
 */
export async function transcribeAudio(audioBase64, mimeType) {
  if (!window.electronAPI?.sttTranscribe) {
    return { success: false, error: 'STT功能不可用（非Electron环境）' };
  }

  try {
    // 1. Check STT server health
    const status = await window.electronAPI.sttServerStatus();

    // 2. Start if not running
    if (!status?.running) {
      const startResult = await window.electronAPI.sttServerStart();
      if (!startResult.success) {
        return { success: false, error: startResult.error || 'STT服务启动失败' };
      }
    }

    // 3. Transcribe
    const result = await window.electronAPI.sttTranscribe(audioBase64, mimeType);
    if (!result.success) {
      return { success: false, error: result.error || '转写失败' };
    }

    return { success: true, text: result.text, duration: result.duration };
  } catch (e) {
    return { success: false, error: `STT转写异常: ${e.message}` };
  }
}

/* ---------- Voice Recording ---------- */

let mediaRecorder = null;
let recordedChunks = [];

export async function startRecording() {
  recordedChunks = [];
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    return new Promise((resolve, reject) => {
      mediaRecorder.onstart = () => resolve(true);
      mediaRecorder.onerror = (e) => reject(e);
      mediaRecorder.start();
    });
  } catch (e) {
    throw new Error(`无法访问麦克风: ${e.message}`);
  }
}

export function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      resolve(null);
      return;
    }

    mediaRecorder.onstop = () => {
      const mimeType = mediaRecorder.mimeType || 'audio/webm';
      const blob = new Blob(recordedChunks, { type: mimeType });

      // Convert to base64
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          base64: reader.result.split(',')[1],
          mimeType,
          size: blob.size,
          duration: recordedChunks.length * 0.1, // rough estimate
        });
      };
      reader.readAsDataURL(blob);

      // Stop all tracks
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
    };

    mediaRecorder.stop();
  });
}

/** Save recorded voice sample to localStorage (base64 WAV) and disk for F5-TTS. */
export async function saveVoiceSample(audioBase64, mimeType = 'audio/webm') {
  voiceSampleBase64 = audioBase64;
  try { localStorage.setItem('cc_voice_sample', audioBase64); } catch {}

  // 写入磁盘文件供 F5-TTS 克隆服务使用
  if (window.electronAPI?.saveBase64ToFile && window.electronAPI?.getAppPath) {
    try {
      const ext = mimeType === 'audio/wav' ? 'wav' : 'webm';
      const userDataPath = await window.electronAPI.getAppPath();
      const voiceDir = userDataPath.replace(/\\/g, '/') + '/voice_samples';
      const filePath = voiceDir + '/user_voice.' + ext;
      const result = await window.electronAPI.saveBase64ToFile(audioBase64, filePath);
      if (result.success) {
        setVoiceSamplePath(filePath);
        console.log('[Voice] 语音样本已保存到磁盘:', filePath);
      }
    } catch (e) {
      console.warn('[Voice] 样本写入磁盘失败:', e.message);
    }
  }
}

export function getVoiceSample() {
  return voiceSampleBase64;
}

export function hasVoiceSample() {
  return !!voiceSampleBase64;
}

/* ---------- TTS Backends ---------- */

export function setTTSBackend(backend) {
  currentBackend = backend;
  try { localStorage.setItem('cc_tts_backend', backend); } catch {}
}

export function getTTSBackend() {
  return currentBackend;
}

export function getTTSBackends() {
  return TTS_BACKENDS;
}

/** Check if the clone voice server is ready (running + model loaded). */
export async function isCloneReady() {
  if (!window.electronAPI?.ttsServerStatus) return false;
  try {
    const status = await window.electronAPI.ttsServerStatus();
    return status.running && status.serverReady && status.health?.model_loaded;
  } catch {
    return false;
  }
}

/** Cancel any currently playing speech. */
export function cancelSpeech() {
  cancelled = true;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * 清洗文本用于TTS朗读：移除markdown标记、代码块、emoji、特殊符号。
 */
function cleanTextForSpeech(text) {
  let cleaned = text
    .replace(/```[\s\S]*?```/g, '代码块')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]{3,}\s*$/gm, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, '')
    .replace(/[★☆☀⚡✈✓✗☁❄♻☕⏰⚠✅❌➡⬆⬇⬅]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

/**
 * Speak text using the current TTS backend.
 * @param {string} text - Text to speak
 * @param {object} options - { rate, pitch, volume, onStart, onEnd }
 */
export async function speakText(text, options = {}) {
  cancelSpeech();
  cancelled = false;
  const cleaned = cleanTextForSpeech(text);
  const speakable = cleaned.slice(0, 300);

  switch (currentBackend) {
    case 'edge-tts':
      return await speakViaEdgeTTS(speakable, options);
    case 'clone':
      return await speakViaClone(speakable, options);
    case 'web-speech':
    default:
      return speakViaWebSpeech(speakable, options);
  }
}

/** Web Speech API TTS — best effort for Chinese voice. */
function speakViaWebSpeech(text, options) {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN';
  utter.rate = options.rate || 1.05;
  utter.pitch = options.pitch || 1.0;
  utter.volume = options.volume || 1.0;

  // Try to find the best Chinese voice
  const voices = window.speechSynthesis.getVoices();
  // Prefer neural/OneCore voices on Windows
  const preferred = ['Xiaoxiao', 'Yaoyao', 'Kangkang', 'Yunxi', 'Xiaoyi'];
  let bestVoice = null;
  for (const pref of preferred) {
    bestVoice = voices.find(v => v.name.includes(pref) && v.lang.startsWith('zh'));
    if (bestVoice) break;
  }
  if (!bestVoice) {
    bestVoice = voices.find(v => v.lang.startsWith('zh'));
  }
  if (bestVoice) {
    utter.voice = bestVoice;
  }

  if (options.onStart) utter.onstart = options.onStart;
  if (options.onEnd) utter.onend = options.onEnd;

  window.speechSynthesis.speak(utter);
}

/** Edge TTS via Electron IPC → base64 → Audio playback. */
async function speakViaEdgeTTS(text, options) {
  if (!window.electronAPI?.edgeTtsSpeak) {
    console.warn('[TTS] edgeTtsSpeak 不可用（非Electron环境？），回退到系统语音');
    return speakViaWebSpeech(text, options);
  }

  try {
    window.electronAPI.edgeTtsCancel();
    if (options.onStart) options.onStart();

    const result = await window.electronAPI.edgeTtsSpeak(text);
    if (!result?.success) {
      console.warn('[TTS] Edge TTS 失败:', result?.error, '→ 回退到系统语音');
      return speakViaWebSpeech(text, options);
    }
    if (!result?.audioBase64) {
      console.warn('[TTS] Edge TTS 返回空音频 → 回退到系统语音');
      return speakViaWebSpeech(text, options);
    }

    if (cancelled) return;

    const blob = _base64ToBlob(result.audioBase64, result.mimeType || 'audio/mpeg');
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      if (options.onEnd) options.onEnd();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      if (options.onEnd) options.onEnd();
    };
    audio.play().catch(() => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      if (options.onEnd) options.onEnd();
    });
  } catch (e) {
    console.warn('[TTS] Edge TTS 异常:', e.message, '→ 回退到系统语音');
    speakViaWebSpeech(text, options);
  }
}

/** User's transcript of the reference audio. */
let voiceSampleRefText = '';
try { voiceSampleRefText = localStorage.getItem('cc_voice_ref_text') || ''; } catch {}

export function setVoiceSamplePath(filePath) {
  voiceSamplePath = filePath;
}

export function getVoiceSamplePath() {
  return voiceSamplePath;
}

export function setVoiceSampleRefText(refText) {
  voiceSampleRefText = refText;
  try { localStorage.setItem('cc_voice_ref_text', refText); } catch {}
}

export function getVoiceSampleRefText() {
  return voiceSampleRefText;
}

/** Resolve the built-in reference audio path (IPC, cached). */
async function getBuiltInRefPath() {
  if (builtInRefAudioPath) return builtInRefAudioPath;
  if (window.electronAPI?.getBuiltInVoicePath) {
    try {
      builtInRefAudioPath = await window.electronAPI.getBuiltInVoicePath();
      return builtInRefAudioPath;
    } catch {}
  }
  return null;
}

/**
 * Speak text using the cloned voice via local GPT-SoVITS.
 * Falls back to web-speech or edge-tts if server is not running.
 * Uses built-in reference audio shipped with the app — no user setup needed.
 */
async function speakViaClone(text, options) {
  console.log('[CLONE-DEBUG] speakViaClone 开始, currentBackend=', currentBackend, 'text=', text.slice(0,30));
  // Resolve reference: user-recorded sample first, then built-in
  let refAudioPath = getVoiceSamplePath();
  console.log('[CLONE-DEBUG] voiceSamplePath=', refAudioPath);

  if (!refAudioPath) {
    refAudioPath = await getBuiltInRefPath();
    console.log('[CLONE-DEBUG] builtInRefPath=', refAudioPath);
  }

  if (!refAudioPath) {
    console.warn('[CLONE-DEBUG] ❌ 无参考音频 → fallback到系统语音');
    return speakViaWebSpeech(text, options);
  }

  if (!window.electronAPI?.ttsCloneSpeak) {
    console.warn('[CLONE-DEBUG] ❌ ttsCloneSpeak IPC不可用 → fallback到系统语音');
    return speakViaWebSpeech(text, options);
  }

  try {
    // Check if local GPT-SoVITS server is running
    const status = await window.electronAPI.ttsServerStatus();
    console.log('[CLONE-DEBUG] ttsServerStatus=', JSON.stringify(status));
    if (!status.running) {
      console.warn('[CLONE-DEBUG] GPT-SoVITS未运行 → 尝试启动...');
      const startResult = await window.electronAPI.ttsServerStart();
      console.log('[CLONE-DEBUG] ttsServerStart=', JSON.stringify(startResult));
      if (!startResult.success) {
        console.warn('[CLONE-DEBUG] ❌ GPT-SoVITS启动失败:', startResult.error, '→ fallback到Edge TTS');
        return speakViaEdgeTTS(text, options);
      }
      console.log('[CLONE-DEBUG] GPT-SoVITS 已就绪');
      await new Promise(r => setTimeout(r, 800));
    }

    if (options.onStart) options.onStart();

    console.log('[CLONE-DEBUG] 调用 ttsCloneSpeak, refAudioPath=', refAudioPath);
    const result = await window.electronAPI.ttsCloneSpeak({
      refAudioPath,
      genText: text.slice(0, 200),
    });
    console.log('[CLONE-DEBUG] ttsCloneSpeak result.success=', result.success, 'error=', result.error, 'audioSize=', result.audioBase64?.length);

    if (!result.success) {
      console.warn('[CLONE-DEBUG] ❌ Clone失败:', result.error, '→ fallback到Edge TTS');
      return speakViaEdgeTTS(text, options);
    }

    if (cancelled) return;
    console.log('[CLONE-DEBUG] ✅ Clone成功，播放音频...');

    const blob = _base64ToBlob(result.audioBase64, result.mimeType);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => {
      console.log('[CLONE-DEBUG] 音频播放完成');
      URL.revokeObjectURL(url);
      currentAudio = null;
      if (options.onEnd) options.onEnd();
    };
    audio.onerror = (e) => {
      console.warn('[CLONE-DEBUG] ❌ 音频播放失败:', e);
      URL.revokeObjectURL(url);
      currentAudio = null;
      if (options.onEnd) options.onEnd();
    };
    audio.play().catch(e => {
      console.warn('[CLONE-DEBUG] ❌ audio.play() 失败:', e.message);
    });
  } catch (e) {
    console.warn('[CLONE-DEBUG] ❌ 异常:', e.message, '→ fallback到Edge TTS');
    return speakViaEdgeTTS(text, options);
  }
}

function _base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64);
  const byteArrays = [];
  for (let offset = 0; offset < byteChars.length; offset += 512) {
    const slice = byteChars.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: mimeType });
}

/* ---------- Voice Utilities ---------- */

export function getVoices() {
  if (!('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices();
}

/** Test voice: speak a short phrase. */
export function testVoice(text = '你好，我是CC，这是我的声音测试。') {
  window.speechSynthesis?.cancel();
  setTimeout(() => speakText(text), 100);
}

/** Get a human-readable summary of the current voice setup. */
export function getVoiceSummary() {
  const backend = TTS_BACKENDS[currentBackend] || TTS_BACKENDS['web-speech'];
  const hasSample = hasVoiceSample();
  return {
    backend: currentBackend,
    backendName: backend.name,
    hasClonedVoice: hasSample && currentBackend === 'clone',
    hasSample,
  };
}

/**
 * Diagnostic: step-by-step test of the clone TTS chain.
 * Returns an array of {step, ok, detail} results.
 */
export async function runCloneDiagnostics() {
  const results = [];

  const add = (step, ok, detail) => {
    results.push({ step, ok, detail });
    console.log('[DIAG]', ok ? '✅' : '❌', step, '-', detail);
  };

  // Step 1: Check backend
  add('1. 当前后端', currentBackend === 'clone',
    `currentBackend = "${currentBackend}"${currentBackend === 'clone' ? '' : ' (应为 clone!)'}`);

  // Step 2: Check Electron IPC available
  const hasIPC = !!(window.electronAPI?.ttsCloneSpeak);
  add('2. Electron IPC', hasIPC,
    hasIPC ? 'ttsCloneSpeak 可用' : 'ttsCloneSpeak 不存在（非Electron环境？）');

  if (!hasIPC) {
    add('总结', false, '非Electron环境，无法使用克隆语音');
    return results;
  }

  // Step 3: Check reference audio
  let refAudioPath = getVoiceSamplePath();
  if (!refAudioPath) {
    try {
      refAudioPath = await window.electronAPI.getBuiltInVoicePath();
    } catch (e) {
      refAudioPath = null;
    }
  }
  add('3. 参考音频路径', !!refAudioPath,
    refAudioPath ? refAudioPath : '无参考音频（user sample + built-in 都为空）');

  // Step 4: Check server status
  try {
    const status = await window.electronAPI.ttsServerStatus();
    add('4. GPT-SoVITS 状态', status?.running === true,
      JSON.stringify(status));
  } catch (e) {
    add('4. GPT-SoVITS 状态', false, `查询失败: ${e.message}`);
    add('总结', false, 'GPT-SoVITS 服务不可达');
    return results;
  }

  // Step 5: Try actual TTS
  if (refAudioPath) {
    try {
      const result = await window.electronAPI.ttsCloneSpeak({
        refAudioPath,
        genText: '你好测试',
      });
      if (result.success) {
        add('5. TTS克隆请求', true, `成功, 音频 ${result.audioBase64?.length || 0} bytes`);
        // Try playing
        try {
          const blob = _base64ToBlob(result.audioBase64, result.mimeType || 'audio/wav');
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play().catch(e => {
            add('6. 音频播放', false, `播放失败: ${e.message}`);
          });
          audio.onended = () => URL.revokeObjectURL(url);
          add('6. 音频播放', true, '正在播放...');
        } catch (e) {
          add('6. 音频播放', false, `解码失败: ${e.message}`);
        }
      } else {
        add('5. TTS克隆请求', false, `失败: ${result.error || '未知错误'}`);
      }
    } catch (e) {
      add('5. TTS克隆请求', false, `异常: ${e.message}`);
    }
  } else {
    add('5. TTS克隆请求', false, '跳过（无参考音频）');
  }

  add('总结', results.every(r => r.ok !== false), '见上方详情');
  return results;
}
