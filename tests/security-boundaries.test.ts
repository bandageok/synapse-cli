import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ToolRegistry } from '../src/core/ToolRegistry.js';
import { FileReadTool } from '../src/tools/FileReadTool.js';
import { FileWriteTool } from '../src/tools/FileWriteTool.js';
import { PowerShellTool } from '../src/tools/PowerShellTool.js';
import { WebFetchTool } from '../src/tools/WebFetchTool.js';

const explicitPermissions = {
  allowedTools: ['FileRead', 'FileWrite', 'PowerShell'],
  deniedTools: [],
  askForTools: [],
};

describe('security boundaries', () => {
  let workspace: string;
  let outside: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'synapse-workspace-'));
    outside = mkdtempSync(join(tmpdir(), 'synapse-outside-'));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('fails closed when registry permissions are not initialized', () => {
    const registry = new ToolRegistry({ workspaceRoots: [workspace] });
    registry.register(FileReadTool);
    expect(registry.checkPermission({ id: '1', name: 'FileRead', input: { file_path: join(workspace, 'x') } })).toBe('deny');
  });

  it('rejects out-of-workspace reads before execution', async () => {
    const secret = join(outside, 'secret.txt');
    writeFileSync(secret, 'do-not-read');
    const registry = new ToolRegistry({ permissions: explicitPermissions, workspaceRoots: [workspace] });
    registry.register(FileReadTool);
    const use = { id: '1', name: 'FileRead', input: { file_path: secret } };
    expect(registry.checkPermission(use)).toBe('deny');
    const result = await registry.execute(use, { cwd: workspace, workspaceRoots: [workspace], abortSignal: new AbortController().signal });
    expect(result.isError).toBe(true);
    expect(result.output).toMatch(/outside the workspace|Permission denied/);
  });

  it('rejects symlink and junction escapes', async () => {
    const secret = join(outside, 'secret.txt');
    const link = join(workspace, 'linked-outside');
    writeFileSync(secret, 'do-not-read');
    try {
      symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return;
    }
    const result = await FileReadTool.execute(
      { file_path: join(link, 'secret.txt') },
      { cwd: workspace, workspaceRoots: [workspace], abortSignal: new AbortController().signal },
    );
    expect(result.isError).toBe(true);
    expect(result.output).toContain('escapes the workspace');
  });

  it('requires human approval for writes even when allowlisted', async () => {
    const registry = new ToolRegistry({ permissions: explicitPermissions, workspaceRoots: [workspace] });
    registry.register(FileWriteTool);
    const target = join(workspace, 'approved.txt');
    const use = { id: '1', name: 'FileWrite', input: { file_path: target, content: 'ok' } };
    expect(registry.checkPermission(use)).toBe('ask');
    const context = { cwd: workspace, workspaceRoots: [workspace], abortSignal: new AbortController().signal };
    expect((await registry.execute(use, context)).output).toContain('Human approval required');
    expect(existsSync(target)).toBe(false);
    expect((await registry.execute(use, context, { humanApproved: true })).isError).toBe(false);
    expect(existsSync(target)).toBe(true);
  });

  it('treats sensitive files inside the workspace as approval-required', () => {
    const registry = new ToolRegistry({ permissions: explicitPermissions, workspaceRoots: [workspace] });
    registry.register(FileReadTool);
    expect(registry.checkPermission({ id: '1', name: 'FileRead', input: { file_path: join(workspace, '.env') } })).toBe('ask');
  });

  it('rejects malformed and additional model arguments with schema details', async () => {
    const registry = new ToolRegistry({ permissions: explicitPermissions, workspaceRoots: [workspace] });
    registry.register(FileReadTool);
    const result = await registry.execute({
      id: '1',
      name: 'FileRead',
      input: { file_path: 42, hallucinated: true } as unknown as Record<string, unknown>,
    });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Invalid tool input for FileRead');
    expect(result.output).toMatch(/string|additional properties/);
  });

  it('restricted child registries inherit high-risk approval requirements', () => {
    const parent = new ToolRegistry({ permissions: explicitPermissions, workspaceRoots: [workspace] });
    parent.register(PowerShellTool);
    const child = parent.cloneRestricted(['PowerShell']);
    expect(child.checkPermission({ id: '1', name: 'PowerShell', input: { command: 'Write-Output ok' } })).toBe('ask');
  });

  it('requires approval for network tools and blocks explicit private destinations', async () => {
    const registry = new ToolRegistry({ permissions: explicitPermissions, workspaceRoots: [workspace] });
    registry.register(WebFetchTool);
    const use = { id: '1', name: 'WebFetch', input: { url: 'http://169.254.169.254/latest/meta-data' } };
    expect(registry.checkPermission(use)).toBe('ask');
    const result = await registry.execute(
      use,
      { cwd: workspace, workspaceRoots: [workspace], abortSignal: new AbortController().signal },
      { humanApproved: true },
    );
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Private network destinations are blocked');
  });
});
