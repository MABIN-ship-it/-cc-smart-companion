import { Component } from 'react';

/**
 * React Error Boundary — 捕获子组件渲染错误，防止整页白屏。
 * 发生崩溃时显示友好的恢复界面，而非空白页。
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('CC ErrorBoundary 捕获到错误:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ error: null, errorInfo: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{
          width: '100vw', height: '100vh',
          background: 'linear-gradient(135deg, #0a0a0f, #1a1030)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: '"Microsoft YaHei", sans-serif',
          color: '#d0cce0', padding: 40,
        }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>⚠️</div>
          <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12, color: '#a78bfa' }}>
            CC遇到了一点意外
          </h1>
          <p style={{ fontSize: 14, color: '#888', marginBottom: 8, textAlign: 'center', maxWidth: 500 }}>
            {this.state.error?.message || '未知错误'}
          </p>
          {this.state.errorInfo && (
            <details style={{ marginBottom: 24, maxWidth: 600 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: '#666' }}>详细错误信息</summary>
              <pre style={{
                fontSize: 11, color: '#999', marginTop: 8,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: 200, overflow: 'auto',
              }}>
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: 16 }}>
            <button onClick={this.handleReset} style={{
              padding: '12px 28px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.05)', color: '#d0cce0', cursor: 'pointer',
              fontSize: 14, transition: 'all 0.2s',
            }}>
              返回
            </button>
            <button onClick={this.handleReload} style={{
              padding: '12px 28px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
              color: '#fff', fontSize: 14, transition: 'all 0.2s',
              boxShadow: '0 0 16px rgba(124,58,237,0.3)',
            }}>
              重新启动CC
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
