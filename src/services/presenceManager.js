/**
 * Presence Manager — tracks user activity to manage CC's online state.
 *
 * States: ONLINE → IDLE(30s) → DOZING(5min)
 *            ↑                      │
 *            └──── user activity ────┘
 *
 * Fires callbacks for proactive speaking:
 *   onGreeting(timeOfDay)
 *   onReturn(awayMinutes)
 *   onSilence()
 *   onWakeUp()
 */

const IDLE_TIMEOUT = 30 * 1000;
const DOZE_TIMEOUT = 5 * 60 * 1000;
const RETURN_THRESHOLD = 30 * 1000;   // away > 30s to trigger return
const SILENCE_TIMEOUT = 2 * 60 * 1000; // 2min silence

const GREETINGS = {
  morning: [
    '早安！新的一天开始了 ☀️',
    '早上好！今天天气不错，适合开始新的冒险～',
    '早安！准备好了吗？今天有很多可能 ✨',
  ],
  afternoon: [
    '下午好，今天进展如何？',
    '下午好～有什么需要我帮忙的吗？',
    '午后的阳光正好，来聊聊天吧 ☕',
  ],
  evening: [
    '晚上好，辛苦了 🌙',
    '晚上好！今天过得怎么样？',
    '夜深了，需要我陪你吗？🎑',
  ],
  night: [
    '这么晚了还没休息？注意身体哦 🌙',
    '深夜了，需要帮忙解决什么紧急问题吗？',
  ],
};

const RETURN_MSGS = [
  '你回来了！刚才在忙什么？',
  '欢迎回来～有什么新进展吗？',
  '嘿，你回来了！继续我们的对话吧～',
];

const SILENCE_MSGS = [
  '在想什么呢？',
  '还在吗？有什么我可以帮你的？',
  '看你沉默了一会儿，有什么想法可以和我聊聊～',
];

export function createPresenceManager() {
  let currentState = 'ONLINE';
  let lastActivityAt = Date.now();
  let sessionStartedAt = Date.now();
  let hasGreeted = false;
  let hasReturned = false;
  let silenceFired = false;
  let lastActivityGap = 0;
  let checkIntervalId = null;
  let callbacks = {};

  function getTimeOfDay() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'afternoon';
    if (h >= 17 && h < 23) return 'evening';
    return 'night';
  }

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function checkState() {
    const now = Date.now();
    const inactive = now - lastActivityAt;

    if (currentState === 'DOZING') {
      if (inactive < 1000) {
        // User came back
        currentState = 'ONLINE';
        hasReturned = true;
        silenceFired = false;
        callbacks.onWakeUp?.();
        callbacks.onStatusChange?.('ONLINE');
      }
      return;
    }

    if (inactive > DOZE_TIMEOUT) {
      currentState = 'DOZING';
      callbacks.onStatusChange?.('DOZING');
      return;
    }

    if (inactive > IDLE_TIMEOUT && currentState === 'ONLINE') {
      currentState = 'IDLE';
      callbacks.onStatusChange?.('IDLE');
    }

    // Silence check (only when ONLINE)
    if (currentState === 'ONLINE' && !silenceFired && inactive > SILENCE_TIMEOUT) {
      silenceFired = true;
      callbacks.onSilence?.(pickRandom(SILENCE_MSGS));
    }
  }

  const manager = {
    getState: () => currentState,
    getLastActivity: () => lastActivityAt,

    setCallbacks(cbs) {
      callbacks = cbs;
    },

    /** Call on any user activity (typing, clicking, sending message). */
    onActivity() {
      const now = Date.now();
      const gap = now - lastActivityAt;

      // Check for return after absence
      if (gap > RETURN_THRESHOLD && currentState !== 'DOZING' && hasReturned === false) {
        hasReturned = true;
        const awayMin = Math.round(gap / 60000);
        if (awayMin >= 1) {
          callbacks.onReturn?.(pickRandom(RETURN_MSGS), awayMin);
        }
      }

      // First activity of session → greeting
      if (!hasGreeted && now - sessionStartedAt < 10000) {
        hasGreeted = true;
        const tod = getTimeOfDay();
        callbacks.onGreeting?.(pickRandom(GREETINGS[tod]), tod);
      }

      // Wake from DOZING
      if (currentState === 'DOZING') {
        currentState = 'ONLINE';
        hasReturned = true;
        silenceFired = false;
        callbacks.onWakeUp?.();
        callbacks.onStatusChange?.('ONLINE');
      } else if (currentState === 'IDLE') {
        currentState = 'ONLINE';
        callbacks.onStatusChange?.('ONLINE');
      }

      silenceFired = false;
      lastActivityAt = now;
    },

    /** Start periodic state checking. */
    start() {
      checkIntervalId = setInterval(checkState, 5000);
      // Send greeting on first launch
      setTimeout(() => {
        if (!hasGreeted) {
          hasGreeted = true;
          const tod = getTimeOfDay();
          callbacks.onGreeting?.(pickRandom(GREETINGS[tod]), tod);
        }
      }, 2000);
    },

    stop() {
      clearInterval(checkIntervalId);
      checkIntervalId = null;
    },

    reset() {
      sessionStartedAt = Date.now();
      lastActivityAt = Date.now();
      currentState = 'ONLINE';
      hasGreeted = false;
      hasReturned = false;
      silenceFired = false;
    },
  };

  return manager;
}
