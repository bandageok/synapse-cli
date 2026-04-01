// tests/errorRecovery.test.ts
import { describe, it, expect } from 'vitest';
import { ErrorRecovery } from '../src/core/ErrorRecovery.js';

describe('ErrorRecovery', () => {
  it('retries on failure and succeeds', async () => {
    const recovery = new ErrorRecovery();
    let attempts = 0;
    const result = await recovery.executeWithRetry(
      async () => {
        attempts++;
        if (attempts < 2) throw new Error('fail');
        return 'ok';
      },
      { tool: 'test', maxRetries: 2 },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('throws after max retries exceeded', async () => {
    const recovery = new ErrorRecovery();
    await expect(
      recovery.executeWithRetry(
        async () => { throw new Error('always fail'); },
        { tool: 'test', maxRetries: 1 },
      )
    ).rejects.toThrow('always fail');
  });

  it('handles rate limit error with retry', { timeout: 10000 }, async () => {
    const recovery = new ErrorRecovery();
    const result = await recovery.handleApiError(new Error('rate_limit exceeded'), []);
    expect(result).toBe(true);
  });

  it('handles context too long without retry', async () => {
    const recovery = new ErrorRecovery();
    const result = await recovery.handleApiError(new Error('context_too_long'), []);
    expect(result).toBe(false);
  });

  it('handles abort without retry', async () => {
    const recovery = new ErrorRecovery();
    const result = await recovery.handleApiError(new Error('abort'), []);
    expect(result).toBe(false);
  });

  it('circuit breaker after 3 unknown errors', async () => {
    const recovery = new ErrorRecovery();
    await recovery.handleApiError(new Error('unknown1'), []);
    await recovery.handleApiError(new Error('unknown2'), []);
    const result = await recovery.handleApiError(new Error('unknown3'), []);
    expect(result).toBe(false);
  });

  it('resetFailures clears circuit breaker', async () => {
    const recovery = new ErrorRecovery();
    await recovery.handleApiError(new Error('unknown1'), []);
    await recovery.handleApiError(new Error('unknown2'), []);
    recovery.resetFailures();
    const result = await recovery.handleApiError(new Error('unknown3'), []);
    expect(result).toBe(true);
  });
});
