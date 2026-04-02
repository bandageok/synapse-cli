// src/core/ErrorRecovery.ts
import type { Message } from './types.js';

// ============================================================================
// 熔断器
// ============================================================================

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

export class CircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    state: 'closed',
  };

  constructor(
    private readonly threshold: number = 3,
    private readonly resetTimeoutMs: number = 30_000,
  ) {}

  canExecute(): boolean {
    if (this.state.state === 'closed') return true;
    if (this.state.state === 'open') {
      // 检查是否可以转为 half-open
      if (Date.now() - this.state.lastFailure > this.resetTimeoutMs) {
        this.state.state = 'half-open';
        return true;
      }
      return false;
    }
    // half-open: 允许一次尝试
    return true;
  }

  recordSuccess(): void {
    this.state = { failures: 0, lastFailure: 0, state: 'closed' };
  }

  recordFailure(): void {
    this.state.failures++;
    this.state.lastFailure = Date.now();
    if (this.state.failures >= this.threshold) {
      this.state.state = 'open';
    }
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  reset(): void {
    this.state = { failures: 0, lastFailure: 0, state: 'closed' };
  }
}

// ============================================================================
// 指数退避
// ============================================================================

function exponentialBackoff(attempt: number, baseMs: number = 1000, maxMs: number = 30_000): number {
  const delay = baseMs * Math.pow(2, attempt);
  return Math.min(delay, maxMs);
}

// ============================================================================
// ErrorRecovery
// ============================================================================

export class ErrorRecovery {
  private consecutiveFailures = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.circuitBreaker = new CircuitBreaker(3, 30_000);
  }

  async executeWithRetry<T>(
    fn: () => Promise<T>,
    opts: { tool: string; maxRetries: number },
  ): Promise<T> {
    // 熔断器检查
    if (!this.circuitBreaker.canExecute()) {
      throw new Error(`Circuit breaker open for ${opts.tool}. Too many consecutive failures.`);
    }

    let lastErr: Error | undefined;
    for (let i = 0; i <= opts.maxRetries; i++) {
      try {
        const result = await fn();
        this.circuitBreaker.recordSuccess();
        this.consecutiveFailures = 0;
        return result;
      } catch (e: unknown) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        this.circuitBreaker.recordFailure();

        // 不可重试的错误类型
        if (this.isNonRetryable(e)) {
          throw e;
        }

        if (i < opts.maxRetries) {
          const delay = exponentialBackoff(i);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastErr;
  }

  async handleApiError(err: Error, messages: Message[]): Promise<boolean> {
    // rate_limit: 等待后重试
    if (err.message.includes('rate_limit') || err.message.includes('429')) {
      const retryAfter = this.extractRetryAfter(err.message);
      await new Promise(r => setTimeout(r, retryAfter));
      return true;
    }

    // context_too_long: 触发压缩
    if (err.message.includes('context_too_long') || err.message.includes('context_too_large')) {
      return false; // 让 Compressor 处理
    }

    // abort/cancel: 用户取消
    if (err.message.includes('abort') || err.message.includes('cancel')) {
      return false;
    }

    // 5xx 服务器错误: 重试
    if (err.message.includes('500') || err.message.includes('502') || err.message.includes('503')) {
      await new Promise(r => setTimeout(r, 5000));
      return true;
    }

    // 熔断器
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) return false;
    return true;
  }

  resetFailures(): void {
    this.consecutiveFailures = 0;
    this.circuitBreaker.reset();
  }

  getCircuitBreakerState(): CircuitBreakerState {
    return this.circuitBreaker.getState();
  }

  // --- 内部方法 ---

  private isNonRetryable(err: Error): boolean {
    const msg = err.message.toLowerCase();
    // 认证错误
    if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized')) return true;
    // 无效请求
    if (msg.includes('400') || msg.includes('invalid_request')) return true;
    // 工具不存在
    if (msg.includes('unknown tool')) return true;
    return false;
  }

  private extractRetryAfter(message: string): number {
    const match = message.match(/retry[_-]?after[:\s]+(\d+)/i);
    if (match) {
      return parseInt(match[1], 10) * 1000;
    }
    return 5000; // 默认 5s
  }
}
