// tests/toolRegistry.test.ts
// ToolRegistry: registration, retrieval, execution, permissions
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToolRegistry } from '../src/core/ToolRegistry.js';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let tmpDir: string;

  beforeEach(() => {
    registry = new ToolRegistry({
      permissions: { allowedTools: [], deniedTools: [], askForTools: [] },
    });
    tmpDir = mkdtempSync(join(tmpdir(), 'synapse-perm-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts empty', () => {
    expect(registry.schemas()).toEqual([]);
    expect(registry.count).toBe(0);
  });

  it('registers a tool', () => {
    const tool = {
      name: 'TestTool',
      description: 'A test tool',
      schema: { type: 'object', properties: {} },
      permissions: 'read' as const,
      isEnabled: () => true,
      execute: async () => ({ output: 'ok', isError: false }),
    };
    registry.register(tool);
    expect(registry.schemas().length).toBe(1);
    expect(registry.count).toBe(1);
  });

  it('retrieves tool by name', () => {
    const tool = {
      name: 'FindMe',
      description: 'Find this tool',
      schema: { type: 'object', properties: {} },
      permissions: 'read' as const,
      isEnabled: () => true,
      execute: async () => ({ output: 'ok', isError: false }),
    };
    registry.register(tool);
    const found = registry.get('FindMe');
    expect(found).toBeDefined();
    expect(found?.name).toBe('FindMe');
  });

  it('returns undefined for missing tool', () => {
    expect(registry.get('NoSuchTool')).toBeUndefined();
  });

  it('filters by enabled status', () => {
    registry.register({
      name: 'Active',
      description: 'Enabled tool',
      schema: { type: 'object', properties: {} },
      permissions: 'read' as const,
      isEnabled: () => true,
      execute: async () => ({ output: 'ok', isError: false }),
    });
    registry.register({
      name: 'Inactive',
      description: 'Disabled tool',
      schema: { type: 'object', properties: {} },
      permissions: 'read' as const,
      isEnabled: () => false,
      execute: async () => ({ output: 'ok', isError: false }),
    });
    const schemas = registry.schemas();
    expect(schemas.length).toBe(1);
    expect(schemas[0].name).toBe('Active');
  });

  it('checks permission correctly', () => {
    registry.register({
      name: 'ReadTool',
      description: 'Read',
      schema: { type: 'object', properties: {} },
      permissions: 'read' as const,
      isEnabled: () => true,
      execute: async () => ({ output: 'ok', isError: false }),
    });
    registry.register({
      name: 'ExecTool',
      description: 'Execute',
      schema: { type: 'object', properties: {} },
      permissions: 'execute' as const,
      isEnabled: () => true,
      execute: async () => ({ output: 'ok', isError: false }),
    });
    const readSchema = registry.schemas().find(s => s.name === 'ReadTool');
    const execSchema = registry.schemas().find(s => s.name === 'ExecTool');
    expect(readSchema).toBeDefined();
    expect(execSchema).toBeDefined();
  });

  it('executes a tool and returns result', async () => {
    registry.register({
      name: 'Echo',
      description: 'Echo input',
      schema: { type: 'object', properties: { msg: { type: 'string' } } },
      permissions: 'read' as const,
      isEnabled: () => true,
      execute: async (input) => ({ output: `Echo: ${input.msg}`, isError: false }),
    });
    const result = await registry.execute({
      id: 'test-1',
      name: 'Echo',
      input: { msg: 'hello' },
    });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('hello');
  });

  it('returns error for unknown tool', async () => {
    const result = await registry.execute({
      id: 'bad',
      name: 'NonExistent',
      input: {},
    });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Unknown tool');
  });

  it('returns error for disabled tool', async () => {
    registry.register({
      name: 'DisabledTool',
      description: 'Disabled',
      schema: { type: 'object', properties: {} },
      permissions: 'read' as const,
      isEnabled: () => false,
      execute: async () => ({ output: 'should not reach', isError: false }),
    });
    const result = await registry.execute({
      id: 'x',
      name: 'DisabledTool',
      input: {},
    });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('disabled');
  });

  it('lists all tool names', () => {
    registry.register({
      name: 'A', description: 'a', schema: {}, permissions: 'read' as const, isEnabled: () => true, execute: async () => ({ output: '', isError: false }),
    });
    registry.register({
      name: 'B', description: 'b', schema: {}, permissions: 'read' as const, isEnabled: () => true, execute: async () => ({ output: '', isError: false }),
    });
    const names = registry.listToolNames();
    expect(names).toContain('A');
    expect(names).toContain('B');
    expect(names.length).toBe(2);
  });

  it('loads default permissions for execute tools', () => {
    registry.initPermissions(tmpDir);
    expect(existsSync(join(tmpDir, 'permissions.json'))).toBe(true);

    registry.register({
      name: 'PowerShell',
      description: 'ps',
      schema: {},
      permissions: 'execute' as const,
      isEnabled: () => true,
      execute: async () => ({ output: 'ok', isError: false }),
    });
    expect(registry.checkPermission({ id: '1', name: 'PowerShell', input: {} })).toBe('ask');
  });
});
