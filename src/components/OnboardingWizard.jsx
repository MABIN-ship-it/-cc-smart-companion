import { useState, useEffect, useRef } from 'react';
import { useApp } from '../store/AppContext';

const STEPS = [
  {
    icon: '👋',
    title: '欢迎来到CC',
    desc: '我是CC，你的好朋友——陪你聊天、帮你干活、有记忆、有人格。',
    hint: '接下来的引导只需要1分钟',
  },
  {
    icon: '🔑',
    title: '配置API Key',
    desc: 'CC需要连接大模型来思考，请提供API Key。',
    hint: '可前往 platform.deepseek.com 获取',
    isApiKey: true,
  },
  {
    icon: '🎨',
    title: '你的偏好',
    desc: '告诉我你喜欢的交流风格，我会调整自己来匹配你。',
    hint: '以后随时可以调整',
    isPersonality: true,
  },
  {
    icon: '🛠️',
    title: '我能做什么',
    desc: '帮你上网搜索、搭建网站、生成PPT、写代码、管理文件',
    hint: '只要你开口，我来动手',
  },
  {
    icon: '🚀',
    title: '准备就绪',
    desc: '一切都设置好了。让我们开始这段友谊吧！',
    hint: '你说"帮我"开始试用我的工具能力',
  },
];

export default function OnboardingWizard() {
  const { state, dispatch } = useApp();
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState(state.apiKey || '');
  const [personality, setPersonality] = useState({ ...state.personality });
  const [slideIn, setSlideIn] = useState(true);
  const [slideDir, setSlideDir] = useState(1); // 1=forward, -1=backward
  const [keyError, setKeyError] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setSlideIn(true);
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [step]);

  const goNext = () => {
    if (step === 1 && !apiKey.trim()) {
      setKeyError(true);
      return;
    }
    setKeyError(false);
    if (step >= STEPS.length - 1) return finish();
    setSlideDir(1);
    setSlideIn(false);
    setTimeout(() => {
      setStep(s => s + 1);
      setSlideIn(true);
    }, 200);
  };

  const goBack = () => {
    if (step === 0) return;
    setSlideDir(-1);
    setSlideIn(false);
    setTimeout(() => {
      setStep(s => s - 1);
      setSlideIn(true);
    }, 200);
  };

  const finish = () => {
    // Save settings
    if (apiKey.trim()) {
      dispatch({ type: 'SET_API_KEY', payload: apiKey.trim() });
    }
    if (JSON.stringify(personality) !== JSON.stringify(state.personality)) {
      dispatch({ type: 'UPDATE_PERSONALITY', payload: personality });
    }
    // Mark onboarding done
    try { localStorage.setItem('cc_onboarding_done', '1'); } catch {}
    dispatch({ type: 'SET_STAGE', payload: 'chat' });
  };

  const skip = () => {
    try { localStorage.setItem('cc_onboarding_done', '1'); } catch {}
    dispatch({ type: 'SET_STAGE', payload: 'chat' });
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="onboarding-overlay">
      <div className={`onboarding-card ${slideIn ? 'onboard-slide-in' : 'onboard-slide-out'} onboard-slide-${slideDir === 1 ? 'fwd' : 'back'}`}>
        {/* Progress dots */}
        <div className="onboard-progress">
          {STEPS.map((_, i) => (
            <div key={i} className={`onboard-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />
          ))}
        </div>

        {/* Icon */}
        <div className="onboard-icon-wrap">
          <div className="onboard-icon">{current.icon}</div>
        </div>

        {/* Title */}
        <h2 className="onboard-title">{current.title}</h2>
        <p className="onboard-desc">{current.desc}</p>

        {/* Step-specific content */}
        {current.isApiKey && (
          <div className="onboard-input-wrap">
            <input
              ref={inputRef}
              className={`onboard-input${keyError ? ' onboard-input-error' : ''}`}
              type="password"
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setKeyError(false); }}
              onKeyDown={e => e.key === 'Enter' && goNext()}
              placeholder="输入你的 DeepSeek API Key..."
            />
            {keyError && <p className="onboard-error-msg">请先填写API Key，这是CC正常运行的必要条件。</p>}
            <p className="onboard-hint">Key仅保存在本地，不会上传到任何服务器</p>
          </div>
        )}

        {current.isPersonality && (
          <div className="onboard-personality">
            <div className="personality-row">
              <span>热情</span>
              <input type="range" min="0" max="1" step="0.1" value={personality.warmth}
                onChange={e => setPersonality(p => ({ ...p, warmth: +e.target.value }))} />
              <span>冷静</span>
            </div>
            <div className="personality-row">
              <span>严肃</span>
              <input type="range" min="0" max="1" step="0.1" value={personality.humor}
                onChange={e => setPersonality(p => ({ ...p, humor: +e.target.value }))} />
              <span>活泼</span>
            </div>
            <div className="personality-row">
              <span>被动</span>
              <input type="range" min="0" max="1" step="0.1" value={personality.proactive}
                onChange={e => setPersonality(p => ({ ...p, proactive: +e.target.value }))} />
              <span>主动</span>
            </div>
            <div className="personality-row">
              <span>啰嗦</span>
              <input type="range" min="0" max="1" step="0.1" value={personality.concise}
                onChange={e => setPersonality(p => ({ ...p, concise: +e.target.value }))} />
              <span>简洁</span>
            </div>
          </div>
        )}

        {/* Hint */}
        <p className="onboard-hint">{current.hint}</p>

        {/* Buttons */}
        <div className="onboard-buttons">
          {step > 0 ? (
            <button className="onboard-btn secondary" onClick={goBack}>上一步</button>
          ) : <div />}
          <button className="onboard-btn primary" onClick={goNext}>
            {isLast ? '开始使用' : '下一步'}
          </button>
        </div>

        {/* Skip */}
        <button className="onboard-skip" onClick={skip}>跳过引导，直接开始</button>
      </div>
    </div>
  );
}
