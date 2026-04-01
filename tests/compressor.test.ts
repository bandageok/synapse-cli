// tests/compressor.test.ts
import { describe, it, expect } from 'vitest';
import { Compressor } from '../src/core/Compressor.js';
import type { Message } from '../src/core/types.js';

describe('Compressor', () => {
  it('calculates thresholds correctly for 200k context', () => {
    const compressor = new Compressor({ contextWindow: 200_000, model: 'test' });
    const stats = compressor.getThresholds();
    // effectiveWindow = 200_000 - 20_000 = 180_000
    // autoCompact = 180_000 - 13_000 = 167_000
    // warning = 167_000 - 20_000 = 147_000
    expect(stats.autoCompactThreshold).toBe(167_000);
    expect(stats.warningThreshold).toBe(147_000);
  });

  it('does not compress short messages', async () => {
    const compressor = new Compressor({ contextWindow: 200_000, model: 'test' });
    const messages: Message[] = [{ role: 'user', content: 'hello' }];
    const result = await compressor.checkAndCompress(messages);
    expect(result.compressed).toBe(false);
  });

  it('strips images from messages', () => {
    const messages: Message[] = [
      { role: 'user', content: [
        { type: 'text', text: 'describe this' },
        { type: 'image', source: { type: 'base64', data: 'x'.repeat(10000) } } as any,
      ]},
    ];
    const stripped = Compressor.stripImages(messages);
    expect(Array.isArray(stripped[0].content)).toBe(true);
    expect((stripped[0].content as any[])).toHaveLength(1);
    expect((stripped[0].content as any[])[0].type).toBe('text');
  });

  it('estimates tokens for string content', () => {
    const compressor = new Compressor({ contextWindow: 200_000, model: 'test' });
    const messages: Message[] = [
      { role: 'user', content: 'a'.repeat(400) }, // ~100 tokens
    ];
    const tokens = compressor.estimateTokens(messages);
    expect(tokens).toBe(100);
  });

  it('estimates tokens for content blocks', () => {
    const compressor = new Compressor({ contextWindow: 200_000, model: 'test' });
    const messages: Message[] = [
      { role: 'user', content: [
        { type: 'text', text: 'a'.repeat(400) }, // ~100 tokens
        { type: 'text', text: 'b'.repeat(200) },  // ~50 tokens
      ]},
    ];
    const tokens = compressor.estimateTokens(messages);
    expect(tokens).toBe(150);
  });

  it('compresses when over threshold', async () => {
    // Use small context window to trigger compression
    const compressor = new Compressor({ contextWindow: 1000, model: 'test' });
    // effectiveWindow = 1000 - 20_000 = negative, so autoCompact will be negative
    // This means any message will trigger compression
    const messages: Message[] = [
      { role: 'user', content: 'x'.repeat(10000) },
      { role: 'assistant', content: 'y'.repeat(10000) },
    ];
    const result = await compressor.checkAndCompress(messages);
    expect(result.compressed).toBe(true);
    expect(result.stats).toBeDefined();
    expect(result.stats!.tokensAfter).toBeLessThan(result.stats!.tokensBefore);
  });

  it('builds summary from messages', () => {
    const compressor = new Compressor({ contextWindow: 200_000, model: 'test' });
    const messages: Message[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ];
    // Access private method via any
    const summary = (compressor as any).buildSummary(messages);
    expect(summary).toContain('user: hello');
    expect(summary).toContain('assistant: hi there');
  });

  it('circuit breaker stops after 3 consecutive failures', async () => {
    const compressor = new Compressor({ contextWindow: 1000, model: 'test' });
    // Force 3 failures by setting consecutiveFailures
    (compressor as any).consecutiveFailures = 3;

    const messages: Message[] = [
      { role: 'user', content: 'x'.repeat(10000) },
    ];
    const result = await compressor.checkAndCompress(messages);
    expect(result.compressed).toBe(false);
  });
});
