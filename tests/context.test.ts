// tests/context.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextBuilder } from '../src/core/Context.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ContextBuilder', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cclaw-ctx-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('builds 6 layers', async () => {
    const builder = new ContextBuilder({ dataDir: tempDir, cwd: tempDir });
    const layers = await builder.build(1);
    expect(layers).toHaveLength(6);
  });

  it('layer 1 contains default prompt', async () => {
    const builder = new ContextBuilder({ dataDir: tempDir, cwd: tempDir });
    const layers = await builder.build(1);
    expect(layers[0]).toContain('C.C.Claw');
    expect(layers[0]).toContain('concise');
  });

  it('layer 2 loads SOUL.md when it exists', async () => {
    writeFileSync(join(tempDir, 'SOUL.md'), '# Soul\nBe concise and direct.');
    const builder = new ContextBuilder({ dataDir: tempDir, cwd: tempDir });
    const layers = await builder.build(1);
    expect(layers[1]).toContain('Be concise and direct');
  });

  it('layer 2 is empty when SOUL.md missing', async () => {
    const builder = new ContextBuilder({ dataDir: tempDir, cwd: tempDir });
    const layers = await builder.build(1);
    expect(layers[1]).toBe('');
  });

  it('layer 3 contains memory mechanics instructions', async () => {
    const builder = new ContextBuilder({ dataDir: tempDir, cwd: tempDir });
    const layers = await builder.build(1);
    expect(layers[2]).toContain('Memory System');
    expect(layers[2]).toContain('MEMORY.md');
  });

  it('layer 4 loads project .cclaw.md', async () => {
    writeFileSync(join(tempDir, '.cclaw.md'), '# Project\nUse TypeScript');
    const builder = new ContextBuilder({ dataDir: tempDir, cwd: tempDir });
    const layers = await builder.build(1);
    expect(layers[3]).toContain('TypeScript');
  });

  it('layer 4 loads MEMORY.md when under 200 lines', async () => {
    writeFileSync(join(tempDir, 'MEMORY.md'), '- User likes concise answers\n- Project uses React');
    const builder = new ContextBuilder({ dataDir: tempDir, cwd: tempDir });
    const layers = await builder.build(1);
    expect(layers[3]).toContain('Long-Term Memory');
    expect(layers[3]).toContain('concise');
  });

  it('layer 4 skips MEMORY.md when over 200 lines', async () => {
    const lines = Array.from({ length: 250 }, (_, i) => `- item ${i}`);
    writeFileSync(join(tempDir, 'MEMORY.md'), lines.join('\n'));
    const builder = new ContextBuilder({ dataDir: tempDir, cwd: tempDir });
    const layers = await builder.build(1);
    expect(layers[3]).not.toContain('Long-Term Memory');
  });

  it('layer 5 contains system info', async () => {
    const builder = new ContextBuilder({ dataDir: tempDir, cwd: tempDir });
    const layers = await builder.build(1);
    expect(layers[4]).toContain('Working directory');
    expect(layers[4]).toContain('Platform');
  });

  it('layer 6 is empty on turn 1', async () => {
    const builder = new ContextBuilder({ dataDir: tempDir, cwd: tempDir });
    const layers = await builder.build(1);
    expect(layers[5]).toBe('');
  });

  it('layer 6 has reminder on turn 3', async () => {
    const builder = new ContextBuilder({ dataDir: tempDir, cwd: tempDir });
    const layers = await builder.build(3);
    expect(layers[5]).toContain('Turn 3');
    expect(layers[5]).toContain('progress');
  });

  it('layer 6 is empty on turn 2', async () => {
    const builder = new ContextBuilder({ dataDir: tempDir, cwd: tempDir });
    const layers = await builder.build(2);
    expect(layers[5]).toBe('');
  });
});
