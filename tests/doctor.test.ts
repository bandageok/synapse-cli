import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runDoctor } from '../src/commands/doctor-cli.js';
import { PROVIDER_PRESETS, setProvider } from '../src/providers/management.js';
import { VERSION } from '../src/version.js';

describe('doctor', () => {
  const originalEnv = { ...process.env };
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'synapse-doctor-'));
    for (const name of new Set(PROVIDER_PRESETS.flatMap(provider => provider.envKeys))) {
      delete process.env[name];
    }
    delete process.env.SYNAPSE_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    rmSync(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('keeps the CLI version aligned with package metadata', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as { version: string };
    expect(VERSION).toBe(packageJson.version);
  });

  it('reports actionable failures without initializing the engine', async () => {
    const report = await runDoctor({ dataDir, version: VERSION });

    expect(report.ok).toBe(false);
    expect(report.checks.find(item => item.id === 'provider-runtime')).toMatchObject({
      status: 'fail',
    });
    expect(report.checks.find(item => item.id === 'file-soul.md')).toMatchObject({
      status: 'warn',
    });
  });

  it('passes a complete custom provider configuration without making a live request', async () => {
    setProvider('company-gateway', {
      dataDir,
      baseUrl: 'https://llm.example.com/v1',
      protocol: 'openai',
      model: 'company-model',
      apiKey: 'private-key',
    });
    writeFileSync(join(dataDir, 'SOUL.md'), '# Soul\n');
    writeFileSync(join(dataDir, 'MEMORY.md'), '# Memory\n');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const report = await runDoctor({ dataDir, version: VERSION });

    expect(report.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toContain('private-key');
  });

  it('fails malformed MCP and plugin configuration', async () => {
    setProvider('local', {
      dataDir,
      baseUrl: 'http://127.0.0.1:11434/v1',
      protocol: 'openai',
      model: 'local-model',
      apiKey: 'local-key',
    });
    writeFileSync(join(dataDir, '.mcp.json'), '{broken');
    const pluginDir = join(dataDir, 'plugins', 'broken-plugin');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, 'plugin.json'), '{}');

    const report = await runDoctor({ dataDir, version: VERSION });

    expect(report.ok).toBe(false);
    expect(report.checks.find(item => item.id === 'mcp-config')?.status).toBe('fail');
    expect(report.checks.find(item => item.id === 'plugins')?.status).toBe('fail');
  });

  it('returns a structured failure for an invalid provider URL', async () => {
    writeFileSync(join(dataDir, '.synapse.json'), JSON.stringify({
      provider: 'custom',
      protocol: 'openai',
      model: 'model',
      baseUrl: 'not-a-url',
    }));

    const report = await runDoctor({ dataDir, version: VERSION });

    expect(report.ok).toBe(false);
    expect(report.checks.find(item => item.id === 'provider-runtime')).toMatchObject({
      status: 'fail',
      detail: 'Invalid provider URL: not-a-url',
    });
  });

  it('optionally performs a live provider check', async () => {
    setProvider('local', {
      dataDir,
      baseUrl: 'http://127.0.0.1:11434/v1',
      protocol: 'openai',
      model: 'local-model',
      apiKey: 'local-key',
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    const report = await runDoctor({ dataDir, live: true, version: VERSION });

    expect(report.checks.find(item => item.id === 'provider-live')).toMatchObject({ status: 'pass' });
  });
});
