/**
 * Error Handler — categorizes errors and provides friendly Chinese messages.
 * Also handles network detection and auto-retry for transient errors.
 */

const ERROR_MESSAGES = {
  TimeoutError: '请求超时了，可能是网络不太好，请稍后重试',
  AbortError: '操作已取消',
  NetworkError: '网络连接失败，请检查网络后重试',
  RateLimit: '请求太频繁了，请稍等片刻再试',
  AuthError: 'API Key 无效或已过期，请重新设置',
  ServerError: 'AI服务暂时不可用，请稍后重试',
  Unknown: '出了点意外状况，请稍后重试',
};

let onlineListeners = [];
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

/** Initialize network status monitoring. */
export function initNetworkMonitor(onStatusChange) {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = () => {
    isOnline = true;
    onStatusChange?.('online');
  };
  const handleOffline = () => {
    isOnline = false;
    onStatusChange?.('offline');
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  onlineListeners.push(handleOnline, handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    onlineListeners = onlineListeners.filter(l => l !== handleOnline && l !== handleOffline);
  };
}

export function getOnlineStatus() {
  return isOnline;
}

/** Categorize an error and return a user-friendly Chinese message. */
/** @param {Error|null|undefined} err @returns {string} */
export function categorizeError(err) {
  if (!err) return ERROR_MESSAGES.Unknown;

  const msg = err.message || String(err);
  const name = err.name || '';

  if (name === 'TimeoutError' || msg.includes('timeout') || msg.includes('超时')) {
    return ERROR_MESSAGES.TimeoutError;
  }
  if (name === 'AbortError' || msg.includes('abort') || msg.includes('取消')) {
    return ERROR_MESSAGES.AbortError;
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch')) {
    return ERROR_MESSAGES.NetworkError;
  }
  if (msg.includes('429') || msg.includes('rate') || msg.includes('限流')) {
    return ERROR_MESSAGES.RateLimit;
  }
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('auth')) {
    return ERROR_MESSAGES.AuthError;
  }
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('server')) {
    return ERROR_MESSAGES.ServerError;
  }

  return `${ERROR_MESSAGES.Unknown}（${msg.slice(0, 60)}）`;
}

/** Determine if an error is retryable. */
/** @param {Error|null} err @returns {boolean} */
export function isRetryable(err) {
  if (!err) return false;
  const name = err.name || '';
  const msg = err.message || '';

  // Retryable: timeout, network, server errors
  if (name === 'TimeoutError') return true;
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return true;
  if (msg.includes('429') || msg.includes('500') || msg.includes('502') || msg.includes('503')) return true;

  // Not retryable: auth, abort
  if (name === 'AbortError') return false;
  if (msg.includes('401') || msg.includes('403')) return false;

  return false;
}

/**
 * Wrapper: auto-retry a fetch-like operation up to maxRetries times.
 * Only retries on transient errors.
 */
export async function withRetry(fn, { maxRetries = 2, delay = 2000, signal } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (err.name === 'AbortError') throw err;
      if (!isRetryable(err)) throw err;
      if (attempt === maxRetries) throw err;

      // Wait before retry
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, delay * (attempt + 1));
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        }
      });
    }
  }

  throw lastError;
}

/** Get a status icon for system messages. */
/** @param {string} errType @returns {string} */
export function getErrorIcon(errType) {
  const icons = {
    timeout: '⏱️',
    network: '🌐',
    auth: '🔑',
    rate: '⏳',
    server: '🔧',
    unknown: '⚠️',
  };
  return icons[errType] || icons.unknown;
}
