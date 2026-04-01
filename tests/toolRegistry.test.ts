// tests/toolRegistry.test.ts
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../src/core/ToolRegistry.js';
import type { ToolDef } from '../src/core/types.js';

const mockTool: ToolDef = {
  name: 'Echo',
  description: 'Echoes input',
  schema: { type: 'object', properties: { text: { type: 'string' } } },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input) => ({ output: (input as any).text ?? 'empty', isError: false }),
};

const disabledTool: ToolDef = {
  ...mockTool,
  name: 'Disabled',
  isEnabled: () => false,
};

describe('ToolRegistry', () => {
  it('registers and retrieves tools', () => {
    const registry = new ToolRegistry();
    registry.register(mockTool);
    expect(registry.get('Echo')).toBe(mockTool);
  });

  it('returns undefined for unknown tool', () => {
    const registry = new ToolRegistry();
    expect(registry.get('NonExistent')).toBeUndefined();
  });

  it('returns schemas for enabled tools only', () => {
    const registry = new ToolRegistry();
    registry.register(mockTool);
    registry.register(disabledTool);
    const schemas = registry.schemas();
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe('Echo');
  });

  it('executes a tool and returns result', async () => {
    const registry = new ToolRegistry();
    registry.register(mockTool);
    const result = await registry.execute({
      id: 'test-1',
      name: 'Echo',
      input: { text: 'hello' },
    });
    expect(result.output).toBe('hello');
    expect(result.isError).toBe(false);
  });

  it('returns error for unknown tool', async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute({
      id: 'test-2',
      name: 'NonExistent',
      input: {},
    });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Unknown tool');
  });

  it('returns error for disabled tool', async () => {
    const registry = new ToolRegistry();
    registry.register(disabledTool);
    const result = await registry.execute({
      id: 'test-3',
      name: 'Disabled',
      input: {},
    });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('disabled');
  });

  it('checkPermission returns deny for unknown tool', () => {
    const registry = new ToolRegistry();
    expect(registry.checkPermission({ id: '1', name: 'Unknown', input: {} })).toBe('deny');
  });

  it('checkPermission returns allow for registered tool', () => {
    const registry = new ToolRegistry();
    registry.register(mockTool);
    expect(registry.checkPermission({ id: '1', name: 'Echo', input: {} })).toBe('allow');
  });
});
