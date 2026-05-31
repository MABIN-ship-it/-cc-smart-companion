import { useState, useEffect } from 'react';
import { useApp } from './store/AppContext';
import OnboardingWizard from './components/OnboardingWizard';
import ChatInterface from './components/ChatInterface';
import ErrorBoundary from './components/ErrorBoundary';
import AvatarLibrary from './components/AvatarLibrary';
import { AvatarIcon } from './components/ToolIcon';

export default function App() {
  const { state } = useApp();
  const [showAvatarLibrary, setShowAvatarLibrary] = useState(false);

  const onboardingDone = (() => {
    try { return localStorage.getItem('cc_onboarding_done') === '1'; } catch { return false; }
  })();

  // 直接操作 DOM 注入按钮，绕过所有 React/CSS 层
  useEffect(() => {
    if (!onboardingDone) return;
    const btn = document.createElement('div');
    btn.className = 'tool-icon-btn avatar-fixed';
    btn.innerHTML = '<div class="tool-icon-svg"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="5"/><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg></div><span class="tool-icon-tooltip">形象库</span>';
    btn.onclick = () => setShowAvatarLibrary(true);
    document.body.appendChild(btn);
    return () => { try { document.body.removeChild(btn); } catch {} };
  }, [onboardingDone]);

  return (
    <div className="app-root">
      <ErrorBoundary>
        {!onboardingDone ? <OnboardingWizard /> : <ChatInterface />}
      </ErrorBoundary>
      {onboardingDone && showAvatarLibrary && (
        <AvatarLibrary
          onClose={() => setShowAvatarLibrary(false)}
          onSwitchAvatar={(av) => {
            if (av.path) window.dispatchEvent(new CustomEvent('cc:switchModel', { detail: { path: av.path, name: av.name } }));
          }}
        />
      )}
    </div>
  );
}
