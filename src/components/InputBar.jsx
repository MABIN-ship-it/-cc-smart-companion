import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../store/AppContext';

const MODES = [
  { id: 'plan', label: '计划', hint: '制定方案',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>
  },
  { id: 'execute', label: '执行', hint: '执行任务',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
  },
  { id: 'cron', label: '定时', hint: '定时任务',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  },
];

export default function InputBar({
  input, onInputChange, onSend, onStop, onVoiceToggle,
  listening, isProcessing, transcribing, onFocus, onBlur, inputRef, onFileUpload,
  pendingImages, onImagePaste, onRemoveImage,
  pendingFiles, onRemoveFile,
}) {
  const { state, dispatch } = useApp();
  const currentMode = state.inputMode || 'execute';

  const handleModeClick = (modeId) => {
    if (currentMode === modeId) {
      dispatch({ type: 'SET_INPUT_MODE', payload: 'chat' });
    } else {
      dispatch({ type: 'SET_INPUT_MODE', payload: modeId });
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = () => {
          onImagePaste?.(reader.result);
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  };

  return (
    <div className="input-bar-wrap">
      {/* 模式切换 */}
      <div className="input-mode-tabs">
        {MODES.map(m => (
          <button
            key={m.id}
            className={`input-mode-tab ${currentMode === m.id ? 'active' : ''}`}
            onClick={() => handleModeClick(m.id)}
            title={m.hint}
          >
            <span className="mode-icon">{typeof m.icon === 'string' ? m.icon : m.icon}</span>
            <span className="mode-label">{m.label}</span>
          </button>
        ))}
      </div>

      {/* 图片预览 */}
      {pendingImages && pendingImages.length > 0 && (
        <div className="input-image-previews">
          {pendingImages.map((img, i) => (
            <div key={i} className="input-image-preview">
              <img src={img} alt={`粘贴图片 ${i + 1}`} />
              <button
                className="input-image-remove"
                onClick={() => onRemoveImage?.(i)}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* 文件预览 */}
      {pendingFiles && pendingFiles.length > 0 && (
        <div className="input-file-chips">
          {pendingFiles.map((f, i) => (
            <div key={i} className="input-file-chip">
              <span className="input-file-chip-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </span>
              <span className="input-file-chip-name">{f.name}</span>
              <button className="input-file-chip-remove" onClick={() => onRemoveFile?.(i)}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* 输入区域 */}
      <div className="input-row">
        <button
          onClick={onVoiceToggle}
          className={`input-voice-btn ${listening ? 'listening' : ''}`}
          title={listening ? '点击停止录音' : '点击开始录音'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </button>

        <input
          ref={inputRef}
          value={input}
          onChange={onInputChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onPaste={handlePaste}
          readOnly={transcribing}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !transcribing) { e.preventDefault(); onSend(); }
          }}
          placeholder={
            transcribing ? '🎙️ 识别中...' :
            listening ? '🎙️ 正在录音... 再次点击停止' :
            currentMode === 'plan' ? '描述你的目标，CC帮你制定计划...' :
            currentMode === 'execute' ? '输入要执行的操作...' :
            currentMode === 'cron' ? '定时任务功能即将上线...' :
            '给CC发消息... (Enter发送)'
          }
          className={`input-field ${transcribing ? 'transcribing' : ''}`}
        />

        <button
          onClick={onFileUpload}
          className="input-plus-btn"
          title="上传文件到知识库"
          disabled={!onFileUpload}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>

        {isProcessing ? (
          <button onClick={onStop} className="input-stop-btn" title="停止生成">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!input.trim() || transcribing}
            className={`input-send-btn ${input.trim() && !transcribing ? 'active' : ''}`}
            title="发送消息"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
