import { useState } from 'react';
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

  return (
    <div className="app-root">
      {onboardingDone && (
        <div className="avatar-library-btn-wrap">
          <button
            className="tool-icon-btn"
            onClick={() => setShowAvatarLibrary(true)}
            aria-label="形象库"
          >
            <div className="tool-icon-svg"><AvatarIcon /></div>
            <span className="tool-icon-tooltip">形象库</span>
          </button>
        </div>
      )}
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
