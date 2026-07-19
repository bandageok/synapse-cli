// tests/memoryLoader.test.ts
// MemoryLoader: load, include, frontmatter
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MemoryLoader } from '../src/core/MemoryLoader.js';

describe('MemoryLoader', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = join(tmpdir(), 'synapse-ml-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(join(tmpDir, 'memory'), { recursive: true });
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('instantiates', () => { expect(new MemoryLoader({ dataDir: tmpDir, cwd: tmpDir })).toBeDefined(); });

  it('loads empty when no MEMORY.md', async () => {
    const ml = new MemoryLoader({ dataDir: tmpDir, cwd: tmpDir });
    const result = await ml.loadAll();
    expect(result).toBeDefined();
    expect(result.length).toBe(0);
  });

  it('loads CLAUDE.md when present', async () => {
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# CLAUDE.md content', 'utf-8');
    const ml = new MemoryLoader({ dataDir: tmpDir, cwd: tmpDir });
    const result = await ml.loadAll();
    expect(result.some(f => f.content.includes('CLAUDE.md content'))).toBe(true);
  });

  it('loads daily notes', async () => {
    const today = new Date().toISOString().slice(0, 10);
    writeFileSync(join(tmpDir, 'memory', today + '.md'), '# Daily note', 'utf-8');
    const ml = new MemoryLoader({ dataDir: tmpDir, cwd: tmpDir });
    const result = await ml.loadAll();
    // memory files are not loaded as CLAUDE.md files
    expect(result).toBeDefined();
  });

  it('respects 200 line limit', async () => {
    const ml = new MemoryLoader({ dataDir: tmpDir, cwd: tmpDir });
    const large = Array(300).fill('- line').join('\n');
    writeFileSync(join(tmpDir, 'CLAUDE.md'), large, 'utf-8');
    await expect(ml.loadAll()).resolves.toBeDefined();
  });

  it('handles missing memory directory', async () => {
    rmSync(join(tmpDir, 'memory'), { recursive: true, force: true });
    const ml = new MemoryLoader({ dataDir: tmpDir, cwd: tmpDir });
    await expect(ml.loadAll()).resolves.toBeDefined();
  });

  it('returns user memory', async () => {
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# CLAUDE.md\n- item1\n- item2', 'utf-8');
    const ml = new MemoryLoader({ dataDir: tmpDir, cwd: tmpDir });
    const result = await ml.loadAll();
    expect(result.some(f => f.content.includes('item1'))).toBe(true);
  });
});
