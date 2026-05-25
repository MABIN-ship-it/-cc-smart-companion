/**
 * Expression Engine — state machine for CC's 3D character animations.
 * Pure logic, no rendering. Outputs animation parameters each frame.
 */

/**
 * @typedef {'idle'|'listening'|'thinking'|'speaking'|'happy'|'dozing'|'waking'} ExpressionState
 * @typedef {{
 *   breathPhase: number,
 *   blinkIntensity: number,
 *   particleSpeed: number,
 *   glowIntensity: number,
 *   headTilt: number,
 *   headLookUp: number,
 *   eyeScale: number,
 *   mouthOpen: number,
 *   bodyBounce: number,
 *   colorShift: number,
 *   armSwing: number,
 * }} AnimationParams
 */

const STATES = {
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  HAPPY: 'happy',
  DOZING: 'dozing',
  WAKING: 'waking',
};

const DOZE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const SPEAK_DURATION = 3000;        // speak state lasts 3s
const HAPPY_DURATION = 5000;        // happy state lasts 5s
const WAKE_DURATION = 2000;         // waking state lasts 2s

/**
 * @returns {{
 *   getState: () => ExpressionState,
 *   getStateElapsed: () => number,
 *   onUserActivity: () => void,
 *   onInputFocus: () => void,
 *   onInputBlur: () => void,
 *   onUserTyping: () => void,
 *   onMessageSent: () => void,
 *   onResponseReceived: () => void,
 *   onProcessingComplete: () => void,
 *   onHappy: () => void,
 *   onStop: () => void,
 *   tick: (dt: number) => AnimationParams,
 * }}
 */
export function createExpressionEngine() {
  let currentState = STATES.IDLE;
  let stateEnteredAt = Date.now();
  let lastActivityAt = Date.now();
  let blinkTimer = 0;
  let blinkDuration = 0;
  let isBlinking = false;
  let mouthAnimTimer = 0;
  let breathTimer = Math.random() * Math.PI * 2;
  let particleBaseSpeed = 1;
  let particleTargetSpeed = 1;

  const engine = {
    getState: () => currentState,
    getStateElapsed: () => Date.now() - stateEnteredAt,

    onUserActivity() {
      lastActivityAt = Date.now();
      if (currentState === STATES.DOZING || currentState === STATES.WAKING) {
        return; // waking handles itself
      }
    },

    onInputFocus() {
      if (currentState !== STATES.THINKING && currentState !== STATES.SPEAKING) {
        transitionTo(STATES.LISTENING);
      }
      lastActivityAt = Date.now();
    },

    onInputBlur() {
      if (currentState === STATES.LISTENING) {
        transitionTo(STATES.IDLE);
      }
    },

    onUserTyping() {
      if (currentState !== STATES.THINKING && currentState !== STATES.SPEAKING
          && currentState !== STATES.DOZING && currentState !== STATES.WAKING) {
        transitionTo(STATES.LISTENING);
      }
      lastActivityAt = Date.now();
    },

    onMessageSent() {
      transitionTo(STATES.THINKING);
      lastActivityAt = Date.now();
    },

    onResponseReceived() {
      transitionTo(STATES.SPEAKING);
      lastActivityAt = Date.now();
    },

    onProcessingComplete() {
      if (currentState === STATES.THINKING) {
        transitionTo(STATES.SPEAKING);
      }
    },

    onHappy() {
      if (currentState !== STATES.DOZING && currentState !== STATES.WAKING
          && currentState !== STATES.THINKING) {
        transitionTo(STATES.HAPPY);
      }
    },

    onStop() {
      if (currentState === STATES.THINKING || currentState === STATES.SPEAKING) {
        transitionTo(STATES.IDLE);
      }
    },

    /** Call each animation frame. Returns animation params. */
    tick(dt) {
      const elapsed = Date.now() - stateEnteredAt;
      const inactiveTime = Date.now() - lastActivityAt;

      // Auto-transitions
      if (currentState === STATES.SPEAKING && elapsed > SPEAK_DURATION) {
        transitionTo(STATES.IDLE);
      }
      if (currentState === STATES.HAPPY && elapsed > HAPPY_DURATION) {
        transitionTo(STATES.IDLE);
      }
      if (currentState === STATES.WAKING && elapsed > WAKE_DURATION) {
        transitionTo(STATES.IDLE);
      }
      if (currentState !== STATES.DOZING && currentState !== STATES.WAKING
          && inactiveTime > DOZE_TIMEOUT) {
        transitionTo(STATES.DOZING);
      }
      if (currentState === STATES.DOZING && inactiveTime < 1000) {
        transitionTo(STATES.WAKING);
      }

      // Blink logic (every 2-5 seconds, 100-200ms duration)
      blinkTimer += dt;
      if (!isBlinking) {
        const nextBlink = 2 + Math.random() * 3;
        if (blinkTimer > nextBlink) {
          isBlinking = true;
          blinkTimer = 0;
          blinkDuration = 0.1 + Math.random() * 0.15;
        }
      } else {
        if (blinkTimer > blinkDuration) {
          isBlinking = false;
          blinkTimer = 0;
        }
      }

      // Breath timer
      breathTimer += dt * 0.8;
      if (currentState === STATES.DOZING) breathTimer += dt * 0.1; // slower breathing

      // Mouth animation for speaking
      if (currentState === STATES.SPEAKING) {
        mouthAnimTimer += dt * 6;
      } else {
        mouthAnimTimer = 0;
      }

      // Smooth particle speed transition
      particleTargetSpeed = getParticleSpeedTarget(currentState);
      particleBaseSpeed += (particleTargetSpeed - particleBaseSpeed) * Math.min(dt * 2, 1);

      return buildParams(currentState);
    },
  };

  function transitionTo(state) {
    if (currentState === state) return;
    currentState = state;
    stateEnteredAt = Date.now();
    breathTimer = Math.random() * Math.PI * 2;
  }

  function getParticleSpeedTarget(state) {
    switch (state) {
      case STATES.THINKING: return 3;
      case STATES.DOZING: return 0.3;
      case STATES.HAPPY: return 2;
      case STATES.WAKING: return 2.5;
      default: return 1;
    }
  }

  function buildParams(state) {
    const elapsed = Date.now() - stateEnteredAt;
    const breath = Math.sin(breathTimer) * 0.5 + 0.5; // 0-1 smooth
    const blink = isBlinking
      ? (blinkTimer / blinkDuration < 0.5
          ? blinkTimer / blinkDuration * 2
          : (1 - (blinkTimer - blinkDuration / 2) / (blinkDuration / 2)) * 2)
      : 0;

    const base = {
      breathPhase: breath,
      blinkIntensity: blink,
      particleSpeed: particleBaseSpeed,
      glowIntensity: 0.8,
      headTilt: 0,
      headLookUp: 0,
      eyeScale: 1,
      mouthOpen: 0,
      bodyBounce: 0,
      colorShift: 0,
      armSwing: 0,
    };

    switch (state) {
      case STATES.IDLE:
        base.glowIntensity = 0.7 + breath * 0.2;
        break;

      case STATES.LISTENING:
        base.headTilt = 0.08;
        base.eyeScale = 1.1;
        base.glowIntensity = 0.9;
        break;

      case STATES.THINKING:
        base.headLookUp = 0.25;
        base.glowIntensity = 1.0 + Math.sin(elapsed * 0.003) * 0.3;
        base.eyeScale = 0.85;
        break;

      case STATES.SPEAKING: {
        const mouthCycle = (Math.sin(mouthAnimTimer) + 1) / 2;
        base.mouthOpen = mouthCycle * 0.6;
        base.bodyBounce = Math.abs(Math.sin(mouthAnimTimer * 0.5)) * 0.03;
        base.headTilt = Math.sin(mouthAnimTimer * 0.3) * 0.05;
        base.glowIntensity = 1.0;
        break;
      }

      case STATES.HAPPY:
        base.colorShift = 1;
        base.glowIntensity = 1.3;
        base.bodyBounce = Math.abs(Math.sin(elapsed * 0.005)) * 0.05;
        base.eyeScale = 1.15;
        break;

      case STATES.DOZING:
        base.glowIntensity = 0.3 + breath * 0.15;
        base.headTilt = -0.1;
        base.headLookUp = -0.15;
        base.eyeScale = 0.05; // nearly closed
        break;

      case STATES.WAKING: {
        const t = Math.min(elapsed / WAKE_DURATION, 1);
        const stretch = Math.sin(t * Math.PI);
        base.bodyBounce = stretch * 0.06;
        base.eyeScale = 0.2 + t * 0.8;
        base.glowIntensity = 0.5 + t * 0.5;
        base.colorShift = stretch * 0.5;
        break;
      }
    }

    return base;
  }

  return engine;
}
