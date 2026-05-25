import { describe, it, expect } from 'vitest';
import { categorizeError, isRetryable, getErrorIcon } from '../errorHandler';

describe('categorizeError', () => {
  it('空错误返回 Unknown', () => {
    expect(categorizeError(null)).toContain('意外');
    expect(categorizeError(undefined)).toContain('意外');
  });

  it('TimeoutError', () => {
    const err = new Error('timeout');
    err.name = 'TimeoutError';
    expect(categorizeError(err)).toContain('超时');
  });

  it('消息中包含 timeout', () => {
    expect(categorizeError(new Error('connection timeout'))).toContain('超时');
  });

  it('AbortError', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(categorizeError(err)).toContain('取消');
  });

  it('网络错误', () => {
    expect(categorizeError(new Error('Failed to fetch'))).toContain('网络');
  });

  it('429 限流', () => {
    expect(categorizeError(new Error('429 Too Many Requests'))).toContain('频繁');
  });

  it('包含 rate 关键词', () => {
    expect(categorizeError(new Error('rate limit exceeded'))).toContain('频繁');
  });

  it('401 认证错误', () => {
    expect(categorizeError(new Error('401 Unauthorized'))).toContain('API Key');
  });

  it('403 认证错误', () => {
    expect(categorizeError(new Error('403 Forbidden'))).toContain('API Key');
  });

  it('500 服务器错误', () => {
    expect(categorizeError(new Error('500 Internal Server Error'))).toContain('不可用');
  });

  it('502/503 服务器错误', () => {
    expect(categorizeError(new Error('502 Bad Gateway'))).toContain('不可用');
    expect(categorizeError(new Error('503 Service Unavailable'))).toContain('不可用');
  });

  it('未知错误附带原始消息片段', () => {
    const msg = categorizeError(new Error('something weird happened'));
    expect(msg).toContain('意外');
    expect(msg).toContain('something weird happened');
  });
});

describe('isRetryable', () => {
  it('TimeoutError 可重试', () => {
    const err = new Error('timeout');
    err.name = 'TimeoutError';
    expect(isRetryable(err)).toBe(true);
  });

  it('网络错误可重试', () => {
    expect(isRetryable(new Error('Failed to fetch'))).toBe(true);
  });

  it('429 可重试', () => {
    expect(isRetryable(new Error('429'))).toBe(true);
  });

  it('500 可重试', () => {
    expect(isRetryable(new Error('500'))).toBe(true);
  });

  it('401 不可重试', () => {
    expect(isRetryable(new Error('401'))).toBe(false);
  });

  it('403 不可重试', () => {
    expect(isRetryable(new Error('403'))).toBe(false);
  });

  it('AbortError 不可重试', () => {
    const err = new Error('abort');
    err.name = 'AbortError';
    expect(isRetryable(err)).toBe(false);
  });

  it('null 不可重试', () => {
    expect(isRetryable(null)).toBe(false);
  });
});

describe('getErrorIcon', () => {
  it('返回对应图标', () => {
    expect(getErrorIcon('timeout')).toBe('⏱️');
    expect(getErrorIcon('network')).toBe('🌐');
    expect(getErrorIcon('auth')).toBe('🔑');
    expect(getErrorIcon('rate')).toBe('⏳');
    expect(getErrorIcon('server')).toBe('🔧');
  });

  it('未知类型返回默认图标', () => {
    expect(getErrorIcon('nonexistent')).toBe('⚠️');
  });
});
