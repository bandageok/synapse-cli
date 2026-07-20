import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PermissionManager, normalizePermissionMode, resolvePermissionModeSelection } from '../src/core/PermissionManager.js';
import { ToolRegistry } from '../src/core/ToolRegistry.js';
import { createBashTool } from '../src/tools/BashTool.js';
import { FileWriteTool } from '../src/tools/FileWriteTool.js';
import { getConfiguredPermissionMode, setConfiguredPermissionMode } from '../src/utils/permissionConfig.js';
import { readSynapseConfig } from '../src/providers/management.js';

const temporary: string[] = [];
const permissions = {
  allowedTools: ['FileWrite', 'Bash', 'PowerShell'],
  deniedTools: [],
  askForTools: ['FileWrite', 'Bash', 'PowerShell'],
};

afterEach(() => {
  while (temporary.length) rmSync(temporary.pop()!, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'synapse-permission-mode-'));
  temporary.push(dir);
  return dir;
}

describe('permission profiles', () => {
  it('normalizes compatibility and yolo aliases', () => {
    expect(normalizePermissionMode('ask')).toBe('ask');
    expect(normalizePermissionMode('workspace-auto')).toBe('auto');
    expect(normalizePermissionMode('yolo')).toBe('full-access');
    expect(normalizePermissionMode('unknown')).toBeNull();
    expect(resolvePermissionModeSelection({ yolo: true }, 'ask')).toBe('full-access');
    expect(() => resolvePermissionModeSelection({ yolo: true, permissionMode: 'auto' })).toThrow('cannot be combined');
  });

  it('switches a shared registry between ask, auto, and full-access', () => {
    const workspace = tempDir();
    const manager = new PermissionManager('ask');
    const registry = new ToolRegistry({ permissions, workspaceRoots: [workspace], permissionManager: manager });
    registry.register(FileWriteTool);
    registry.register(createBashTool());

    const write = { id: 'write', name: 'FileWrite', input: { file_path: join(workspace, 'x.txt'), content: 'ok' } };
    const shell = { id: 'shell', name: 'Bash', input: { command: 'echo ok' } };
    expect(registry.checkPermission(write)).toBe('ask');
    expect(registry.checkPermission(shell)).toBe('ask');

    registry.setPermissionMode('auto');
    expect(manager.getMode()).toBe('auto');
    expect(registry.checkPermission(write)).toBe('allow');
    expect(registry.checkPermission(shell)).toBe('deny');
    expect(registry.permissionDeniedMessage(shell)).toContain('cannot run inside the active workspace-safe boundary');

    registry.setPermissionMode('yolo');
    expect(manager.getMode()).toBe('full-access');
    expect(registry.checkPermission(write)).toBe('allow');
    expect(registry.checkPermission(shell)).toBe('allow');
  });

  it('executes a host shell command without approval only in full-access', async () => {
    const workspace = tempDir();
    const manager = new PermissionManager('ask');
    const registry = new ToolRegistry({ permissions, workspaceRoots: [workspace], permissionManager: manager });
    registry.register(createBashTool({ permissionManager: manager }));
    const use = {
      id: 'bash',
      name: 'Bash',
      input: { command: 'echo PERMISSION_OK' },
    };
    const context = { cwd: workspace, workspaceRoots: [workspace], abortSignal: new AbortController().signal };

    expect((await registry.execute(use, context)).output).toContain('Human approval required');
    manager.setMode('full-access');
    const result = await registry.execute(use, context);
    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('PERMISSION_OK');
  });

  it('keeps explicit denies and dangerous-command checks in full-access', async () => {
    const workspace = tempDir();
    const manager = new PermissionManager('full-access');
    const deniedRegistry = new ToolRegistry({
      permissions: { ...permissions, deniedTools: ['Bash'] },
      workspaceRoots: [workspace],
      permissionManager: manager,
    });
    deniedRegistry.register(createBashTool({ permissionManager: manager }));
    expect(deniedRegistry.checkPermission({ id: 'denied', name: 'Bash', input: { command: 'echo blocked' } })).toBe('deny');

    const registry = new ToolRegistry({ permissions, workspaceRoots: [workspace], permissionManager: manager });
    registry.register(createBashTool({ permissionManager: manager }));
    const result = await registry.execute(
      { id: 'dangerous', name: 'Bash', input: { command: 'rm -rf /' } },
      { cwd: workspace, workspaceRoots: [workspace], abortSignal: new AbortController().signal },
    );
    expect(result).toMatchObject({ isError: true });
    expect(result.output).toContain('Blocked: command matches dangerous pattern');
  });

  it('persists a default mode without replacing provider configuration', () => {
    const dataDir = tempDir();
    writeFileSync(join(dataDir, '.synapse.json'), JSON.stringify({
      provider: 'company-gateway',
      model: 'company-model',
    }), 'utf-8');

    expect(getConfiguredPermissionMode(dataDir)).toBe('ask');
    expect(setConfiguredPermissionMode(dataDir, 'workspace-auto')).toBe('auto');
    expect(readSynapseConfig(dataDir)).toMatchObject({
      provider: 'company-gateway',
      model: 'company-model',
      permissionMode: 'auto',
    });
  });
});
