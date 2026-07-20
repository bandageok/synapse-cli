// tests/providers.test.ts
// Provider factory: all provider types
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createProvider } from '../src/providers/factory.js';
import {
  listProviders,
  PROVIDER_PRESETS,
  probeProvider,
  setProvider,
  testProvider,
} from '../src/providers/management.js';
import { homedir } from 'os';
import { join } from 'path';
import { writeFileSync, mkdirSync, rmSync } from 'fs';

describe('Provider Factory', () => {
  const origEnv = { ...process.env };
  const origDataDir = process.env.SYNAPSE_DATA_DIR;
  const testDir = join(homedir(), '.synapse-test-factory');

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    process.env.SYNAPSE_DATA_DIR = testDir;
    for (const key of new Set(PROVIDER_PRESETS.flatMap(provider => provider.envKeys))) {
      delete process.env[key];
    }
    delete process.env.SYNAPSE_API_KEY;
    delete process.env.API_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...origEnv };
    if (origDataDir) process.env.SYNAPSE_DATA_DIR = origDataDir;
    else delete process.env.SYNAPSE_DATA_DIR;
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns null when no API key is set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    delete process.env.CUSTOM_API_KEY;
    expect(createProvider()).toBeNull();
  });

  it('returns AnthropicProvider when ANTHROPIC_API_KEY is set', () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    delete process.env.CUSTOM_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key';
    expect(createProvider()?.name).toBe('anthropic');
  });

  it('returns OpenRouterProvider when OPENROUTER_API_KEY is set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    delete process.env.CUSTOM_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-key';
    expect(createProvider()?.name).toBe('openrouter');
  });

  it('prefers Anthropic when both keys are set', () => {
    delete process.env.MINIMAX_API_KEY;
    delete process.env.CUSTOM_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.OPENROUTER_API_KEY = 'test-key';
    expect(createProvider()?.name).toBe('anthropic');
  });

  it('returns minimax provider when baseUrl contains minimaxi.com', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.CUSTOM_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key';
    writeFileSync(join(testDir, '.synapse.json'), JSON.stringify({
      provider: 'custom',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      model: 'MiniMax-M2.7',
    }));
    const p = createProvider('MiniMax-M2.7');
    expect(p?.name).toBe('minimax');
  });

  it('supports an arbitrary OpenAI-compatible provider and BaseURL', () => {
    const runtime = setProvider('company-gateway', {
      dataDir: testDir,
      baseUrl: 'https://llm.example.com/v1/',
      protocol: 'openai',
      model: 'company-model',
      apiKey: 'private-key',
    });

    expect(runtime.id).toBe('company-gateway');
    expect(runtime.baseUrl).toBe('https://llm.example.com/v1');
    expect(runtime.keyName).toBe('SYNAPSE_API_KEY');
    expect(createProvider()?.name).toBe('company-gateway');
  });

  it('stores an explicit ordered fallback model chain', () => {
    const runtime = setProvider('company-gateway', {
      dataDir: testDir,
      baseUrl: 'https://llm.example.com/v1',
      protocol: 'openai',
      model: 'primary-model',
      fallbackModels: ['small-model', 'local-model', 'small-model'],
      apiKey: 'private-key',
    });
    expect(runtime.fallbackModels).toEqual(['small-model', 'local-model']);
  });

  it('honors an explicit preset when other provider keys exist', () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    setProvider('openrouter', { dataDir: testDir, apiKey: 'router-key' });

    expect(createProvider()?.name).toBe('openrouter');
    expect(listProviders(testDir).find(provider => provider.id === 'openrouter')?.active).toBe(true);
  });

  it('tests a custom endpoint using its configured protocol and auth', async () => {
    setProvider('local-gateway', {
      dataDir: testDir,
      baseUrl: 'http://127.0.0.1:8080/v1',
      protocol: 'openai',
      model: 'local-model',
      apiKey: 'local-key',
    });
    const originalFetch = globalThis.fetch;
    let request: { input?: string | URL | Request; init?: RequestInit } = {};
    globalThis.fetch = async (input, init) => {
      request = { input, init };
      return new Response(JSON.stringify({ choices: [] }), { status: 200 });
    };
    try {
      const result = await testProvider({ dataDir: testDir, timeoutMs: 1000 });
      expect(result.provider).toBe('local-gateway');
      expect(String(request.input)).toBe('http://127.0.0.1:8080/v1/chat/completions');
      expect((request.init?.headers as Record<string, string>).authorization).toBe('Bearer local-key');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('explains unreachable provider endpoints instead of returning bare fetch failed', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENETUNREACH' } });
    };
    try {
      await expect(probeProvider({
        id: 'local-gateway',
        name: 'Local gateway',
        protocol: 'openai',
        auth: 'bearer',
        apiKey: 'local-key',
        keySource: 'environment',
        keyName: 'SYNAPSE_API_KEY',
        model: 'local-model',
        baseUrl: 'https://llm.example.com/v1',
        preset: false,
      }, { timeoutMs: 1000 })).rejects.toThrow(
        'Local gateway could not reach https://llm.example.com/v1 (ENETUNREACH)',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('adds actionable hints for authentication and model errors', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('unauthorized', { status: 401 });
    try {
      await expect(probeProvider({
        id: 'gateway',
        name: 'Gateway',
        protocol: 'openai',
        auth: 'bearer',
        apiKey: 'key',
        keySource: 'file',
        keyName: 'KEY',
        model: 'model',
        baseUrl: 'https://llm.example.com/v1',
        preset: false,
      }, { timeoutMs: 1000 })).rejects.toThrow('Check the API key and account permissions.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
