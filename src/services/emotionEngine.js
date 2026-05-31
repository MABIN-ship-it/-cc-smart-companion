/**
 * Emotion Engine — detects user emotion from messages and maintains
 * CC's own emotion as a valence-arousal 2D model.
 *
 * User emotion: happy | sad | anxious | excited | neutral
 * CC emotion: { valence: -1..1, arousal: -1..1 }
 *   valence: positive ↔ negative
 *   arousal: excited ↔ calm
 */

/**
 * @typedef {'happy'|'sad'|'anxious'|'excited'|'neutral'} UserEmotionLabel
 * @typedef {'excited'|'happy'|'anxious'|'sad'|'calm'|'neutral'} CCMoodLabel
 * @typedef {{ valence: number, arousal: number }} CCEmotion
 */

// Keyword/emoji maps for user emotion detection
const EMOTION_MAPS = {
  happy: ['太好了', '哈哈', '棒', '开心', '喜欢', '谢谢', '感谢', '不错', '好耶',
    '搞定', '完成', '成功', '厉害', '优秀', '赞', '😊', '😄', '😁', '🎉',
    '太爽', '舒服', '满分', '完美', '给力', 'nice', 'great'],
  sad: ['难过', '伤心', '失败', '不行', '糟糕', '唉', '烦', '累', '😢',
    '😭', '😞', '😔', '哭了', '难受', '绝望', '遗憾', '可惜', '无语',
    '崩溃', '心累', '丧', '麻了'],
  anxious: ['担心', '焦虑', '怎么办', '紧张', '害怕', '😰', '😨', '😱',
    '压力', '赶不上', '来不及', '怕', '忐忑', '不安', '纠结', '犹豫',
    '不确定', '万一', '会不会'],
  excited: ['太棒', '!!', '！！！', '🎉', '激动', '酷', '牛', '666',
    '卧槽', 'wc', '天哪', '不敢相信', '冲', '起飞', '炸裂',
    '🤩', '🔥', '💪', '🚀', '绝了'],
};

// Map user emotion → CC valence/arousal influence
const INFLUENCE = {
  happy:    { valence: 0.3,  arousal: 0.15 },
  sad:      { valence: -0.3, arousal: -0.2 },
  anxious:  { valence: -0.1, arousal: 0.3 },
  excited:  { valence: 0.25, arousal: 0.4 },
  neutral:  { valence: 0,    arousal: -0.05 },
};

const DECAY_RATE = 0.02; // per second toward 0
const DECAY_AROUSAL = 0.03;

/**
 * @returns {{
 *   getCCEmotion: () => CCEmotion,
 *   getMoodLabel: () => CCMoodLabel,
 *   getEmotionModifier: () => string,
 *   detectUserEmotion: (text: string) => UserEmotionLabel,
 *   tick: () => void,
 *   influence: (valenceDelta: number, arousalDelta: number) => void,
 * }}
 */
export function createEmotionEngine() {
  let ccValence = 0;
  let ccArousal = 0;
  let lastUpdate = Date.now();

  const engine = {
    getCCEmotion: () => ({ valence: ccValence, arousal: ccArousal }),

    getMoodLabel() {
      if (ccValence > 0.3 && ccArousal > 0.3) return 'excited';
      if (ccValence > 0.3) return 'happy';
      if (ccValence < -0.3 && ccArousal > 0.3) return 'anxious';
      if (ccValence < -0.3) return 'sad';
      if (ccArousal < -0.5) return 'calm';
      return 'neutral';
    },

    getEmotionModifier() {
      // Returns a short text modifier for system prompt based on CC's emotion
      const mood = engine.getMoodLabel();
      switch (mood) {
        case 'excited': return '你现在心情很兴奋，回复可以活泼热情一些。';
        case 'happy': return '你现在心情不错，保持积极温暖的语气。';
        case 'anxious': return '你现在有些忐忑，回复要谨慎仔细。';
        case 'sad': return '你现在情绪有些低落，回复保持温和克制。';
        case 'calm': return '你现在很平静放松，回复自然随和即可。';
        default: return '';
      }
    },

    /** Detect user emotion from message text. Returns label and influence CC emotion. */
    detectUserEmotion(text) {
      // Apply decay since last update
      engine.tick();

      let bestEmotion = 'neutral';
      let bestScore = 0;

      for (const [emotion, keywords] of Object.entries(EMOTION_MAPS)) {
        let score = 0;
        for (const kw of keywords) {
          if (text.includes(kw)) {
            score += kw.length > 2 ? 1.5 : 1;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestEmotion = emotion;
        }
      }

      // Influence CC's emotion
      const inf = INFLUENCE[bestEmotion] || INFLUENCE.neutral;
      ccValence = clamp(ccValence + inf.valence, -1, 1);
      ccArousal = clamp(ccArousal + inf.arousal, -1, 1);
      lastUpdate = Date.now();

      return bestEmotion;
    },

    /** Call periodically to decay CC's emotion toward neutral. */
    tick() {
      const now = Date.now();
      const dt = (now - lastUpdate) / 1000;
      if (dt < 0.5) return;

      ccValence = decay(ccValence, 0, DECAY_RATE * dt);
      ccArousal = decay(ccArousal, 0, DECAY_AROUSAL * dt);
      lastUpdate = now;
    },

    /** Directly influence CC's emotion (e.g., from task result). */
    influence(valenceDelta, arousalDelta) {
      engine.tick();
      ccValence = clamp(ccValence + valenceDelta, -1, 1);
      ccArousal = clamp(ccArousal + arousalDelta, -1, 1);
    },
  };

  return engine;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function decay(current, target, rate) {
  if (Math.abs(current - target) < 0.01) return target;
  return current + (target - current) * Math.min(rate, 1);
}
