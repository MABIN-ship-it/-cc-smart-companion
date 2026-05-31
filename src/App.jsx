import { useState, useEffect } from 'react';
import { useApp } from './store/AppContext';
import OnboardingWizard from './components/OnboardingWizard';
import ChatInterface from './components/ChatInterface';
import ErrorBoundary from './components/ErrorBoundary';
import AvatarLibrary from './components/AvatarLibrary';

export default function App() {
  const { state } = useApp();
  const [showAvatarLibrary, setShowAvatarLibrary] = useState(false);

  const onboardingDone = (() => {
    try { return localStorage.getItem('cc_onboarding_done') === '1'; } catch { return false; }
  })();

  // 等 .toolbar-left 出现后，往里面注入形象库按钮
  useEffect(() => {
    if (!onboardingDone) return;
    const inject = () => {
      const toolbar = document.querySelector('.toolbar-left');
      if (!toolbar) return;
      // 检查是否已经注入过
      if (document.querySelector('.avatar-library-btn')) return;
      // 克隆工具条的按钮结构，插入到 spacer 前面
      const spacer = toolbar.querySelector('.toolbar-spacer');
      const btn = document.createElement('button');
      btn.className = 'tool-icon-btn avatar-library-btn';
      btn.setAttribute('aria-label', '形象库');
      btn.innerHTML = '<div class="tool-icon-svg"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg></div><span class="tool-icon-tooltip">形象库</span>';
      btn.onclick = () => setShowAvatarLibrary(true);
      if (spacer) { toolbar.insertBefore(btn, spacer); } else { toolbar.appendChild(btn); }
    };
    // 先试一次，再用 MutationObserver 等
    inject();
    const obs = new MutationObserver(() => inject());
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
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
