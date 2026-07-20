import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildBubblewrapSandboxProcess, buildDockerSandboxProcess } from '../src/security/Sandbox.js';
import { MCPTrustStore } from '../src/services/mcp/trust.js';
import { MCPClient } from '../src/services/mcp/client.js';
import type { MCPCapabilityManifest, MCPServerConfig } from '../src/services/mcp/types.js';
import { isBlockedAddress, NetworkPolicy } from '../src/security/NetworkPolicy.js';
import { evaluateCompressionQuality } from '../src/core/Compressor.js';
import { TokenCounter } from '../src/core/TokenCounter.js';
import { TokenRenderBuffer, virtualizeText } from '../src/ui/streaming.js';
import { ToolRegistry } from '../src/core/ToolRegistry.js';
import { createEngine } from '../src/core/Engine.js';
import type { Provider } from '../src/core/types.js';

const temporary: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  while (temporary.length) rmSync(temporary.pop()!, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'synapse-phase2-'));
  temporary.push(dir);
  return dir;
}

describe('strict sandbox policy', () => {
  it.skipIf(process.platform !== 'linux')('builds Bubblewrap with an isolated root user before network setup', () => {
    const root = tempDir();
    const spec = buildBubblewrapSandboxProcess('npm test', { cwd: root, workspaceRoots: [root] });
    expect(spec.args).toContain('--unshare-user');
    expect(spec.args).toContain('--unshare-net');
    expect(spec.args.slice(spec.args.indexOf('--uid'), spec.args.indexOf('--uid') + 2)).toEqual(['--uid', '0']);
    expect(spec.args.slice(spec.args.indexOf('--gid'), spec.args.indexOf('--gid') + 2)).toEqual(['--gid', '0']);
    expect(spec.args.indexOf('--unshare-user')).toBeLessThan(spec.args.indexOf('--unshare-net'));
  });

  it('builds a capability-dropped, read-only, networkless Docker command', () => {
    const root = tempDir();
    const spec = buildDockerSandboxProcess('npm test', { cwd: root, workspaceRoots: [root] });
    expect(spec.file).toBe('docker');
    expect(spec.args).toContain('--read-only');
    expect(spec.args).toContain('--cap-drop');
    expect(spec.args).toContain('no-new-privileges');
    expect(spec.args).toContain('--network');
    expect(spec.args).toContain('none');
    expect(spec.args.join(' ')).toContain('type=bind');
  });

  it('rejects a working directory outside the mounted workspace', () => {
    const root = tempDir();
    const outside = tempDir();
    expect(() => buildDockerSandboxProcess('echo no', { cwd: outside, workspaceRoots: [root] })).toThrow(/outside/);
  });

  it('auto-approves only explicitly bounded tools in workspace-auto mode', () => {
    const registry = new ToolRegistry({
      permissionMode: 'workspace-auto',
      permissions: { allowedTools: [], deniedTools: [], askForTools: ['BoundedExec', 'HostExec'] },
    });
    const base = { description: 'test', schema: { type: 'object', properties: {} }, permissions: 'execute' as const, isEnabled: () => true, execute: async () => ({ output: 'ok', isError: false }) };
    registry.register({ ...base, name: 'BoundedExec', autoApproveInWorkspace: true });
    registry.register({ ...base, name: 'HostExec' });
    expect(registry.checkPermission({ id: '1', name: 'BoundedExec', input: {} })).toBe('allow');
    expect(registry.checkPermission({ id: '2', name: 'HostExec', input: {} })).toBe('ask');
  });
});

describe('MCP trust fingerprints', () => {
  const manifest: MCPCapabilityManifest = { capabilities: ['tools'], tools: ['read'], resources: [], prompts: [] };
  const config: MCPServerConfig = { name: 'local', command: 'node', args: ['server.mjs'], env: { MODE: 'safe' } };

  it('invalidates trust when command inputs or capabilities change', () => {
    const store = new MCPTrustStore(tempDir());
    store.trust(config, manifest);
    expect(store.verifyCommand(config)).toBe(true);
    expect(store.verifyCapabilities(config, manifest)).toBe(true);
    expect(store.verifyCommand({ ...config, args: ['other.mjs'] })).toBe(false);
    expect(store.verifyCommand({ ...config, env: { MODE: 'unsafe' } })).toBe(false);
    expect(store.verifyCapabilities(config, { ...manifest, tools: ['read', 'shell'] })).toBe(false);
  });

  it('revokes a trusted server', () => {
    const store = new MCPTrustStore(tempDir());
    store.trust(config, manifest);
    store.revoke(config.name);
    expect(store.verifyCommand(config)).toBe(false);
  });

  it('does not spawn an untrusted command and connects only after explicit inspection', async () => {
    const dir = tempDir();
    const marker = join(dir, 'spawned.txt');
    const script = join(dir, 'server.cjs');
    writeFileSync(script, `
      const fs = require('fs');
      const readline = require('readline');
      fs.writeFileSync(process.env.MARKER, 'spawned');
      readline.createInterface({ input: process.stdin }).on('line', line => {
        const request = JSON.parse(line);
        if (!request.id) return;
        let result = {};
        if (request.method === 'initialize') result = { capabilities: { tools: {} } };
        if (request.method === 'tools/list') result = { tools: [{ name: 'echo', description: 'echo', inputSchema: { type: 'object', properties: {} } }] };
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');
      });
    `, 'utf-8');
    const server: MCPServerConfig = { name: 'probe', command: process.execPath, args: [script], env: { MARKER: marker } };
    const client = new MCPClient(dir);
    expect(await client.connect(server)).toEqual([]);
    expect(existsSync(marker)).toBe(false);
    const inspected = await client.inspectAndTrust(server, dir);
    expect(inspected.manifest.tools).toEqual(['echo']);
    expect(existsSync(marker)).toBe(true);
    expect((await client.connect(server)).map(tool => tool.name)).toEqual(['echo']);
    client.disconnect();

    rmSync(marker, { force: true });
    writeFileSync(script, `
      const fs = require('fs');
      fs.writeFileSync(process.env.MARKER, 'replacement ran');
      setInterval(() => {}, 1000);
    `, 'utf-8');
    const replacementClient = new MCPClient(dir);
    expect(await replacementClient.connect(server)).toEqual([]);
    expect(existsSync(marker)).toBe(false);
  });
});

describe('DNS and domain policy', () => {
  it('requires explicit domain allowlisting and treats wildcards as subdomain-only', () => {
    const policy = new NetworkPolicy(tempDir());
    expect(() => policy.validateUrl('https://example.com')).toThrow(/not allowlisted/);
    policy.allowDomain('*.example.com');
    expect(policy.validateUrl('https://api.example.com/path').hostname).toBe('api.example.com');
    expect(() => policy.validateUrl('https://example.com')).toThrow(/not allowlisted/);
    expect(() => policy.validateUrl('http://api.example.com')).toThrow(/Only HTTPS/);
  });

  it('blocks private, loopback, link-local, documentation, and mapped addresses', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '169.254.1.1', '192.0.2.3', '::1', 'fc00::1', '::ffff:127.0.0.1']) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
  });
});

describe('token accounting and compression quality', () => {
  it('labels unknown model counts as estimated', async () => {
    const count = await new TokenCounter('vendor/unknown-model').count([{ role: 'user', content: 'hello' }]);
    expect(count.method).toBe('estimated');
    expect(count.tokens).toBeGreaterThan(0);
  });

  it('detects lost protected facts and dangling tool results', () => {
    const before = [
      { role: 'user' as const, content: 'Edit C:\\repo\\src\\main.ts and preserve https://example.com/spec' },
      { role: 'assistant' as const, content: [{ type: 'tool_use' as const, id: 'call-1234567', name: 'FileEdit', input: { file_path: 'C:\\repo\\src\\main.ts' } }] },
      { role: 'user' as const, content: [{ type: 'tool_result' as const, tool_use_id: 'call-1234567', content: 'done' }] },
    ];
    const bad = [{ role: 'user' as const, content: [{ type: 'tool_result' as const, tool_use_id: 'call-1234567', content: 'done' }] }];
    const quality = evaluateCompressionQuality(before, bad);
    expect(quality.protectedFactRetention).toBeLessThan(1);
    expect(quality.toolCallIntegrity).toBe(0);
  });

  it('rejects compression candidates that drop explicit safety constraints', () => {
    const before = [
      { role: 'user' as const, content: 'Never execute destructive commands without explicit human approval.' },
      { role: 'assistant' as const, content: 'I will inspect the repository first.' },
    ];
    const after = [{ role: 'assistant' as const, content: 'Repository inspection continues.' }];
    const quality = evaluateCompressionQuality(before, after);
    expect(quality.protectedFactRetention).toBe(0);
    expect(quality.score).toBeLessThan(0.72);
  });
});

describe('TUI streaming controls', () => {
  it('coalesces token deltas at a bounded cadence', () => {
    vi.useFakeTimers();
    const flushed: string[] = [];
    const buffer = new TokenRenderBuffer(text => flushed.push(text), 40);
    buffer.push('a');
    buffer.push('b');
    expect(flushed).toEqual([]);
    vi.advanceTimersByTime(40);
    expect(flushed).toEqual(['ab']);
  });

  it('virtualizes long output without mutating source content', () => {
    const source = Array.from({ length: 100 }, (_, index) => `line-${index}`).join('\n');
    const rendered = virtualizeText(source, 10, 80);
    expect(rendered.split('\n').length).toBeLessThanOrEqual(10);
    expect(rendered).toContain('rendered lines omitted');
    expect(source).toContain('line-99');
  });

  it('bounds virtualization work for very large single-line output', () => {
    const source = 'x'.repeat(1_000_000);
    const rendered = virtualizeText(source, 20, 100);
    expect(rendered.length).toBeLessThan(10_000);
    expect(rendered).toContain('characters omitted');
    expect(source.length).toBe(1_000_000);
  });

  it('propagates cancellation through the engine provider signal', async () => {
    const controller = new AbortController();
    const provider: Provider = {
      name: 'blocking',
      async *stream(params) {
        await new Promise<void>((_resolve, reject) => {
          const fail = () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
          if (params.signal?.aborted) fail();
          else params.signal?.addEventListener('abort', fail, { once: true });
        });
      },
    };
    const registry = new ToolRegistry({ permissions: { allowedTools: [], deniedTools: [], askForTools: [] } });
    const events = createEngine(
      [{ role: 'user', content: 'wait' }], provider, registry,
      { build: async () => [] },
      { preToolUse: async () => ({ blocked: false }), postToolUse: async () => {} },
      { checkAndCompress: async () => ({ compressed: false }) },
      { executeWithRetry: async fn => fn(), handleApiError: async () => false },
      { signal: controller.signal },
    );
    const pending = events.next();
    controller.abort();
    await expect(pending).resolves.toMatchObject({ value: { type: 'error', error: 'Request cancelled.' } });
  });
});
