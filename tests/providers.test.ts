// tests/providers.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { createProvider } from '../src/providers/factory.js';

describe('Provider Factory', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('returns null when no API key is set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const provider = createProvider();
    expect(provider).toBeNull();
  });

  it('returns AnthropicProvider when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const provider = createProvider();
    expect(provider?.name).toBe('anthropic');
  });

  it('returns OpenRouterProvider when OPENROUTER_API_KEY is set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-key';
    const provider = createProvider();
    expect(provider?.name).toBe('openrouter');
  });

  it('prefers Anthropic when both keys are set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.OPENROUTER_API_KEY = 'test-key';
    const provider = createProvider();
    expect(provider?.name).toBe('anthropic');
  });
});
