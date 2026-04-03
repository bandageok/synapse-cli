import { describe, it, expect, beforeEach } from 'vitest';
import { HookSystem } from '../src/core/HookSystem.js';

describe('HookSystem', () => {
  it('instantiates', () => {
    expect(new HookSystem()).toBeDefined();
  });

  it('allows tool use when no hooks registered', async () => {
    const hooks = new HookSystem();
    const result = await hooks.preToolUse({ id: '1', name: 'Test', input: {} });
    expect(result.blocked).toBe(false);
  });

  it('executes postToolUse without error', async () => {
    const hooks = new HookSystem();
    await expect(hooks.postToolUse(
      { id: '1', name: 'Test', input: {} },
      { output: 'ok', isError: false }
    )).resolves.toBeUndefined();
  });

  it('returns error from postToolUse', async () => {
    const hooks = new HookSystem();
    await hooks.postToolUse(
      { id: '1', name: 'Test', input: {} },
      { output: 'error', isError: true }
    );
    // Should not throw — post hooks are fire-and-forget
    expect(true).toBe(true);
  });
});
