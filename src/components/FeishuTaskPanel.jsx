/**
 * 飞书任务面板 — 展示 CC 检测到的飞书任务
 *
 * 从 AppContext 的 proactivePrompts 读取任务列表，
 * 支持按优先级分组展示、一键接受/忽略、执行进度跟踪。
 */
import { useState } from 'react';
import { useApp } from '../store/AppContext';

const PRIORITY_CONFIG = {
  high: { label: '高优先', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
  medium: { label: '中优先', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  low: { label: '低优先', color: '#22c55e', bg: 'rgba(34,197,94,0.08)' },
};

const ACTION_LABELS = {
  create_report: '生成报告',
  create_doc: '创建文档',
  fill_base: '填写表格',
  approve: '处理审批',
  reply: '回复消息',
  remind: '提醒我',
  ignore: '忽略',
};

export default function FeishuTaskPanel() {
  const { state, dispatch } = useApp();
  const [executing, setExecuting] = useState({});
  const [message, setMessage] = useState('');

  const tasks = state.proactivePrompts || [];
  const pendingTasks = tasks.filter(t => t.status !== 'dismissed');
  const newTasks = pendingTasks.filter(t => t.status === 'new');
  const acceptedTasks = pendingTasks.filter(t => t.status === 'accepted');

  // 按优先级分组
  const grouped = { high: [], medium: [], low: [] };
  for (const t of pendingTasks) {
    const p = t.priority || 'medium';
    if (grouped[p]) grouped[p].push(t);
    else grouped.medium.push(t);
  }

  const handleAccept = async (task) => {
    setExecuting(prev => ({ ...prev, [task.id]: true }));
    dispatch({ type: 'ACCEPT_PROACTIVE_TASK', payload: task.id });

    const instruction = task.suggestedAction === 'create_report'
      ? `请根据飞书任务信息生成一份报告：${task.description}。标题：${task.title}。先搜索相关资料再起草。`
      : task.suggestedAction === 'approve'
        ? `请帮我分析审批"${task.title}"，给出建议`
        : `请帮我处理这个任务：${task.title}。详情：${task.description}。来源：${task.sourceName}`;

    if (task.onAccept) {
      task.onAccept(instruction);
    } else {
      setMessage(`已开始处理: ${task.title}`);
    }
    setTimeout(() => setExecuting(prev => ({ ...prev, [task.id]: false })), 3000);
  };

  const handleDismiss = (task) => {
    dispatch({ type: 'DISMISS_PROACTIVE_PROMPT', payload: task.id });
    if (task.onDismiss) task.onDismiss();
  };

  if (pendingTasks.length === 0) return null;

  return (
    <div className="feishu-task-panel">
      <div className="feishu-task-header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
          <rect x="9" y="3" width="6" height="4" rx="1"/>
          <path d="M9 14l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="feishu-task-title">
          飞书任务
          {newTasks.length > 0 && (
            <span className="feishu-task-badge">{newTasks.length} 项新任务</span>
          )}
        </span>
      </div>

      {message && (
        <div className="feishu-task-message">{message}</div>
      )}

      {['high', 'medium', 'low'].map(priority => {
        const groupTasks = grouped[priority];
        if (groupTasks.length === 0) return null;
        const config = PRIORITY_CONFIG[priority];

        return (
          <div key={priority} className="feishu-task-group">
            <div className="feishu-task-priority" style={{ color: config.color }}>
              <span className="feishu-priority-dot" style={{ background: config.color }} />
              {config.label} ({groupTasks.length})
            </div>
            {groupTasks.map(task => (
              <div
                key={task.id}
                className={`feishu-task-item ${task.status === 'accepted' ? 'accepted' : ''}`}
                style={{ borderLeftColor: config.color }}
              >
                <div className="feishu-task-item-header">
                  <span className="feishu-task-item-title">{task.title}</span>
                  {task.deadline && task.deadline !== '未明确' && (
                    <span className="feishu-task-deadline">截止: {task.deadline}</span>
                  )}
                </div>
                <div className="feishu-task-item-desc">{task.description?.slice(0, 100)}</div>
                <div className="feishu-task-item-meta">
                  <span className="feishu-task-source">
                    {task.sourceName || task.source || '飞书'}
                    {task.senderName ? ` · ${task.senderName}` : ''}
                  </span>
                  {task.suggestedAction && ACTION_LABELS[task.suggestedAction] && (
                    <span className="feishu-task-suggestion">
                      建议: {ACTION_LABELS[task.suggestedAction]}
                    </span>
                  )}
                </div>
                <div className="feishu-task-item-actions">
                  {task.status === 'accepted' ? (
                    <span className="feishu-task-executing">执行中...</span>
                  ) : (
                    <>
                      <button
                        className="feishu-task-btn accept"
                        onClick={() => handleAccept(task)}
                        disabled={executing[task.id]}
                      >
                        {executing[task.id] ? '处理中...' : '开始搞'}
                      </button>
                      <button
                        className="feishu-task-btn dismiss"
                        onClick={() => handleDismiss(task)}
                      >
                        忽略
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {acceptedTasks.length > 0 && (
        <div className="feishu-task-accepted">
          <div className="feishu-task-priority" style={{ color: '#22c55e' }}>
            <span className="feishu-priority-dot" style={{ background: '#22c55e' }} />
            执行中 ({acceptedTasks.length})
          </div>
          {acceptedTasks.map(task => (
            <div key={task.id} className="feishu-task-item accepted" style={{ borderLeftColor: '#22c55e' }}>
              <span className="feishu-task-item-title">{task.title}</span>
              <span className="feishu-task-executing">处理中...</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
