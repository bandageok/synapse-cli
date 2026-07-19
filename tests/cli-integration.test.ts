import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, utimesSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { VERSION } from '../src/version.js';

const root = process.cwd();
const tsxCli = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const entry = join(root, 'src', 'entry', 'cli.ts');
const cleanup: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(dir);
  return dir;
}

function runCli(args: string[], dataDir: string, extraEnv: Record<string, string> = {}): string {
  return execFileSync(process.execPath, [tsxCli, entry, ...args], {
    cwd: root,
    env: {
      ...process.env,
      SYNAPSE_DATA_DIR: dataDir,
      ...extraEnv,
    },
    encoding: 'utf-8',
  });
}

afterEach(() => {
  while (cleanup.length) {
    rmSync(cleanup.pop()!, { recursive: true, force: true });
  }
});

describe('CLI integration', () => {
  it('init respects SYNAPSE_DATA_DIR', () => {
    const dataDir = tempDir('synapse-cli-init-');
    const output = runCli(['init'], dataDir);

    expect(output).toContain('SOUL.md created');
    expect(existsSync(join(dataDir, 'SOUL.md'))).toBe(true);
    expect(existsSync(join(dataDir, 'memory'))).toBe(true);
    expect(existsSync(join(dataDir, 'sessions'))).toBe(true);
  });

  it('lists resumable sessions', () => {
    const dataDir = tempDir('synapse-cli-resume-');
    const sessionsDir = join(dataDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, 'session-one.json'), JSON.stringify({
      messages: [{ role: 'user', content: 'hello' }],
      metadata: {
        id: 'session-one',
        model: 'test-model',
        createdAt: '2026-07-19T00:00:00.000Z',
        updatedAt: '2026-07-19T00:00:00.000Z',
        tokenUsage: 0,
        turnCount: 1,
      },
    }));

    const output = runCli(['resume'], dataDir);

    expect(output).toContain('Recent sessions');
    expect(output).toContain('session-one');
  });

  it('adds and lists MCP servers', () => {
    const dataDir = tempDir('synapse-cli-mcp-');

    runCli(['mcp', 'add', 'demo', 'node', 'server.js'], dataDir);
    const output = runCli(['mcp', 'list'], dataDir);
    const config = JSON.parse(readFileSync(join(dataDir, '.mcp.json'), 'utf-8'));

    expect(output).toContain('demo: node server.js');
    expect(config.mcpServers.demo.command).toBe('node');
    expect(config.mcpServers.demo.args).toEqual(['server.js']);
  });

  it('installs, lists, and removes a local plugin directory', () => {
    const dataDir = tempDir('synapse-cli-plugin-data-');
    const pluginSource = tempDir('synapse-cli-plugin-source-');
    writeFileSync(join(pluginSource, 'plugin.json'), JSON.stringify({
      name: 'demo-plugin',
      version: '1.0.0',
      description: 'Demo plugin',
    }));
    writeFileSync(join(pluginSource, 'README.md'), 'demo');

    runCli(['plugin', 'install', pluginSource], dataDir);
    const listOutput = runCli(['plugin', 'list'], dataDir);

    expect(listOutput).toContain('demo-plugin@1.0.0');
    expect(existsSync(join(dataDir, 'plugins', 'demo-plugin', 'README.md'))).toBe(true);

    runCli(['plugin', 'remove', 'demo-plugin'], dataDir);
    expect(existsSync(join(dataDir, 'plugins', 'demo-plugin'))).toBe(false);
  });

  it('checks updates against a configurable registry URL', async () => {
    const dataDir = tempDir('synapse-cli-update-');
    const registryUrl = 'data:application/json,' + encodeURIComponent(JSON.stringify({ version: VERSION }));

    const output = runCli(['update', '--check'], dataDir, {
      SYNAPSE_REGISTRY_URL: registryUrl,
    });

    expect(output).toContain(`Current version: ${VERSION}`);
    expect(output).toContain(`Latest version:  ${VERSION}`);
    expect(output).toContain('Already up to date');
  });

  it('does not offer to downgrade when the registry version is older', () => {
    const dataDir = tempDir('synapse-cli-update-older-');
    const registryUrl = 'data:application/json,' + encodeURIComponent(JSON.stringify({ version: '0.1.0' }));

    const output = runCli(['update', '--check'], dataDir, {
      SYNAPSE_REGISTRY_URL: registryUrl,
    });

    expect(output).toContain('newer than the registry version');
    expect(output).not.toContain('Update available');
  });

  it('configures and lists an arbitrary compatible provider', () => {
    const dataDir = tempDir('synapse-cli-provider-');
    const setOutput = runCli([
      'provider', 'set', 'company-gateway',
      '--base-url', 'https://llm.example.com/v1',
      '--protocol', 'openai',
      '--model', 'company-model',
      '--api-key', 'private-key',
    ], dataDir);
    const listOutput = runCli(['provider', 'list'], dataDir);
    const config = JSON.parse(readFileSync(join(dataDir, '.synapse.json'), 'utf-8'));

    expect(setOutput).toContain('Active provider: company-gateway');
    expect(setOutput).not.toContain('private-key');
    expect(listOutput).toContain('company-gateway');
    expect(listOutput).toContain('openai');
    expect(config.baseUrl).toBe('https://llm.example.com/v1');
    expect(config.protocol).toBe('openai');
    expect(readFileSync(join(dataDir, '.env'), 'utf-8')).toContain('SYNAPSE_API_KEY=private-key');
  });

  it('inspects, searches, exports, and safely prunes memory', () => {
    const dataDir = tempDir('synapse-cli-memory-');
    const memoryDir = join(dataDir, 'memory');
    mkdirSync(memoryDir, { recursive: true });
    writeFileSync(join(dataDir, 'MEMORY.md'), '# MEMORY.md\n- ship provider commands\n');
    const daily = join(memoryDir, '2020-01-01.md');
    writeFileSync(daily, '# Old daily memory\n');
    const oldDate = new Date('2020-01-02T00:00:00.000Z');
    utimesSync(daily, oldDate, oldDate);
    const exportPath = join(dataDir, 'export.json');

    expect(runCli(['memory', 'inspect'], dataDir)).toContain('Context injection: MEMORY.md');
    expect(runCli(['memory', 'search', 'provider commands'], dataDir)).toContain('MEMORY.md:2');
    expect(runCli(['memory', 'export', exportPath], dataDir)).toContain('Exported 2 memory files');
    expect(existsSync(exportPath)).toBe(true);

    const preview = runCli(['memory', 'prune', '--older-than', '30'], dataDir);
    expect(preview).toContain('Would delete 1 files');
    expect(existsSync(daily)).toBe(true);
    const applied = runCli(['memory', 'prune', '--older-than', '30', '--yes'], dataDir);
    expect(applied).toContain('Deleted 1 files');
    expect(existsSync(daily)).toBe(false);
  });
});
