import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ContextBuilder } from '../src/core/Context.js';
import { MemoryLoader } from '../src/core/MemoryLoader.js';
import { SkillAutoLoader } from '../src/skills/AutoLoader.js';
import { MCPTrustStore } from '../src/services/mcp/trust.js';
import type { MCPCapabilityManifest, MCPServerConfig } from '../src/services/mcp/types.js';
import { createTaskTool } from '../src/tools/TaskTool.js';
import { ToolRegistry } from '../src/core/ToolRegistry.js';
import type { Provider } from '../src/providers/base.js';

const temporary: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'synapse-adversarial-'));
  temporary.push(dir);
  return dir;
}

afterEach(() => {
  while (temporary.length) rmSync(temporary.pop()!, { recursive: true, force: true });
});

describe('adversarial instruction loading', () => {
  it('loads AGENTS.md and permits only root-local includes', async () => {
    const root = tempDir();
    const workspace = join(root, 'workspace');
    const dataDir = join(root, 'data');
    mkdirSync(workspace);
    mkdirSync(dataDir);
    writeFileSync(join(workspace, 'AGENTS.md'), '# Project\n@./inside.md\n@../outside.txt', 'utf-8');
    writeFileSync(join(workspace, 'inside.md'), 'allowed instruction', 'utf-8');
    writeFileSync(join(root, 'outside.txt'), 'OUTSIDE_SECRET', 'utf-8');

    const loader = new MemoryLoader({ dataDir, cwd: workspace });
    expect((loader as any).resolveIncludePath('./inside.md', join(workspace, 'AGENTS.md'), workspace)).toMatch(/inside\.md$/);
    const files = await loader.loadAll();
    expect(files.some(file => file.path.endsWith('AGENTS.md'))).toBe(true);
    expect(files.some(file => file.content.includes('allowed instruction')), JSON.stringify(files, null, 2)).toBe(true);
    expect(files.every(file => !file.content.includes('OUTSIDE_SECRET'))).toBe(true);
  });

  it('rejects a junction include whose real path escapes the workspace', async () => {
    const root = tempDir();
    const workspace = join(root, 'workspace');
    const outside = join(root, 'outside');
    const dataDir = join(root, 'data');
    mkdirSync(workspace);
    mkdirSync(outside);
    mkdirSync(dataDir);
    writeFileSync(join(outside, 'secret.md'), 'JUNCTION_SECRET', 'utf-8');
    const link = join(workspace, 'linked');
    symlinkSync(outside, link, 'junction');
    writeFileSync(join(workspace, 'AGENTS.md'), '@./linked/secret.md', 'utf-8');

    const files = await new MemoryLoader({ dataDir, cwd: workspace }).loadAll();
    expect(files.every(file => !file.content.includes('JUNCTION_SECRET'))).toBe(true);
  });

  it('caps aggregate repository instructions deterministically', async () => {
    const root = tempDir();
    const workspace = join(root, 'workspace');
    const rules = join(workspace, '.synapse', 'rules');
    const dataDir = join(root, 'data');
    mkdirSync(rules, { recursive: true });
    mkdirSync(dataDir);
    for (let index = 0; index < 5; index++) writeFileSync(join(rules, `${index}.md`), String(index).repeat(40_000), 'utf-8');

    const files = await new MemoryLoader({ dataDir, cwd: workspace }).loadAll();
    expect(files.reduce((sum, file) => sum + file.content.length, 0)).toBeLessThanOrEqual(120_000);
  });

  it('reasserts immutable safety rules after configurable context and refreshes changed files', async () => {
    const root = tempDir();
    const workspace = join(root, 'workspace');
    const dataDir = join(root, 'data');
    mkdirSync(workspace);
    mkdirSync(dataDir);
    const agents = join(workspace, 'AGENTS.md');
    writeFileSync(agents, 'project-v1', 'utf-8');
    const context = new ContextBuilder({ dataDir, cwd: workspace });
    const first = await context.build(1);
    expect(first[0]).toContain('Synapse Safety Kernel');
    expect(first.at(-1)).toContain('Safety Seal');
    expect(first.join('\n')).toContain('project-v1');

    writeFileSync(agents, 'project-v2', 'utf-8');
    const second = await context.build(2);
    expect(second.join('\n')).toContain('project-v2');
    expect(second.join('\n')).not.toContain('project-v1');
  });
});

describe('adversarial skill activation', () => {
  it('does not activate every installed skill and clears deleted skills on rebuild', () => {
    const dataDir = tempDir();
    const cwd = join(dataDir, 'workspace');
    const skillDir = join(dataDir, 'skills', 'unrelated');
    mkdirSync(cwd);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# unrelated', 'utf-8');
    writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify({ name: 'collision', triggers: ['special-trigger'], paths: ['src/'] }), 'utf-8');
    const loader = new SkillAutoLoader(dataDir);
    loader.rebuild(cwd);

    expect(loader.list()[0].manifest.name).toBe('unrelated');
    expect(loader.autoMatch('', cwd)).toBeNull();
    expect(loader.getActiveNames()).toEqual([]);
    unlinkSync(join(skillDir, 'SKILL.md'));
    loader.rebuild(cwd);
    expect(loader.list()).toEqual([]);
  });
});

describe('adversarial MCP identity and Task cancellation', () => {
  const manifest: MCPCapabilityManifest = { capabilities: ['tools'], tools: ['echo'], resources: [], prompts: [] };

  it('invalidates MCP trust when a referenced script changes at the same path', () => {
    const dir = tempDir();
    const script = join(dir, 'server.mjs');
    writeFileSync(script, 'console.log("trusted")', 'utf-8');
    const config: MCPServerConfig = { name: 'local', command: process.execPath, args: [script], cwd: dir };
    const store = new MCPTrustStore(dir);
    store.trust(config, manifest);
    expect(store.verifyCommand(config)).toBe(true);

    writeFileSync(script, 'console.log("changed executable content")', 'utf-8');
    expect(store.verifyCommand(config)).toBe(false);
  });

  it('rehashes MCP scripts even when size and timestamps are preserved', () => {
    const dir = tempDir();
    const script = join(dir, 'server.mjs');
    writeFileSync(script, 'A'.repeat(128), 'utf-8');
    const originalStat = statSync(script);
    const config: MCPServerConfig = { name: 'local-stable-stat', command: process.execPath, args: [script], cwd: dir };
    const store = new MCPTrustStore(dir);
    store.trust(config, manifest);

    writeFileSync(script, 'B'.repeat(128), 'utf-8');
    utimesSync(script, originalStat.atime, originalStat.mtime);
    expect(statSync(script).size).toBe(originalStat.size);
    expect(store.verifyCommand(config)).toBe(false);
  });

  it('propagates parent cancellation into an in-process Task provider', async () => {
    const controller = new AbortController();
    const provider: Provider = {
      name: 'blocking',
      async *stream(params) {
        await new Promise<void>((_resolve, reject) => {
          const abort = () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
          if (params.signal?.aborted) abort();
          else params.signal?.addEventListener('abort', abort, { once: true });
        });
      },
    };
    const registry = new ToolRegistry({ permissions: { allowedTools: [], deniedTools: [], askForTools: [] } });
    const task = createTaskTool({
      provider,
      tools: registry,
      context: { build: async () => [] } as never,
      hooks: { preToolUse: async () => ({ blocked: false }), postToolUse: async () => {} } as never,
      compressor: { checkAndCompress: async () => ({ compressed: false }) } as never,
      errorRecovery: { executeWithRetry: async (fn: () => Promise<unknown>) => fn(), handleApiError: async () => false } as never,
    });
    const pending = task.execute({ task: 'wait', max_turns: 2 }, {
      cwd: process.cwd(),
      workspaceRoots: [process.cwd()],
      abortSignal: controller.signal,
    });
    controller.abort();
    await expect(pending).resolves.toMatchObject({ isError: true, output: expect.stringContaining('Request cancelled') });
  });
});
