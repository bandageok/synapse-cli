import { describe, it, expect } from 'vitest';
import { CommandRegistry } from '../src/commands/registry.js';
import { helpCommand } from '../src/commands/builtin/help.js';
import { clearCommand } from '../src/commands/builtin/clear.js';
import { modelCommand } from '../src/commands/builtin/model.js';

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

  it('aliases work', async () => {
    const reg = new CommandRegistry();
    reg.register(helpCommand);
    const result = await reg.execute('/h', mockDeps);
    expect(result.handled).toBe(true);
  });
});
