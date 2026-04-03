// tests/compressor-upgrade.test.ts
// 7级压缩策略验证
import { describe, it, expect } from 'vitest';
import { Compressor } from '../src/core/Compressor.js';

describe('Compressor 7-level compression', () => {
  const config = { contextWindow: 200_000, model: 'test', provider: undefined };

  it('has 3 new thresholds (aggressiveCompact, snip)', () => {
    const c = new Compressor(config);
    const t = c.getThresholds();
    expect(t.aggressiveCompactThreshold).toBeDefined();
    expect(t.snipThreshold).toBeDefined();
  });

  it('thresholds are ordered: snip > aggressive > auto', () => {
    const c = new Compressor(config);
    const t = c.getThresholds();
    expect(t.snipThreshold).toBeGreaterThan(t.aggressiveCompactThreshold);
    expect(t.aggressiveCompactThreshold).toBeGreaterThan(t.autoCompactThreshold);
  });

  it('does not compress at low token count', async () => {
    const c = new Compressor(config);
    const msgs = [{ role: 'user' as const, content: 'hello' }];
    const result = await c.checkAndCompress(msgs);
    expect(result.compressed).toBe(false);
  });

  it('snipOldMessages preserves last 5 messages', async () => {
    const c = new Compressor(config);
    const msgs = Array.from({ length: 50 }, (_, i) => ({
      role: 'user' as const,
      content: `Msg ${i}`.repeat(1000),
    }));
    // Manually test snip by overfilling
    const privateMethod = c as any;
    privateMethod.snipThreshold = 0; // Force snip
    const result = await c.checkAndCompress(msgs);
    expect(result.compressed).toBe(true);
    expect(msgs.length).toBeLessThanOrEqual(5);
  });

  it('estimateTokens handles large messages', () => {
    const c = new Compressor(config);
    const largeMsg = 'a'.repeat(40_000);
    const result = c.estimateTokens([{ role: 'user', content: largeMsg }]);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeCloseTo(10_000, -1); // ~4 chars/token
  });
});
