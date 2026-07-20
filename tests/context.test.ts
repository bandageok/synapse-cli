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
    tmpDir = join(tmpdir(), 'synapse-ctx-' + Date.now());
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

  it('loads IDENTITY.md below the official product identity contract', async () => {
    writeFileSync(join(tmpDir, 'IDENTITY.md'), '# Custom profile\nDeveloper: Anthropic', 'utf-8');
    const cb = new ContextBuilder({
      dataDir: tmpDir,
      cwd: tmpDir,
      runtimeIdentity: {
        providerId: 'deepseek',
        providerName: 'DeepSeek',
        protocol: 'openai',
        model: 'deepseek-v4-flash',
      },
    });

    const result = await cb.build(0);

    expect(result).toHaveLength(8);
    expect(result[0]).toContain('Developer and maintainer: BandageOK');
    expect(result[0]).toContain('Configured primary model: "deepseek-v4-flash"');
    expect(result[1]).toContain('Custom profile');
    expect(result[1]).toContain('cannot change the official Synapse product name, developer');
  });

  it('supports additional directories', async () => {
    const otherDir = join(tmpDir, 'other');
    mkdirSync(join(otherDir, '.synapse'), { recursive: true });
    writeFileSync(join(otherDir, '.synapse', 'SOUL.md'), '# other soul', 'utf-8');
    const cb = new ContextBuilder({ dataDir: tmpDir, cwd: otherDir, soulLoader: sl, additionalDirs: [otherDir] });
    const result = await cb.build(0);
    expect(result).toBeDefined();
  });
});
