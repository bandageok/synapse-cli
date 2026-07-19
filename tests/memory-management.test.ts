import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  appendLongTermMemory,
  exportMemory,
  inspectMemory,
  pruneMemory,
  readManagedMemoryFile,
  searchMemory,
} from '../src/memory/management.js';

describe('Memory management', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'synapse-memory-'));
    mkdirSync(join(dataDir, 'memory'), { recursive: true });
    mkdirSync(join(dataDir, '.learnings'), { recursive: true });
    mkdirSync(join(dataDir, 'sessions'), { recursive: true });
    writeFileSync(join(dataDir, 'MEMORY.md'), '# MEMORY.md\n\n- Prefers TypeScript\n');
    writeFileSync(join(dataDir, 'memory', '2026-07-19.md'), '# Daily\nFixed provider routing\n');
    writeFileSync(join(dataDir, '.learnings', 'LEARNINGS.md'), '# Learnings\nUse atomic writes\n');
    writeFileSync(join(dataDir, 'sessions', 'session.json'), JSON.stringify({ secret: 'session-only phrase' }));
    writeFileSync(join(dataDir, '.env'), 'SYNAPSE_API_KEY=do-not-export\n');
  });

  afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

  it('inspects all memory sources and reports context injection', () => {
    const result = inspectMemory(dataDir);
    expect(result.totalFiles).toBe(4);
    expect(result.files.find(file => file.relativePath === 'MEMORY.md')?.injected).toBe(true);
    expect(result.sources.find(source => source.source === 'session')?.files).toBe(1);
  });

  it('searches literal text and excludes sessions by default', () => {
    expect(searchMemory(dataDir, 'atomic')).toEqual([
      expect.objectContaining({ path: '.learnings/LEARNINGS.md', line: 2 }),
    ]);
    expect(searchMemory(dataDir, 'session-only')).toHaveLength(0);
    expect(searchMemory(dataDir, 'session-only', { includeSessions: true })).toHaveLength(1);
  });

  it('previews pruning and only deletes after apply is explicit', () => {
    const oldFile = join(dataDir, 'memory', '2026-07-19.md');
    const oldDate = new Date('2020-01-01T00:00:00.000Z');
    utimesSync(oldFile, oldDate, oldDate);
    writeFileSync(join(dataDir, 'memory', 'keep-me.md'), 'not a managed daily filename');
    utimesSync(join(dataDir, 'memory', 'keep-me.md'), oldDate, oldDate);

    const preview = pruneMemory(dataDir, { olderThanDays: 30 });
    expect(preview.applied).toBe(false);
    expect(preview.files.map(file => file.path)).toEqual(['memory/2026-07-19.md']);
    expect(existsSync(oldFile)).toBe(true);

    const applied = pruneMemory(dataDir, { olderThanDays: 30, apply: true });
    expect(applied.applied).toBe(true);
    expect(existsSync(oldFile)).toBe(false);
    expect(existsSync(join(dataDir, 'memory', 'keep-me.md'))).toBe(true);
  });

  it('exports portable memory without configuration secrets or sessions by default', () => {
    const output = join(dataDir, '..', `memory-export-${Date.now()}.json`);
    try {
      const result = exportMemory(dataDir, output);
      const content = readFileSync(output, 'utf-8');
      expect(result.files).toBe(3);
      expect(content).toContain('Prefers TypeScript');
      expect(content).not.toContain('do-not-export');
      expect(content).not.toContain('session-only phrase');
    } finally {
      rmSync(output, { force: true });
    }
  });

  it('appends long-term memory and blocks unmanaged paths', () => {
    const result = appendLongTermMemory(dataDir, 'Always run tests');
    expect(result.lines).toBe(4);
    expect(readFileSync(join(dataDir, 'MEMORY.md'), 'utf-8')).toContain('- Always run tests');
    expect(() => readManagedMemoryFile(dataDir, '../.env')).toThrow('Memory file not found');
  });
});
