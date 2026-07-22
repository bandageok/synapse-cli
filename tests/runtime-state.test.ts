import { describe, expect, it, vi } from 'vitest';
import { switchRuntimeModel } from '../src/core/RuntimeState.js';
import type { Provider } from '../src/providers/base.js';

describe('runtime model state', () => {
  it('updates the provider, identity context, and compressor as one operation', () => {
    const provider = {
      name: 'gateway',
      stream: vi.fn(),
      setModel: vi.fn(),
    } as unknown as Provider;
    const context = { setRuntimeModel: vi.fn() };
    const compressor = { setModel: vi.fn() };

    const result = switchRuntimeModel(
      ' new-model ',
      provider,
      context as never,
      compressor as never,
    );

    expect(result).toBe('new-model');
    expect(provider.setModel).toHaveBeenCalledWith('new-model');
    expect(context.setRuntimeModel).toHaveBeenCalledWith('new-model');
    expect(compressor.setModel).toHaveBeenCalledWith('new-model');
  });

  it('fails instead of changing only the display for an immutable provider', () => {
    const provider = { name: 'immutable' } as Provider;
    expect(() => switchRuntimeModel(provider.name, provider, {} as never, {} as never))
      .toThrow('does not support runtime model switching');
  });
});
