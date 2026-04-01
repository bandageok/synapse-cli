// tests/hookSystem.test.ts
import { describe, it, expect } from 'vitest';
import { HookSystem } from '../src/core/HookSystem.js';

describe('HookSystem', () => {
  it('does not block when no hooks configured', async () => {
    const hooks = new HookSystem();
    const result = await hooks.preToolUse({ id: '1', name: 'Bash', input: {} });
    expect(result.blocked).toBe(false);
  });

  it('blocks when hook returns blocked', async () => {
    const hooks = new HookSystem({
      hooks: [{
        event: 'preToolUse',
        tool: 'Bash',
        handler: async () => ({ blocked: true, reason: 'Not allowed' }),
      }],
    });
    const result = await hooks.preToolUse({ id: '1', name: 'Bash', input: {} });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('Not allowed');
  });

  it('ignores hooks for other tools', async () => {
    const hooks = new HookSystem({
      hooks: [{
        event: 'preToolUse',
        tool: 'Bash',
        handler: async () => ({ blocked: true, reason: 'blocked' }),
      }],
    });
    const result = await hooks.preToolUse({ id: '1', name: 'FileRead', input: {} });
    expect(result.blocked).toBe(false);
  });

  it('runs postToolUse hooks', async () => {
    let called = false;
    const hooks = new HookSystem({
      hooks: [{
        event: 'postToolUse',
        handler: async () => { called = true; return { blocked: false }; },
      }],
    });
    await hooks.postToolUse({ id: '1', name: 'Bash', input: {} }, { output: 'ok', isError: false });
    expect(called).toBe(true);
  });

  it('filters postToolUse by tool name', async () => {
    let called = false;
    const hooks = new HookSystem({
      hooks: [{
        event: 'postToolUse',
        tool: 'Bash',
        handler: async () => { called = true; return { blocked: false }; },
      }],
    });
    await hooks.postToolUse({ id: '1', name: 'FileRead', input: {} }, { output: 'ok', isError: false });
    expect(called).toBe(false);
  });
});
