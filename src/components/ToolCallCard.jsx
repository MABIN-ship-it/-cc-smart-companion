import { useState } from 'react';

const TOOL_ICONS = {
  web_search: '🔍',
  fetch_url: '🌐',
  github_search: '🐙',
  execute_shell: '⚡',
  read_file: '📖',
  write_file: '✏️',
  list_dir: '📂',
  delete_file: '🗑',
  visit_my_site: '🏠',
  download_file: '📥',
};

const TOOL_LABELS = {
  web_search: '搜索网页',
  fetch_url: '抓取网页',
  github_search: '搜索GitHub',
  execute_shell: '执行命令',
  read_file: '读取文件',
  write_file: '写入文件',
  list_dir: '列出目录',
  delete_file: '删除文件',
  visit_my_site: '访问网站',
  download_file: '下载文件',
};

export default function ToolCallCard({ toolCall, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const icon = TOOL_ICONS[toolCall.name] || '🔧';
  const label = TOOL_LABELS[toolCall.name] || toolCall.name;

  const inputStr = typeof toolCall.input === 'string'
    ? toolCall.input
    : JSON.stringify(toolCall.input, null, 2);

  const displayInput = inputStr.length > 80 ? inputStr.slice(0, 80) + '...' : inputStr;
  const isRunning = toolCall.status === 'running';
  const isDone = toolCall.status === 'done';
  const isError = toolCall.status === 'error';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 12,
      border: `1px solid ${
        isRunning ? 'rgba(124,58,237,0.3)' :
        isError ? 'rgba(248,113,113,0.3)' :
        'rgba(255,255,255,0.08)'
      }`,
      marginBottom: 6,
      overflow: 'hidden',
      animation: 'fadeIn 0.3s ease-out',
    }}>
      {/* Header */}
      <div
        onClick={() => isDone && setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          cursor: isDone ? 'pointer' : 'default',
        }}>
        <span style={{ fontSize: 16 }}>{isRunning ? '⏳' : isError ? '❌' : icon}</span>
        <span style={{
          fontSize: 13, color: '#d0cce0', fontWeight: 500,
          flex: 1,
        }}>
          {label}
        </span>
        <span style={{ fontSize: 11, color: '#6b6b8a', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isRunning ? '执行中...' : displayInput}
        </span>
        {isRunning && (
          <div style={{ display: 'flex', gap: 3 }}>
            <div style={{ width: 5, height: 5, borderRadius: 3, background: '#7c3aed', animation: 'pulse 0.6s infinite' }}/>
            <div style={{ width: 5, height: 5, borderRadius: 3, background: '#a78bfa', animation: 'pulse 0.6s 0.2s infinite' }}/>
            <div style={{ width: 5, height: 5, borderRadius: 3, background: '#c4b5fd', animation: 'pulse 0.6s 0.4s infinite' }}/>
          </div>
        )}
        {isDone && (
          <span style={{ fontSize: 10, color: '#6b6b8a' }}>
            {expanded ? '▲' : '▼'}
          </span>
        )}
      </div>

      {/* Expanded details */}
      {expanded && isDone && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          padding: '10px 14px',
          fontSize: 12,
        }}>
          <div style={{ color: '#8b8baa', marginBottom: 8 }}>
            <strong>输入:</strong>
            <pre style={{
              margin: '4px 0 0', padding: '8px 10px',
              background: 'rgba(0,0,0,0.3)', borderRadius: 6,
              color: '#a78bfa', fontSize: 11,
              overflow: 'auto', maxHeight: 100,
            }}>
              {inputStr}
            </pre>
          </div>
          <div style={{ color: '#8b8baa' }}>
            <strong>结果:</strong>
            <pre style={{
              margin: '4px 0 0', padding: '8px 10px',
              background: 'rgba(0,0,0,0.3)', borderRadius: 6,
              color: isError ? '#f87171' : '#06d6a0', fontSize: 11,
              overflow: 'auto', maxHeight: 200,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {toolCall.result?.slice(0, 2000) || '(无输出)'}
            </pre>
          </div>
          {toolCall.duration > 0 && (
            <div style={{ color: '#555', marginTop: 4, fontSize: 10 }}>
              耗时: {toolCall.duration}ms
            </div>
          )}
        </div>
      )}

      {isError && (
        <div style={{
          padding: '6px 14px 10px',
          fontSize: 12, color: '#f87171',
        }}>
          {toolCall.result}
        </div>
      )}
    </div>
  );
}
