import { useState, useEffect } from 'react';

/**
 * Angel/Devil overlay — positioned over the 3D character scene.
 * Shows during decision-making with AI-generated dual perspectives.
 *
 * @param {{ angelText: string, devilText: string, visible: boolean }} props
 */
export default function AngelDevilOverlay({ angelText, devilText, visible }) {
  const [showBubbles, setShowBubbles] = useState(false);
  const [angelExpanded, setAngelExpanded] = useState(false);
  const [devilExpanded, setDevilExpanded] = useState(false);

  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => setShowBubbles(true), 300);
      return () => clearTimeout(t);
    } else {
      setShowBubbles(false);
      setAngelExpanded(false);
      setDevilExpanded(false);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="angel-devil-overlay">
      {/* Angel — left side, blue-white */}
      <div className={`ad-cluster ad-angel ${showBubbles ? 'ad-active' : ''}`}>
        <div className="ad-orb angel-orb">
          <div className="ad-orb-core" />
          <div className="ad-orb-ring" />
        </div>
        <div className="ad-particles">
          <span className="ad-particle" />
          <span className="ad-particle" />
          <span className="ad-particle" />
        </div>
        {angelText && (
          <div
            className={`ad-bubble angel-bubble ${angelExpanded ? 'ad-expanded' : ''}`}
            onClick={() => setAngelExpanded(!angelExpanded)}
          >
            <div className="ad-bubble-label">😇 天使视角</div>
            <div className="ad-bubble-text">
              {angelExpanded ? angelText : (angelText.length > 80 ? angelText.slice(0, 80) + '...' : angelText)}
            </div>
            {angelText.length > 80 && (
              <div className="ad-bubble-hint">{angelExpanded ? '点击收起' : '点击展开'}</div>
            )}
          </div>
        )}
      </div>

      {/* Devil — right side, warm orange */}
      <div className={`ad-cluster ad-devil ${showBubbles ? 'ad-active' : ''}`}>
        <div className="ad-orb devil-orb">
          <div className="ad-orb-core" />
          <div className="ad-orb-ring" />
        </div>
        <div className="ad-particles">
          <span className="ad-particle" />
          <span className="ad-particle" />
          <span className="ad-particle" />
        </div>
        {devilText && (
          <div
            className={`ad-bubble devil-bubble ${devilExpanded ? 'ad-expanded' : ''}`}
            onClick={() => setDevilExpanded(!devilExpanded)}
          >
            <div className="ad-bubble-label">😈 恶魔视角</div>
            <div className="ad-bubble-text">
              {devilExpanded ? devilText : (devilText.length > 80 ? devilText.slice(0, 80) + '...' : devilText)}
            </div>
            {devilText.length > 80 && (
              <div className="ad-bubble-hint">{devilExpanded ? '点击收起' : '点击展开'}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
