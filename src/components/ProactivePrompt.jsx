/**
 * 主动询问弹窗 — CC检测到任务后弹窗询问用户
 */
import { useApp } from '../store/AppContext';

const CAPABILITY_LABELS = {
  create_doc: '创建飞书文档并生成初稿',
  update_base: '更新多维表格数据',
  search_info: '搜索相关信息',
  send_notification: '发送通知到飞书群',
  summarize: '总结消息内容',
};

export default function ProactivePrompt() {
  const { state, dispatch } = useApp();
  const prompts = state.proactivePrompts || [];

  if (prompts.length === 0) return null;

  const prompt = prompts[0]; // 一次显示一个

  const handleAccept = () => {
    // 生成给CC的指令文本
    const capDesc = prompt.capabilities.map(c => CAPABILITY_LABELS[c] || c).join('、');
    const instruction = `用户已确认。任务：${prompt.description}。请${capDesc}。`;
    dispatch({ type: 'DISMISS_PROACTIVE_PROMPT', payload: prompt.id });
    // 回调由 ChatInterface 处理
    if (prompt.onAccept) prompt.onAccept(instruction);
  };

  const handleDismiss = () => {
    dispatch({ type: 'DISMISS_PROACTIVE_PROMPT', payload: prompt.id });
    if (prompt.onDismiss) prompt.onDismiss();
  };

  return (
    <div className="proactive-prompt-overlay">
      <div className="proactive-prompt">
        <div className="proactive-prompt-header">
          <span className="proactive-prompt-icon">🔔</span>
          <span>CC 主动提醒</span>
        </div>
        <div className="proactive-prompt-body">
          <p className="proactive-prompt-desc">
            我注意到 <strong>{prompt.senderName}</strong>{prompt.chatName ? `在"${prompt.chatName}"中` : ''}提到了：
          </p>
          <p className="proactive-prompt-task">"{prompt.description}"</p>
          {prompt.capabilities?.length > 0 && (
            <div className="proactive-prompt-caps">
              <p>我可以帮你：</p>
              <ul>
                {prompt.capabilities.map(cap => (
                  <li key={cap}>✅ {CAPABILITY_LABELS[cap] || cap}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="proactive-prompt-ask">需要我帮你做吗？</p>
        </div>
        <div className="proactive-prompt-actions">
          <button className="proactive-prompt-btn primary" onClick={handleAccept}>好，开始搞</button>
          <button className="proactive-prompt-btn secondary" onClick={handleDismiss}>先不管</button>
        </div>
      </div>
    </div>
  );
}
