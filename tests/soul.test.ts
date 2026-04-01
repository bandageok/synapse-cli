// tests/soul.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SoulLoader } from '../src/soul/SoulLoader.js';
import { MemoryManager } from '../src/soul/MemoryManager.js';
import { DynamicReminder } from '../src/soul/DynamicReminder.js';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SoulLoader', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cclaw-soul-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('loads SOUL.md when it exists', () => {
    writeFileSync(join(dir, 'SOUL.md'), '# Soul\nBe concise.');
    const loader = new SoulLoader(dir);
    expect(loader.load()).toContain('Be concise');
  });

  it('returns empty string when SOUL.md missing', () => {
    const loader = new SoulLoader(dir);
    expect(loader.load()).toBe('');
  });

  it('loads full SOUL.md content', () => {
    const content = '# Soul\nBe helpful.\n## Rules\n- Rule 1\n- Rule 2';
    writeFileSync(join(dir, 'SOUL.md'), content);
    const loader = new SoulLoader(dir);
    expect(loader.load()).toBe(content);
  });
});

describe('MemoryManager', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cclaw-mem-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('enforces 200 line limit', async () => {
    const lines = Array.from({ length: 250 }, (_, i) => `- item ${i}`);
    writeFileSync(join(dir, 'MEMORY.md'), lines.join('\n'));
    const mgr = new MemoryManager(dir);
    await mgr.enforceLimit();
    const result = readFileSync(join(dir, 'MEMORY.md'), 'utf-8');
    expect(result.split('\n').length).toBeLessThanOrEqual(200);
  });

  it('archives overflow to memory/ directory', async () => {
    const lines = Array.from({ length: 250 }, (_, i) => `- item ${i}`);
    writeFileSync(join(dir, 'MEMORY.md'), lines.join('\n'));
    const mgr = new MemoryManager(dir);
    await mgr.enforceLimit();
    const archiveDir = join(dir, 'memory');
    expect(existsSync(archiveDir)).toBe(true);
    const files = readdirSync(archiveDir);
    expect(files.length).toBeGreaterThan(0);
  });

  it('does nothing when under 200 lines', async () => {
    writeFileSync(join(dir, 'MEMORY.md'), '- item 1\n- item 2');
    const mgr = new MemoryManager(dir);
    await mgr.enforceLimit();
    const result = readFileSync(join(dir, 'MEMORY.md'), 'utf-8');
    expect(result).toContain('item 1');
  });

  it('does nothing when MEMORY.md missing', async () => {
    const mgr = new MemoryManager(dir);
    await mgr.enforceLimit(); // should not throw
  });

  it('parses categories from MEMORY.md', () => {
    writeFileSync(join(dir, 'MEMORY.md'), '## [User] profile\n- name: test\n## [Project] status\n- project A\n## [Feedback] prefs\n- be concise');
    const mgr = new MemoryManager(dir);
    const entries = mgr.parseEntries();
    expect(entries).toHaveLength(3);
    expect(entries[0].category).toBe('user');
    expect(entries[1].category).toBe('project');
    expect(entries[2].category).toBe('feedback');
  });

  it('returns empty array when MEMORY.md missing', () => {
    const mgr = new MemoryManager(dir);
    expect(mgr.parseEntries()).toHaveLength(0);
  });

  it('returns empty array when no categories found', () => {
    writeFileSync(join(dir, 'MEMORY.md'), 'just some text without categories');
    const mgr = new MemoryManager(dir);
    expect(mgr.parseEntries()).toHaveLength(0);
  });
});

describe('DynamicReminder', () => {
  it('returns null on turn 1', () => {
    const dr = new DynamicReminder();
    expect(dr.getReminder(1, { id: '1', name: 'Bash', input: {} }, { output: 'ok', isError: false })).toBeNull();
  });

  it('returns null on turn 2', () => {
    const dr = new DynamicReminder();
    expect(dr.getReminder(2, { id: '1', name: 'Bash', input: {} }, { output: 'ok', isError: false })).toBeNull();
  });

  it('returns progress reminder on turn 3', () => {
    const dr = new DynamicReminder();
    const result = dr.getReminder(3, { id: '1', name: 'Bash', input: {} }, { output: 'ok', isError: false });
    expect(result).toContain('Turn 3');
    expect(result).toContain('progress');
  });

  it('returns progress reminder on turn 6', () => {
    const dr = new DynamicReminder();
    const result = dr.getReminder(6, { id: '1', name: 'Echo', input: {} }, { output: 'ok', isError: false });
    expect(result).toContain('Turn 6');
  });

  it('returns root cause reminder on bash error', () => {
    const dr = new DynamicReminder();
    const result = dr.getReminder(1, { id: '1', name: 'Bash', input: {} }, { output: 'fail', isError: true });
    expect(result).toContain('root cause');
  });

  it('returns null on bash success', () => {
    const dr = new DynamicReminder();
    expect(dr.getReminder(1, { id: '1', name: 'Bash', input: {} }, { output: 'ok', isError: false })).toBeNull();
  });

  it('returns verify reminder on FileEdit success', () => {
    const dr = new DynamicReminder();
    const result = dr.getReminder(1, { id: '1', name: 'FileEdit', input: {} }, { output: 'ok', isError: false });
    expect(result).toContain('Verify');
  });

  it('returns verify reminder on FileWrite success', () => {
    const dr = new DynamicReminder();
    const result = dr.getReminder(1, { id: '1', name: 'FileWrite', input: {} }, { output: 'ok', isError: false });
    expect(result).toContain('Verify');
  });

  it('returns no-fabrication reminder on WebSearch', () => {
    const dr = new DynamicReminder();
    const result = dr.getReminder(1, { id: '1', name: 'WebSearch', input: {} }, { output: 'results', isError: false });
    expect(result).toContain('Do not infer');
  });

  it('returns no-fabrication reminder on Grep', () => {
    const dr = new DynamicReminder();
    const result = dr.getReminder(1, { id: '1', name: 'Grep', input: {} }, { output: 'matches', isError: false });
    expect(result).toContain('Do not infer');
  });

  it('returns no-fabrication reminder on Glob', () => {
    const dr = new DynamicReminder();
    const result = dr.getReminder(1, { id: '1', name: 'Glob', input: {} }, { output: 'files', isError: false });
    expect(result).toContain('Do not infer');
  });
});
