// src/core/ErrorRecovery.ts
import type { Message } from './types.js';
import { isRateLimitError, retryDelayMs, waitForRetry } from './retry.js';

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
    opts: {
      tool: string;
      maxRetries: number;
      rateLimitRetries?: number;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    // 熔断器检查
    if (!this.circuitBreaker.canExecute()) {
      throw new Error(`Circuit breaker open for ${opts.tool}. Too many consecutive failures.`);
    }

    let genericRetries = 0;
    let rateLimitAttempts = 0;
    while (true) {
      try {
        const result = await fn();
        this.circuitBreaker.recordSuccess();
        this.consecutiveFailures = 0;
        return result;
      } catch (e: unknown) {
        const error = e instanceof Error ? e : new Error(String(e));
        const rateLimited = isRateLimitError(error);
        if (!rateLimited) this.circuitBreaker.recordFailure();

        // 不可重试的错误类型
        if (this.isNonRetryable(error)) {
          throw e;
        }

        if (rateLimited) {
          if (rateLimitAttempts >= (opts.rateLimitRetries ?? 0)) throw error;
          rateLimitAttempts++;
          await waitForRetry(retryDelayMs(error, rateLimitAttempts), opts.signal);
          continue;
        }

        if (genericRetries >= opts.maxRetries) throw error;
        const delay = exponentialBackoff(genericRetries);
        genericRetries++;
        await waitForRetry(delay, opts.signal);
      }
    }
  }

  async handleApiError(err: Error, _messages: Message[], options: { signal?: AbortSignal } = {}): Promise<boolean> {
    if (isRateLimitError(err)) {
      await waitForRetry(retryDelayMs(err, 1), options.signal);
      return true;
    }

    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) return false;

    const normalized = err.message.toLowerCase();
    if (/\b(400|401|403)\b/.test(normalized)
      || normalized.includes('unauthorized')
      || normalized.includes('forbidden')
      || normalized.includes('invalid_request')) {
      return false;
    }

    // rate_limit: 等待后重试
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
      await waitForRetry(5000, options.signal);
      return true;
    }

    await waitForRetry(1000, options.signal);
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

}
