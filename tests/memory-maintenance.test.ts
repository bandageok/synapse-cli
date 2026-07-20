import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MemoryMaintenance,
  compactMemoryIndex,
} from '../src/soul/MemoryMaintenance.js';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('compactMemoryIndex', () => {
  const limits = { maxIndexLines: 200, maxIndexBytes: 25_000, maxEntryChars: 80 };

  it('preserves headings while deduplicating entries and blank lines', () => {
    const result = compactMemoryIndex([
      '# MEMORY.md', '', '', '## Project', '- keep this', '- keep this', '', '', '- another',
    ], limits);
    expect(result).toEqual(['# MEMORY.md', '', '## Project', '- keep this', '', '- another']);
  });

  it('truncates only list entries', () => {
    const heading = `## ${'h'.repeat(100)}`;
    const result = compactMemoryIndex([heading, `- ${'x'.repeat(100)}`], limits);
    expect(result[0]).toBe(heading);
    expect(result[1]).toHaveLength(80);
    expect(result[1]).toMatch(/\.\.\.$/);
  });

  it('enforces line and UTF-8 byte limits', () => {
    const result = compactMemoryIndex(
      ['# MEMORY.md', '- 中文内容', '- second', '- third'],
      { maxIndexLines: 3, maxIndexBytes: 30, maxEntryChars: 80 },
    );
    expect(result.length).toBeLessThanOrEqual(3);
    expect(Buffer.byteLength(result.join('\n'), 'utf-8')).toBeLessThanOrEqual(30);
  });
});

describe('MemoryMaintenance', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'synapse-memory-maintenance-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('does not trigger without enough new sessions', () => {
    const maintenance = new MemoryMaintenance(dataDir, {
      minHours: 0,
      minSessions: 1,
      scanThrottleMs: 0,
    });
    expect(maintenance.shouldTrigger()).toBe(false);
  });

  it('uses the legacy completion timestamp during migration', () => {
    writeFileSync(
      join(dataDir, '.dream-lock.json'),
      JSON.stringify({ lastConsolidatedAt: Date.now(), locked: false }),
    );
    const maintenance = new MemoryMaintenance(dataDir, { minHours: 1, minSessions: 0 });
    expect(maintenance.shouldTrigger()).toBe(false);
  });

  it('triggers when the time and session gates pass', () => {
    const sessionsDir = join(dataDir, 'sessions');
    mkdirSync(sessionsDir);
    writeFileSync(join(sessionsDir, 'session-1.json'), '{}');
    const maintenance = new MemoryMaintenance(dataDir, {
      minHours: 0,
      minSessions: 1,
      scanThrottleMs: 0,
    });
    expect(maintenance.shouldTrigger()).toBe(true);
  });

  it('blocks on a live lease and recovers a stale lease', () => {
    const leasePath = join(dataDir, '.memory-maintenance.lock');
    writeFileSync(leasePath, '{}');
    const maintenance = new MemoryMaintenance(dataDir, {
      minHours: 0,
      minSessions: 0,
      leaseTimeoutMs: 1000,
    });
    expect(maintenance.forceTrigger()).toBe(false);

    const old = new Date(Date.now() - 10_000);
    utimesSync(leasePath, old, old);
    expect(maintenance.forceTrigger()).toBe(true);
  });

  it('refuses a concurrent run without changing the live lease', async () => {
    const leasePath = join(dataDir, '.memory-maintenance.lock');
    writeFileSync(leasePath, '{"owner":"other"}');
    const maintenance = new MemoryMaintenance(dataDir, {
      minHours: 0,
      minSessions: 0,
      leaseTimeoutMs: 60_000,
    });
    const result = await maintenance.run();
    expect(result.success).toBe(false);
    expect(result.error).toContain('already running');
    expect(existsSync(leasePath)).toBe(true);
  });

  it('maintains the root MEMORY.md and writes state atomically', async () => {
    const lines = ['# MEMORY.md', '', '## Project'];
    for (let i = 0; i < 220; i++) lines.push(`- item ${i}`);
    writeFileSync(join(dataDir, 'MEMORY.md'), lines.join('\n'));

    const maintenance = new MemoryMaintenance(dataDir, {
      minHours: 0,
      minSessions: 0,
      maxIndexLines: 200,
    });
    const result = await maintenance.run();

    expect(result.success).toBe(true);
    expect(result.indexUpdated).toBe(true);
    expect(readFileSync(join(dataDir, 'MEMORY.md'), 'utf-8').split('\n').filter(Boolean).length)
      .toBeLessThanOrEqual(200);
    expect(existsSync(join(dataDir, 'memory'))).toBe(true);
    expect(existsSync(join(dataDir, '.memory-maintenance.json'))).toBe(true);
    expect(existsSync(join(dataDir, '.memory-maintenance.lock'))).toBe(false);
    expect(existsSync(join(dataDir, 'memory', 'MEMORY.md'))).toBe(false);
  });

  it('leaves a compliant index unchanged', async () => {
    const content = '# MEMORY.md\n\n- Keep project memory local\n';
    writeFileSync(join(dataDir, 'MEMORY.md'), content);
    const maintenance = new MemoryMaintenance(dataDir, { minHours: 0, minSessions: 0 });
    const result = await maintenance.run();
    expect(result.success).toBe(true);
    expect(result.indexUpdated).toBe(false);
    expect(readFileSync(join(dataDir, 'MEMORY.md'), 'utf-8')).toBe(content);
  });

  it('validates unsafe limits at construction time', () => {
    expect(() => new MemoryMaintenance(dataDir, { maxIndexLines: 0 })).toThrow(
      'Memory index limits',
    );
    expect(() => new MemoryMaintenance(dataDir, { maxIndexLines: 1.5 })).toThrow(
      'must be an integer',
    );
  });
});
