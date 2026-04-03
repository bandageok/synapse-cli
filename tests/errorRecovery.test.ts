// tests/errorRecovery.test.ts
// ErrorRecovery: retry logic, error handling
import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorRecovery } from '../src/core/ErrorRecovery.js';

describe('ErrorRecovery', () => {
  let er: ErrorRecovery;
  beforeEach(() => { er = new ErrorRecovery(); });

  it('instantiates', () => { expect(er).toBeDefined(); });

  it('executes without retries', async () => {
    const result = await er.executeWithRetry(async () => 'ok', { maxRetries: 0 });
    expect(result).toBe('ok');
  });

  it('retries on failure', async () => {
    let calls = 0;
    const result = await er.executeWithRetry(
      async () => { calls++; if (calls < 2) throw new Error('fail'); return 'ok2'; },
      { maxRetries: 2 }
    );
    expect(result).toBe('ok2');
    expect(calls).toBe(2);
  });

  it('throws after max retries exceeded', async () => {
    await expect(er.executeWithRetry(
      async () => { throw new Error('always'); },
      { maxRetries: 2 }
    )).rejects.toThrow('always');
  });

  it('handleApiError returns boolean', async () => {
    const msgs: any[] = [];
    const result = await er.handleApiError(new Error('test'), msgs);
    expect(typeof result).toBe('boolean');
  });

  it('records error info', async () => {
    let calls = 0;
    try { await er.executeWithRetry(async () => { calls++; throw new Error('boom'); }, { maxRetries: 0 }); } catch {}
    expect(calls).toBe(1);
  });
});
