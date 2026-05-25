import { useApp } from './store/AppContext';
import OnboardingWizard from './components/OnboardingWizard';
import ChatInterface from './components/ChatInterface';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const { state } = useApp();

  const onboardingDone = (() => {
    try { return localStorage.getItem('cc_onboarding_done') === '1'; } catch { return false; }
  })();

  return (
    <div className="app-root">
      <ErrorBoundary>
        {!onboardingDone ? <OnboardingWizard /> : <ChatInterface />}
      </ErrorBoundary>
    </div>
  );
}
