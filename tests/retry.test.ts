import { describe, expect, it } from 'vitest';
import {
  errorDetails,
  isRateLimitError,
  parseRetryAfter,
  resolveRateLimitRetries,
  retryDelayMs,
  waitForRetry,
} from '../src/core/retry.js';

describe('provider retry helpers', () => {
  it('recognizes status and message based rate limits', () => {
    expect(isRateLimitError(Object.assign(new Error('limited'), { status: 429 }))).toBe(true);
    expect(isRateLimitError(new Error('exceeded retry limit: 429 Too Many Requests'))).toBe(true);
    expect(isRateLimitError(new Error('HTTP 401 unauthorized'))).toBe(false);
  });

  it('parses Retry-After seconds and exposes response metadata', () => {
    expect(parseRetryAfter('2.5')).toBe(2_500);
    const httpDate = new Date(Date.now() + 60_000).toUTCString();
    expect(parseRetryAfter(httpDate)).toBeGreaterThanOrEqual(58_000);
    expect(parseRetryAfter(httpDate)).toBeLessThanOrEqual(60_000);
    const headers = new Headers({ 'Retry-After': '3' });
    expect(errorDetails({ status: 429, headers })).toEqual({ status: 429, retryAfterMs: 3_000 });
  });

  it('prefers a bounded server delay and otherwise uses exponential backoff', () => {
    expect(retryDelayMs({ retryAfterMs: 7_000 }, 4)).toBe(7_000);
    expect(retryDelayMs({ retryAfterMs: 90_000 }, 1)).toBe(60_000);
    expect(retryDelayMs(new Error('429'), 1)).toBe(1_000);
    expect(retryDelayMs(new Error('429'), 4)).toBe(8_000);
  });

  it('cancels a pending retry immediately', async () => {
    const controller = new AbortController();
    const waiting = waitForRetry(10_000, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('validates the environment retry override', () => {
    expect(resolveRateLimitRetries(undefined, 8)).toBe(8);
    expect(resolveRateLimitRetries('-1', 8)).toBe(-1);
    expect(resolveRateLimitRetries('0', 8)).toBe(0);
    expect(resolveRateLimitRetries('100', 8)).toBe(100);
    expect(() => resolveRateLimitRetries('forever', 8)).toThrow('SYNAPSE_RATE_LIMIT_RETRIES');
    expect(() => resolveRateLimitRetries('101', 8)).toThrow('SYNAPSE_RATE_LIMIT_RETRIES');
  });
});
