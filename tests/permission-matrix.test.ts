import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createEngine } from '../src/core/Engine.js';
import {
  PERMISSION_PROFILES,
  PermissionManager,
  normalizePermissionMode,
  resolvePermissionModeSelection,
} from '../src/core/PermissionManager.js';
import { ToolRegistry } from '../src/core/ToolRegistry.js';
import type {
  EngineEvent,
  Message,
  PermissionMode,
  Provider,
  StreamChunk,
  ToolDef,
} from '../src/core/types.js';
import { FileReadTool } from '../src/tools/FileReadTool.js';
import { addToAllowlist, loadPermissions, savePermissions, type PermissionConfig } from '../src/utils/permissions.js';

const temporary: string[] = [];
const emptyPolicy: PermissionConfig = { allowedTools: [], deniedTools: [], askForTools: [] };
type ToolPermission = ToolDef['permissions'];

afterEach(() => {
  while (temporary.length) rmSync(temporary.pop()!, { recursive: true, force: true });
});

function tempDir(prefix = 'synapse-permission-matrix-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporary.push(dir);
  return dir;
}

function context(workspace: string) {
  return { cwd: workspace, workspaceRoots: [workspace], abortSignal: new AbortController().signal };
}

function tool(
  name: string,
  permissions: ToolPermission,
  options: { bounded?: boolean; enabled?: boolean; execute?: ToolDef['execute'] } = {},
): ToolDef {
  return {
    name,
    description: name,
    schema: {
      type: 'object',
      properties: { value: { type: 'string' } },
      additionalProperties: false,
    },
    permissions,
    autoApproveInWorkspace: options.bounded,
    isEnabled: () => options.enabled ?? true,
    execute: options.execute ?? (async () => ({ output: `${name}:ok`, isError: false })),
  };
}

function registryFor(
  mode: PermissionMode,
  workspace: string,
  policy: PermissionConfig = emptyPolicy,
): ToolRegistry {
  return new ToolRegistry({ permissionMode: mode, permissions: policy, workspaceRoots: [workspace] });
}

describe('permission input matrix', () => {
  it.each([
    ['ask', 'ask'],
    [' ASK ', 'ask'],
    ['auto', 'auto'],
    ['workspace-auto', 'auto'],
    [' Workspace-Auto ', 'auto'],
    ['full-access', 'full-access'],
    ['yolo', 'full-access'],
    [' YOLO ', 'full-access'],
  ] as const)('normalizes %j to %s', (input, expected) => {
    expect(normalizePermissionMode(input)).toBe(expected);
  });

  it.each([undefined, null, true, 1, '', 'unknown', 'full_access'])('rejects invalid mode %j', input => {
    expect(normalizePermissionMode(input)).toBeNull();
  });

  it.each([
    [{}, 'auto', 'auto'],
    [{ permissionMode: 'ask' }, 'auto', 'ask'],
    [{ permissionMode: 'workspace-auto' }, 'ask', 'auto'],
    [{ permissionMode: 'yolo' }, 'ask', 'full-access'],
    [{ yolo: true }, 'ask', 'full-access'],
    [{ yolo: true, permissionMode: 'full-access' }, 'ask', 'full-access'],
    [{ yolo: true, permissionMode: 'yolo' }, 'ask', 'full-access'],
  ] as const)('resolves options %j over fallback %s', (options, fallback, expected) => {
    expect(resolvePermissionModeSelection(options, fallback)).toBe(expected);
  });

  it.each([
    [{ permissionMode: 'invalid' }],
    [{ yolo: true, permissionMode: 'ask' }],
    [{ yolo: true, permissionMode: 'auto' }],
  ])('rejects conflicting or invalid selection %j', options => {
    expect(() => resolvePermissionModeSelection(options)).toThrow();
  });

  it('does not corrupt the active mode when a switch is invalid', () => {
    const manager = new PermissionManager('auto');
    expect(() => manager.setMode('invalid' as never)).toThrow();
    expect(manager.getMode()).toBe('auto');
  });

  it('keeps profile metadata immutable and internally consistent', () => {
    expect(Object.isFrozen(PERMISSION_PROFILES)).toBe(true);
    expect(Object.values(PERMISSION_PROFILES).map(profile => profile.mode)).toEqual(['ask', 'auto', 'full-access']);
    expect(PERMISSION_PROFILES.ask).toMatchObject({ approvalPolicy: 'on-request', shellIsolation: 'host-after-approval' });
    expect(PERMISSION_PROFILES.auto).toMatchObject({ approvalPolicy: 'never', shellIsolation: 'strict-workspace' });
    expect(PERMISSION_PROFILES['full-access']).toMatchObject({ approvalPolicy: 'never', shellIsolation: 'host' });
    expect(PERMISSION_PROFILES['full-access'].warning).toContain('without approval prompts');
  });
});

describe('tool decision matrix', () => {
  const cases: Array<{
    mode: PermissionMode;
    permission: ToolPermission;
    bounded?: boolean;
    expected: 'allow' | 'ask' | 'deny';
  }> = [
    { mode: 'ask', permission: 'read', expected: 'allow' },
    { mode: 'ask', permission: 'write', expected: 'ask' },
    { mode: 'ask', permission: 'execute', expected: 'ask' },
    { mode: 'ask', permission: 'network', expected: 'ask' },
    { mode: 'auto', permission: 'read', expected: 'allow' },
    { mode: 'auto', permission: 'write', expected: 'allow' },
    { mode: 'auto', permission: 'execute', expected: 'deny' },
    { mode: 'auto', permission: 'network', expected: 'deny' },
    { mode: 'auto', permission: 'execute', bounded: true, expected: 'allow' },
    { mode: 'auto', permission: 'network', bounded: true, expected: 'allow' },
    { mode: 'full-access', permission: 'read', expected: 'allow' },
    { mode: 'full-access', permission: 'write', expected: 'allow' },
    { mode: 'full-access', permission: 'execute', expected: 'allow' },
    { mode: 'full-access', permission: 'network', expected: 'allow' },
  ];

  it.each(cases)('$mode + $permission bounded=$bounded -> $expected', ({ mode, permission, bounded, expected }) => {
    const workspace = tempDir();
    const registry = registryFor(mode, workspace);
    registry.register(tool('Subject', permission, { bounded }));
    expect(registry.checkPermission({ id: 'subject', name: 'Subject', input: {} })).toBe(expected);
  });

  it.each(['ask', 'auto', 'full-access'] as const)('explicit deny wins in %s mode', mode => {
    const workspace = tempDir();
    const registry = registryFor(mode, workspace, {
      allowedTools: ['Subject'],
      askForTools: ['Subject'],
      deniedTools: ['Subject'],
    });
    registry.register(tool('Subject', 'read', { bounded: true }));
    expect(registry.checkPermission({ id: 'subject', name: 'Subject', input: {} })).toBe('deny');
  });

  it('askForTools wins over allowedTools when an ask policy is internally conflicting', () => {
    const workspace = tempDir();
    const registry = registryFor('ask', workspace, {
      allowedTools: ['Subject'], deniedTools: [], askForTools: ['Subject'],
    });
    registry.register(tool('Subject', 'read'));
    expect(registry.checkPermission({ id: 'subject', name: 'Subject', input: {} })).toBe('ask');
  });

  it.each(['write', 'execute', 'network'] as const)('explicit allow removes repeated ask for %s tools in ask mode', permission => {
    const workspace = tempDir();
    const registry = registryFor('ask', workspace, {
      allowedTools: ['Subject'], deniedTools: [], askForTools: [],
    });
    registry.register(tool('Subject', permission));
    expect(registry.checkPermission({ id: 'subject', name: 'Subject', input: {} })).toBe('allow');
  });

  it('auto and full-access never return ask even when askForTools contains the tool', () => {
    const workspace = tempDir();
    const policy = { allowedTools: [], deniedTools: [], askForTools: ['Bounded', 'Host'] };
    const auto = registryFor('auto', workspace, policy);
    auto.register(tool('Bounded', 'execute', { bounded: true }));
    auto.register(tool('Host', 'execute'));
    expect(auto.checkPermission({ id: 'bounded', name: 'Bounded', input: {} })).toBe('allow');
    expect(auto.checkPermission({ id: 'host', name: 'Host', input: {} })).toBe('deny');

    const full = registryFor('full-access', workspace, policy);
    full.register(tool('Host', 'execute'));
    expect(full.checkPermission({ id: 'host', name: 'Host', input: {} })).toBe('allow');
  });
});

describe('fail-closed guard matrix', () => {
  it.each(['ask', 'auto', 'full-access'] as const)('denies uninitialized registries in %s mode', mode => {
    const workspace = tempDir();
    const registry = new ToolRegistry({ permissionMode: mode, workspaceRoots: [workspace] });
    registry.register(tool('Subject', 'read', { bounded: true }));
    expect(registry.checkPermission({ id: 'subject', name: 'Subject', input: {} })).toBe('deny');
  });

  it.each(['ask', 'auto', 'full-access'] as const)('denies unknown tools in %s mode', mode => {
    const workspace = tempDir();
    expect(registryFor(mode, workspace).checkPermission({ id: 'unknown', name: 'Unknown', input: {} })).toBe('deny');
  });

  it.each(['ask', 'auto', 'full-access'] as const)('denies disabled tools before approval in %s mode', mode => {
    const workspace = tempDir();
    const registry = registryFor(mode, workspace);
    registry.register(tool('Disabled', 'read', { enabled: false, bounded: true }));
    expect(registry.checkPermission({ id: 'disabled', name: 'Disabled', input: {} })).toBe('deny');
  });

  it.each(['ask', 'auto', 'full-access'] as const)('denies invalid schema input in %s mode', mode => {
    const workspace = tempDir();
    const registry = registryFor(mode, workspace);
    registry.register(tool('Subject', 'read', { bounded: true }));
    expect(registry.checkPermission({ id: 'subject', name: 'Subject', input: { value: 42 } })).toBe('deny');
  });

  it.each(['ask', 'auto', 'full-access'] as const)('denies paths outside the workspace in %s mode', mode => {
    const workspace = tempDir();
    const outside = tempDir('synapse-permission-outside-');
    const registry = registryFor(mode, workspace);
    registry.register(FileReadTool);
    expect(registry.checkPermission({ id: 'read', name: 'FileRead', input: { file_path: join(outside, 'secret.txt') } })).toBe('deny');
  });

  it.each([
    ['ask', 'ask'],
    ['auto', 'deny'],
    ['full-access', 'allow'],
  ] as const)('handles sensitive workspace reads in %s mode as %s', (mode, expected) => {
    const workspace = tempDir();
    writeFileSync(join(workspace, '.env'), 'SECRET=value');
    const registry = registryFor(mode, workspace);
    registry.register(FileReadTool);
    expect(registry.checkPermission({ id: 'read', name: 'FileRead', input: { file_path: join(workspace, '.env') } })).toBe(expected);
  });
});

describe('execution and transition matrix', () => {
  it.each([
    { mode: 'ask', bounded: false, approved: false, executes: false, error: 'Human approval required' },
    { mode: 'ask', bounded: false, approved: true, executes: true },
    { mode: 'auto', bounded: false, approved: false, executes: false, error: 'auto mode' },
    { mode: 'auto', bounded: true, approved: false, executes: true },
    { mode: 'full-access', bounded: false, approved: false, executes: true },
  ] as const)('$mode bounded=$bounded approved=$approved executes=$executes', async scenario => {
    const workspace = tempDir();
    let executions = 0;
    const registry = registryFor(scenario.mode, workspace);
    registry.register(tool('Subject', 'execute', {
      bounded: scenario.bounded,
      execute: async () => { executions++; return { output: 'executed', isError: false }; },
    }));
    const result = await registry.execute(
      { id: 'subject', name: 'Subject', input: {} },
      context(workspace),
      { humanApproved: scenario.approved },
    );
    expect(executions).toBe(scenario.executes ? 1 : 0);
    expect(result.isError).toBe(!scenario.executes);
    if (scenario.error) expect(result.output).toContain(scenario.error);
  });

  it('shares atomic mode transitions with restricted child registries', () => {
    const workspace = tempDir();
    const manager = new PermissionManager('ask');
    const parent = new ToolRegistry({ permissionManager: manager, permissions: emptyPolicy, workspaceRoots: [workspace] });
    parent.register(tool('Read', 'read'));
    parent.register(tool('Exec', 'execute'));
    const child = parent.cloneRestricted(['Exec']);
    const use = { id: 'exec', name: 'Exec', input: {} };

    expect(parent.checkPermission(use)).toBe('ask');
    expect(child.checkPermission(use)).toBe('ask');
    expect(child.listToolNames()).toEqual(['Exec']);
    expect(child.checkPermission({ id: 'read', name: 'Read', input: {} })).toBe('deny');

    parent.setPermissionMode('auto');
    expect(child.getPermissionMode()).toBe('auto');
    expect(child.checkPermission(use)).toBe('deny');

    child.setPermissionMode('yolo');
    expect(parent.getPermissionMode()).toBe('full-access');
    expect(parent.checkPermission(use)).toBe('allow');
  });

  it('tightens parent allowlists for high-risk child tools without overriding the selected profile', () => {
    const workspace = tempDir();
    const manager = new PermissionManager('ask');
    const parent = new ToolRegistry({
      permissionManager: manager,
      permissions: { allowedTools: ['Read', 'Exec'], deniedTools: [], askForTools: [] },
      workspaceRoots: [workspace],
    });
    parent.register(tool('Read', 'read'));
    parent.register(tool('Exec', 'execute'));
    const child = parent.cloneRestricted(['Read', 'Exec']);
    const read = { id: 'read', name: 'Read', input: {} };
    const exec = { id: 'exec', name: 'Exec', input: {} };

    expect(parent.checkPermission(exec)).toBe('allow');
    expect(child.checkPermission(read)).toBe('allow');
    expect(child.checkPermission(exec)).toBe('ask');

    manager.setMode('auto');
    expect(child.checkPermission(exec)).toBe('deny');
    manager.setMode('full-access');
    expect(child.checkPermission(exec)).toBe('allow');
  });
});

describe('permissions.json lifecycle', () => {
  it('creates defaults and deduplicates valid arrays', () => {
    const dataDir = tempDir();
    const defaults = loadPermissions(dataDir);
    expect(existsSync(join(dataDir, 'permissions.json'))).toBe(true);
    expect(defaults.askForTools).toContain('Bash');

    writeFileSync(join(dataDir, 'permissions.json'), JSON.stringify({
      allowedTools: ['Custom', 'Custom'],
      deniedTools: ['Blocked', 'Blocked'],
      askForTools: ['Prompt'],
    }));
    const loaded = loadPermissions(dataDir);
    expect(loaded.allowedTools).toEqual(['Custom']);
    expect(loaded.deniedTools).toEqual(['Blocked']);
    expect(loaded.askForTools).toEqual(['Prompt']);
  });

  it.each([
    ['{not-json', 'valid JSON'],
    [JSON.stringify([]), 'JSON object'],
    [JSON.stringify({ allowedTools: 'invalid' }), 'allowedTools'],
    [JSON.stringify({ deniedTools: [1] }), 'deniedTools'],
    [JSON.stringify({ askForTools: [''] }), 'askForTools'],
  ])('fails closed for an invalid existing permissions file', (content, message) => {
    const dataDir = tempDir();
    writeFileSync(join(dataDir, 'permissions.json'), content);
    expect(() => loadPermissions(dataDir)).toThrow(message);
  });

  it('leaves the registry uninitialized when permission configuration is invalid', () => {
    const dataDir = tempDir();
    writeFileSync(join(dataDir, 'permissions.json'), '{not-json');
    const registry = new ToolRegistry({ workspaceRoots: [dataDir] });
    registry.register(tool('Read', 'read'));
    expect(() => registry.initPermissions(dataDir)).toThrow('valid JSON');
    expect(registry.checkPermission({ id: 'read', name: 'Read', input: {} })).toBe('deny');
  });

  it('moves a tool from ask to allow without overriding an explicit deny', () => {
    const dataDir = tempDir();
    savePermissions(dataDir, {
      allowedTools: [], deniedTools: ['Bash'], askForTools: ['Bash'],
    });
    addToAllowlist(dataDir, 'Bash');
    const loaded = loadPermissions(dataDir);
    expect(loaded.allowedTools).toContain('Bash');
    expect(loaded.askForTools).not.toContain('Bash');
    expect(loaded.deniedTools).toContain('Bash');
  });

  it('does not leak allowlist mutations into defaults for another data directory', () => {
    const first = tempDir();
    const second = tempDir();
    addToAllowlist(first, 'CustomExec');
    expect(loadPermissions(first).allowedTools).toContain('CustomExec');
    expect(loadPermissions(second).allowedTools).not.toContain('CustomExec');
  });

  it('repairs an allow-and-ask conflict when the user explicitly allowlists a tool', () => {
    const dataDir = tempDir();
    savePermissions(dataDir, {
      allowedTools: ['Bash'], deniedTools: [], askForTools: ['Bash'],
    });
    addToAllowlist(dataDir, 'Bash');
    const loaded = loadPermissions(dataDir);
    expect(loaded.allowedTools).toContain('Bash');
    expect(loaded.askForTools).not.toContain('Bash');
  });
});

const noopHooks = { preToolUse: async () => ({ blocked: false }), postToolUse: async () => {} };
const noopCompressor = { checkAndCompress: async () => ({ compressed: false }) };
const noopErrorRecovery = { executeWithRetry: async <T>(fn: () => Promise<T>) => fn(), handleApiError: async () => false };
const noopContext = { build: async () => ['test context'] };

function oneToolCallProvider(name: string): Provider {
  let calls = 0;
  return {
    name: 'permission-matrix-provider',
    async *stream() {
      calls++;
      if (calls === 1) {
        yield { type: 'content_block_start', content_block: { type: 'tool_use', id: 'call-1', name, input: {} } } as StreamChunk;
        yield { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } } as StreamChunk;
        yield { type: 'content_block_stop' } as StreamChunk;
      } else {
        yield { type: 'content_block_start', content_block: { type: 'text', text: 'done' } } as StreamChunk;
        yield { type: 'content_block_stop' } as StreamChunk;
      }
      yield { type: 'message_stop' } as StreamChunk;
    },
  };
}

describe('engine approval event matrix', () => {
  it.each([
    { mode: 'ask', bounded: false, response: undefined, asks: 1, executes: 0 },
    { mode: 'ask', bounded: false, response: false, asks: 1, executes: 0 },
    { mode: 'ask', bounded: false, response: true, asks: 1, executes: 1 },
    { mode: 'auto', bounded: false, response: undefined, asks: 0, executes: 0 },
    { mode: 'auto', bounded: true, response: undefined, asks: 0, executes: 1 },
    { mode: 'full-access', bounded: false, response: undefined, asks: 0, executes: 1 },
  ] as const)('$mode bounded=$bounded response=$response asks=$asks executes=$executes', async scenario => {
    const workspace = tempDir();
    let executions = 0;
    const registry = registryFor(scenario.mode, workspace);
    registry.register(tool('Subject', 'execute', {
      bounded: scenario.bounded,
      execute: async () => { executions++; return { output: 'executed', isError: false }; },
    }));
    const messages: Message[] = [{ role: 'user', content: 'run it' }];
    const events: EngineEvent[] = [];
    const options = scenario.response === undefined
      ? {}
      : { onPermissionAsk: async () => scenario.response };

    for await (const event of createEngine(
      messages,
      oneToolCallProvider('Subject'),
      registry,
      noopContext,
      noopHooks,
      noopCompressor,
      noopErrorRecovery,
      options,
    )) events.push(event);

    expect(events.filter(event => event.type === 'permission_ask')).toHaveLength(scenario.asks);
    expect(events.filter(event => event.type === 'tool_use')).toHaveLength(scenario.executes);
    const results = events.filter((event): event is Extract<EngineEvent, { type: 'tool_result' }> => event.type === 'tool_result');
    expect(results).toHaveLength(1);
    expect(results[0].isError).toBe(scenario.executes === 0);
    if (!scenario.executes) expect(results[0].durationMs).toBe(0);
    expect(executions).toBe(scenario.executes);
    expect(JSON.stringify(messages)).toContain(scenario.executes ? 'executed' : 'Permission denied');
  });
});
