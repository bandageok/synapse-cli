import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createProvider } from '../src/providers/factory.js';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';

describe('Provider Factory', () => {
  const origEnv = { ...process.env };
  const origDataDir = process.env.CCLAW_DATA_DIR;
  const testDir = join(homedir(), '.cclaw-test-factory');

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    process.env.CCLAW_DATA_DIR = testDir;
  });

  afterEach(() => {
    process.env = { ...origEnv };
    if (origDataDir) process.env.CCLAW_DATA_DIR = origDataDir;
    else delete process.env.CCLAW_DATA_DIR;
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns null when no API key is set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    delete process.env.CUSTOM_API_KEY;
    const provider = createProvider();
    expect(provider).toBeNull();
  });

  it('returns AnthropicProvider when ANTHROPIC_API_KEY is set', () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    delete process.env.CUSTOM_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const provider = createProvider();
    expect(provider?.name).toBe('anthropic');
  });

  it('returns OpenRouterProvider when OPENROUTER_API_KEY is set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    delete process.env.CUSTOM_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-key';
    const provider = createProvider();
    expect(provider?.name).toBe('openrouter');
  });

  it('prefers Anthropic when both keys are set', () => {
    delete process.env.MINIMAX_API_KEY;
    delete process.env.CUSTOM_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.OPENROUTER_API_KEY = 'test-key';
    const provider = createProvider();
    expect(provider?.name).toBe('anthropic');
  });

  it('returns minimax provider when baseUrl contains minimaxi.com', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.CUSTOM_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key';
    writeFileSync(join(testDir, '.cclaw.json'), JSON.stringify({
      provider: 'custom',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      model: 'MiniMax-M2.7',
    }));
    const provider = createProvider('MiniMax-M2.7');
    expect(provider?.name).toBe('minimax');
  });
});
