import { describe, it, expect } from 'vitest';
import { CommandRegistry } from '../src/commands/registry.js';
import { helpCommand } from '../src/commands/builtin/help.js';
import { clearCommand } from '../src/commands/builtin/clear.js';
import { modelCommand } from '../src/commands/builtin/model.js';
import { costCommand } from '../src/commands/builtin/cost.js';
import { memoryCommand } from '../src/commands/builtin/memory.js';
import { permissionsCommand } from '../src/commands/builtin/permissions.js';
import { detailsCommand } from '../src/commands/builtin/details.js';
import { statusCommand } from '../src/commands/builtin/status.js';
import { resumeCommand } from '../src/commands/builtin/resume.js';
import type { PermissionMode } from '../src/core/types.js';

const mockDeps = {
  dataDir: '/tmp',
  model: 'test-model',
  setModel: () => {},
  clearOutput: () => {},
  addOutput: () => {},
  messages: [],
  resetMessages: () => {},
  turnCount: 0,
};

describe('CommandRegistry', () => {
  it('registers and lists commands', () => {
    const reg = new CommandRegistry();
    reg.register(helpCommand);
    reg.register(clearCommand);
    expect(reg.list()).toHaveLength(2);
  });

  it('handles unknown command', async () => {
    const reg = new CommandRegistry();
    const result = await reg.execute('/unknown', mockDeps);
    expect(result.handled).toBe(true);
    expect(result.output).toContain('Unknown command');
  });

  it('ignores non-slash input', async () => {
    const reg = new CommandRegistry();
    const result = await reg.execute('hello', mockDeps);
    expect(result.handled).toBe(false);
  });

  it('executes help command', async () => {
    const reg = new CommandRegistry();
    reg.register(helpCommand);
    const result = await reg.execute('/help', mockDeps);
    expect(result.handled).toBe(true);
    expect(result.output).toContain('Commands');
  });

  it('model command shows current', async () => {
    const reg = new CommandRegistry();
    reg.register(modelCommand);
    const result = await reg.execute('/model', mockDeps);
    expect(result.output).toContain('test-model');
  });

  it('model command switches model', async () => {
    const reg = new CommandRegistry();
    reg.register(modelCommand);
    let newModel = '';
    const deps = { ...mockDeps, setModel: (m: string) => { newModel = m; } };
    const result = await reg.execute('/model new-model', deps);
    expect(newModel).toBe('new-model');
    expect(result.output).toContain('switched');
  });

  it('reports estimated usage without inventing provider billing', async () => {
    const reg = new CommandRegistry();
    reg.register(costCommand);
    const result = await reg.execute('/usage', {
      ...mockDeps,
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(result.output).toContain('Session Usage');
    expect(result.output).toContain('Token count is estimated');
    expect(result.output).not.toContain('USD');
    expect(result.output).not.toContain('MiniMax');
  });

  it('describes memory reload as live instead of clearing a fake cache', async () => {
    const reg = new CommandRegistry();
    reg.register(memoryCommand);
    const result = await reg.execute('/memory reload', mockDeps);
    expect(result.output).toContain('already live');
    expect(result.output).not.toContain('cache cleared');
  });

  it('does not merge a resumed transcript into the active session identity', async () => {
    const reg = new CommandRegistry();
    reg.register(resumeCommand);
    const result = await reg.execute('/resume 1', mockDeps);
    expect(result.output).toContain('separate session identity');
    expect(result.output).toContain('synapse resume');
  });

  it('aliases work', async () => {
    const reg = new CommandRegistry();
    reg.register(helpCommand);
    const result = await reg.execute('/h', mockDeps);
    expect(result.handled).toBe(true);
  });

  it('switches the current session permission profile', async () => {
    const reg = new CommandRegistry();
    reg.register(permissionsCommand);
    let mode: PermissionMode = 'ask';
    const deps = {
      ...mockDeps,
      permissionMode: mode,
      setPermissionMode: (next: PermissionMode) => {
        mode = next;
        return next;
      },
    };

    const result = await reg.execute('/permissions yolo', deps);

    expect(mode).toBe('full-access');
    expect(result.output).toContain('Approval policy: never');
    expect(result.output).toContain('Full access runs host commands without approval prompts');
  });

  it.each([
    ['ask', 'on-request', 'host-after-approval'],
    ['auto', 'never', 'strict-workspace'],
    ['full-access', 'never', 'host'],
  ] as const)('reports the complete session profile after switching to %s', async (requested, approval, isolation) => {
    const reg = new CommandRegistry();
    reg.register(permissionsCommand);
    let mode: PermissionMode = 'ask';
    const result = await reg.execute(`/permissions ${requested}`, {
      ...mockDeps,
      permissionMode: mode,
      setPermissionMode: next => {
        mode = next === 'workspace-auto' ? 'auto' : next === 'yolo' ? 'full-access' : next;
        return mode;
      },
    });
    expect(mode).toBe(requested);
    expect(result.output).toContain(`Approval policy: ${approval}`);
    expect(result.output).toContain(`Shell isolation: ${isolation}`);
    expect(result.output?.includes('Warning:')).toBe(requested === 'full-access');
  });

  it('does not change the session for invalid or unavailable permission switching', async () => {
    const reg = new CommandRegistry();
    reg.register(permissionsCommand);
    let calls = 0;
    const invalid = await reg.execute('/permissions invalid', {
      ...mockDeps,
      permissionMode: 'auto',
      setPermissionMode: mode => { calls++; return mode === 'workspace-auto' ? 'auto' : mode === 'yolo' ? 'full-access' : mode; },
    });
    expect(invalid.output).toContain('Usage:');
    expect(calls).toBe(0);

    const unavailable = await reg.execute('/permissions full-access', { ...mockDeps, permissionMode: 'ask' });
    expect(unavailable.output).toContain('unavailable');
  });

  it('shows the active permission mode in status output', async () => {
    const reg = new CommandRegistry();
    reg.register(statusCommand);
    const result = await reg.execute('/status', { ...mockDeps, permissionMode: 'auto' });
    expect(result.output).toContain('permission mode: auto');
  });

  it('shows, switches, and toggles tool detail mode', async () => {
    const reg = new CommandRegistry();
    reg.register(detailsCommand);
    let mode: 'compact' | 'expanded' = 'compact';
    const deps = () => ({
      ...mockDeps,
      detailsMode: mode,
      setDetailsMode: (next: 'compact' | 'expanded') => {
        mode = next;
        return next;
      },
    });

    expect((await reg.execute('/details', deps())).output).toBe('Tool details: compact');
    expect((await reg.execute('/details expanded', deps())).output).toBe('Tool details: expanded');
    expect(mode).toBe('expanded');
    expect((await reg.execute('/details toggle', deps())).output).toBe('Tool details: compact');
    expect(mode).toBe('compact');
    expect((await reg.execute('/details hidden', deps())).output).toContain('Usage:');
    expect(mode).toBe('compact');
  });

  it('fails clearly when detail switching is unavailable', async () => {
    const reg = new CommandRegistry();
    reg.register(detailsCommand);
    const result = await reg.execute('/details expanded', mockDeps);
    expect(result.output).toContain('unavailable');
  });
});
