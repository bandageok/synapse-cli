// src/core/ErrorRecovery.ts
export class ErrorRecovery {
  private consecutiveFailures = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;

  async executeWithRetry<T>(
    fn: () => Promise<T>,
    opts: { tool: string; maxRetries: number },
  ): Promise<T> {
    let lastErr: Error | undefined;
    for (let i = 0; i <= opts.maxRetries; i++) {
      try {
        return await fn();
      } catch (e: any) {
        lastErr = e;
        if (i < opts.maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        }
      }
    }
    throw lastErr;
  }

  async handleApiError(err: Error, _messages: any[]): Promise<boolean> {
    if (err.message.includes('rate_limit') || err.message.includes('429')) {
      await new Promise(r => setTimeout(r, 5000));
      return true;
    }
    if (err.message.includes('context_too_long') || err.message.includes('context_too_large')) {
      return false; // let Compressor handle it
    }
    if (err.message.includes('abort') || err.message.includes('cancel')) {
      return false; // user cancelled
    }
    // Unknown error — circuit breaker
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) return false;
    return true;
  }

  resetFailures(): void {
    this.consecutiveFailures = 0;
  }
}
