import { useState } from 'react';

/**
 * 计划模式方案卡片 — 渲染AI生成的结构化执行方案。
 * 每步可勾选，用户可输入补充想法，确认后切换到执行模式。
 */
export default function PlanCard({ content, onSwitchToExecute }) {
  const [checkedSteps, setCheckedSteps] = useState({});
  const [feedback, setFeedback] = useState('');

  const parsed = parsePlanContent(content);
  if (!parsed) {
    return (
      <div className="plan-card">
        <div className="plan-content markdown-body">{content}</div>
      </div>
    );
  }

  const { goal, overview, steps, risks, alternatives, complexity } = parsed;
  const checkedCount = steps.filter((s) => checkedSteps[s.id]).length;
  const hasFeedback = feedback.trim().length > 0;
  const canExecute = checkedCount > 0 || hasFeedback;

  const toggleStep = (id) => {
    setCheckedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleExecute = () => {
    onSwitchToExecute(feedback.trim());
  };

  return (
    <div className="plan-card">
      {/* Goal */}
      {goal && (
        <div className="plan-goal">
          <span className="plan-goal-icon">🎯</span>
          <span>{goal}</span>
        </div>
      )}
      {overview && <p className="plan-overview">{overview}</p>}

      {/* Steps */}
      {steps.length > 0 && (
        <div className="plan-steps">
          <h3 className="plan-section-title">📝 执行步骤（{steps.length}步）</h3>
          {steps.map((step) => {
            const isChecked = !!checkedSteps[step.id];
            return (
              <div
                key={step.id}
                className={`plan-step ${isChecked ? 'checked' : ''} ${step.type || ''}`}
                onClick={() => toggleStep(step.id)}
              >
                <div className="plan-step-checkbox">
                  {isChecked ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6c5ce7" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <div className="plan-step-circle" />
                  )}
                </div>
                <div className="plan-step-body">
                  <div className="plan-step-header">
                    <span className={`plan-step-badge ${step.type === 'thinking' ? 'badge-think' : 'badge-action'}`}>
                      {step.type === 'thinking' ? '🔍 分析' : '⚡ 执行'}
                    </span>
                    <span className="plan-step-title">{step.description}</span>
                  </div>
                  {step.detail && <p className="plan-step-detail">{step.detail}</p>}
                  <div className="plan-step-meta">
                    {step.files?.length > 0 && (
                      <span className="plan-step-files">📁 {step.files.join(', ')}</span>
                    )}
                    {step.tool && (
                      <span className="plan-step-tool">🔧 {step.tool}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Risks */}
      {risks?.length > 0 && (
        <div className="plan-risks">
          <h3 className="plan-section-title">⚠️ 风险提示</h3>
          <ul>
            {risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Alternatives */}
      {alternatives?.length > 0 && (
        <div className="plan-alternatives">
          <h3 className="plan-section-title">🔄 替代方案</h3>
          <ul>
            {alternatives.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}

      {/* Complexity */}
      {complexity && (
        <div className="plan-complexity">
          预估复杂度: <strong>{complexity}</strong>
        </div>
      )}

      {/* Feedback input */}
      <div className="plan-feedback">
        <label className="plan-feedback-label">💬 你还有什么想法？补充需求或调整建议：</label>
        <textarea
          className="plan-feedback-input"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="例如：换成Jekyll而不是Hugo、部署到Vercel而不是GitHub Pages..."
          rows={3}
        />
      </div>

      {/* Action bar */}
      <div className="plan-actions">
        <button
          className="plan-btn-execute"
          disabled={!canExecute}
          onClick={handleExecute}
          title={canExecute ? '确认方案，开始执行' : '请至少勾选一步，或在下方补充你的想法'}
        >
          {canExecute
            ? (checkedCount > 0 ? `✅ 确认并执行（已勾选${checkedCount}步）` : '✅ 确认并执行')
            : '请勾选步骤或补充你的想法'}
        </button>
        <p className="plan-hint">💡 勾选你想执行的步骤，或在下方补充想法后直接执行。</p>
      </div>
    </div>
  );
}

function parsePlanContent(text) {
  if (!text) return null;

  // Extract goal
  const goalMatch = text.match(/## 🎯 目标\s*\n\n(.+?)(?=\n##|\n---|$)/s);
  const overviewMatch = text.match(/🎯 目标\s*\n\n.+\n\n(.+?)(?=\n## 📝)/s);

  // Extract steps
  const stepsBlock = text.match(/## 📝 执行步骤[^\n]*\n([\s\S]*?)(?=\n## ⚠️|\n## 🔄|\n## 📊|\n---|$)/);
  const steps = [];
  if (stepsBlock) {
    const stepRegex = /### ([🔍⚡]) 步骤(\d+): (.+?)\n(?:> (.+?)\n)?(?:- 📁 涉及文件: (.+?)\n)?(?:- 🔧 工具: `(.+?)`\n)?/g;
    let match;
    while ((match = stepRegex.exec(stepsBlock[1])) !== null) {
      const icon = match[1];
      steps.push({
        id: parseInt(match[2]),
        type: icon === '⚡' ? 'action' : 'thinking',
        description: match[3]?.trim(),
        detail: match[4]?.trim(),
        files: match[5] ? match[5].split(', ').map(f => f.trim()) : [],
        tool: match[6]?.trim(),
      });
    }

    // Fallback: simpler step parsing when no steps matched
    if (steps.length === 0) {
      const simpleSteps = stepsBlock[1].split(/### /).filter(Boolean);
      simpleSteps.forEach((s, i) => {
        const lines = s.trim().split('\n');
        const header = lines[0] || '';
        const isThinking = header.includes('🔍');
        steps.push({
          id: i + 1,
          type: isThinking ? 'thinking' : 'action',
          description: header.replace(/[🔍⚡]\s*步骤\d+:\s*/, '').trim(),
          detail: lines.filter(l => l.startsWith('>')).map(l => l.slice(1).trim()).join('\n'),
          files: [],
          tool: '',
        });
      });
    }
  }

  // Extract risks
  const risksBlock = text.match(/## ⚠️ 风险提示\n([\s\S]*?)(?=\n##|\n---|$)/);
  const risks = risksBlock
    ? risksBlock[1].split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).trim())
    : [];

  // Extract alternatives
  const altBlock = text.match(/## 🔄 替代方案\n([\s\S]*?)(?=\n##|\n---|$)/);
  const alternatives = altBlock
    ? altBlock[1].split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).trim())
    : [];

  // Extract complexity
  const compMatch = text.match(/预估复杂度: (.+)/);
  const complexity = compMatch ? compMatch[1].trim() : null;

  if (!goalMatch && steps.length === 0) return null;

  return {
    goal: goalMatch ? goalMatch[1].trim() : '',
    overview: overviewMatch ? overviewMatch[1].trim() : '',
    steps,
    risks,
    alternatives,
    complexity,
  };
}
