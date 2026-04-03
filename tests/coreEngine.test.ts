// tests/coreEngine.test.ts
// Core Engine module verification
import { describe, it, expect } from 'vitest';

describe('Core Engine', () => {
  it('Engine module loads', async () => {
    const mod = await import('../src/core/Engine.js');
    expect(mod.createEngine).toBeDefined();
    expect(typeof mod.createEngine).toBe('function');
  });

  it('Compressor module loads', async () => {
    const mod = await import('../src/core/Compressor.js');
    expect(mod.Compressor).toBeDefined();
    expect(typeof mod.Compressor).toBe('function');
  });

  it('SessionStore module loads', async () => {
    const mod = await import('../src/core/SessionStore.js');
    expect(mod.SessionStore).toBeDefined();
    expect(typeof mod.SessionStore).toBe('function');
  });

  it('Logger module loads', async () => {
    const mod = await import('../src/core/Logger.js');
    expect(mod.Logger).toBeDefined();
    expect(typeof mod.Logger).toBe('function');
  });
});
