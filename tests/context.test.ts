// tests/context.test.ts
// ContextBuilder: load, include, frontmatter, soul injection
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ContextBuilder } from '../src/core/Context.js';
import { SoulLoader } from '../src/soul/SoulLoader.js';

describe('ContextBuilder', () => {
  let tmpDir: string;
  let sl: SoulLoader;

  beforeEach(() => {
    tmpDir = join(tmpdir(), 'cclaw-ctx-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    sl = new SoulLoader(tmpDir);
  });

  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('instantiates and builds basic context', async () => {
    const cb = new ContextBuilder({ dataDir: tmpDir, cwd: tmpDir, soulLoader: sl });
    const result = await cb.build(0);
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it('includes SOUL.md when present', async () => {
    writeFileSync(join(tmpDir, 'SOUL.md'), '# test soul', 'utf-8');
    const cb = new ContextBuilder({ dataDir: tmpDir, cwd: tmpDir, soulLoader: sl });
    const result = await cb.build(0);
    expect(result.some((p: string) => p.includes('test soul'))).toBe(true);
  });

  it('supports additional directories', async () => {
    const otherDir = join(tmpDir, 'other');
    mkdirSync(join(otherDir, '.cclaw'), { recursive: true });
    writeFileSync(join(otherDir, '.cclaw', 'SOUL.md'), '# other soul', 'utf-8');
    const cb = new ContextBuilder({ dataDir: tmpDir, cwd: otherDir, soulLoader: sl, additionalDirs: [otherDir] });
    const result = await cb.build(0);
    expect(result).toBeDefined();
  });
});
