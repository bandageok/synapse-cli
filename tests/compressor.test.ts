// tests/compressor.test.ts
// Compressor test suite — updated for 7-level compression
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Compressor } from '../src/core/Compressor.js';

describe('Compressor', () => {
  it('calculates thresholds correctly for 200k context', () => {
    const c = new Compressor({ contextWindow: 200_000, model: 'test', provider: undefined });
    const t = c.getThresholds();
    const effective = 200_000 - 20_000; // 180k
    const autoExpected = effective - 13_000; // 167k
    const aggressiveExpected = effective - 5_000; // 175k
    const snipExpected = effective - 1_000; // 179k
    expect(t.autoCompactThreshold).toBe(autoExpected);
    expect(t.aggressiveCompactThreshold).toBe(aggressiveExpected);
    expect(t.snipThreshold).toBe(snipExpected);
  });

  it('does not compress when under threshold', async () => {
    const c = new Compressor({ contextWindow: 200_000, model: 'test', provider: undefined });
    const msgs = [{ role: 'user' as const, content: 'hello' }];
    const result = await c.checkAndCompress(msgs);
    expect(result.compressed).toBe(false);
  });

  it('snip compresses when over snip threshold', async () => {
    const c = new Compressor({ contextWindow: 200_000, model: 'test', provider: undefined });
    // Create enough content to exceed snip threshold (~179k = ~716k chars for ASCII)
    const msgs: any[] = Array.from({ length: 500 }, () => ({
      role: 'user',
      content: 'x'.repeat(2000),
    }));
    const tokensBefore = c.estimateTokens(msgs);
    expect(tokensBefore).toBeGreaterThan((c as any).snipThreshold);
    const result = await c.checkAndCompress(msgs);
    expect(result.compressed).toBe(true);
    expect(result.stats!.tokensBefore).toBeGreaterThan(0);
    expect(result.stats!.tokensAfter).toBeLessThan(result.stats!.tokensBefore);
    expect(msgs.length).toBeLessThanOrEqual(5); // snip keeps last 5
  });

  it('aggressive compresses when over aggressive threshold', async () => {
    // Lower context window to make aggressive threshold reachable
    const c = new Compressor({ contextWindow: 50_000, model: 'test', provider: undefined });
    // effective = 30k, aggressive ~25k, need ~100k chars
    const msgs: any[] = Array.from({ length: 100 }, () => ({
      role: 'user',
      content: 'a'.repeat(1500),
    }));
    const tokensBefore = c.estimateTokens(msgs);
    const t = c.getThresholds();
    expect(tokensBefore).toBeGreaterThan(t.aggressiveCompactThreshold);
    const result = await c.checkAndCompress(msgs);
    expect(result.compressed).toBe(true);
    expect(msgs.length).toBeLessThanOrEqual(22); // 2 header messages + up to 20 recent
  });

  it('estimates CJK tokens correctly', () => {
    const c = new Compressor({ contextWindow: 200_000, model: 'test', provider: undefined });
    const result = c.estimateTokens([{ role: 'user', content: 'こんにちは世界' }]);
    expect(result).toBeGreaterThan(3);
    expect(result).toBeLessThan(10);
  });

  it('estimates ASCII tokens correctly', () => {
    const c = new Compressor({ contextWindow: 200_000, model: 'test', provider: undefined });
    const result = c.estimateTokens([{ role: 'user', content: 'hello world this is a test' }]);
    expect(result).toBeGreaterThan(5);
    expect(result).toBeLessThan(10);
  });

  it('estimates large content', () => {
    const c = new Compressor({ contextWindow: 200_000, model: 'test', provider: undefined });
    const large = 'a'.repeat(40_000);
    const result = c.estimateTokens([{ role: 'user', content: large }]);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeCloseTo(10_000, -1);
  });

  it('strips images from messages', () => {
    const msgs = [
      { role: 'user' as const, content: [
        { type: 'image' as const, source: { type: 'base64', data: '...', media_type: 'image/png' } },
        { type: 'text' as const, text: 'hello' },
      ]},
    ];
    const stripped = Compressor.stripImages(msgs);
    expect(stripped[0].content).toEqual([{ type: 'text', text: 'hello' }]);
  });
});
