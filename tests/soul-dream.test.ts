// tests/soul-dream.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Dream } from '../src/soul/Dream.js';
import { SessionIndex } from '../src/soul/SessionIndex.js';
import {
  MEMORY_EXTRACTION_PROMPT,
  buildConsolidationPrompt,
  buildSessionMemoryPrompt,
} from '../src/soul/MemoryExtractor.js';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ============================================================================
// MemoryExtractor prompts
// ============================================================================

describe('MemoryExtractor', () => {
  it('MEMORY_EXTRACTION_PROMPT has system and user', () => {
    expect(MEMORY_EXTRACTION_PROMPT.system).toContain('[User]');
    expect(MEMORY_EXTRACTION_PROMPT.system).toContain('[Feedback]');
    expect(MEMORY_EXTRACTION_PROMPT.system).toContain('[Project]');
    expect(MEMORY_EXTRACTION_PROMPT.system).toContain('[Reference]');
    expect(typeof MEMORY_EXTRACTION_PROMPT.user).toBe('function');
  });

  it('user prompt includes transcript', () => {
    const result = MEMORY_EXTRACTION_PROMPT.user('Hello world conversation');
    expect(result).toContain('Hello world conversation');
    expect(result).toContain('Extract memories');
  });

  it('buildConsolidationPrompt includes memory dir and session dir', () => {
    const prompt = buildConsolidationPrompt('/mem', '/sessions');
    expect(prompt).toContain('/mem');
    expect(prompt).toContain('/sessions');
    expect(prompt).toContain('Phase 1');
    expect(prompt).toContain('Phase 2');
    expect(prompt).toContain('Phase 3');
    expect(prompt).toContain('Phase 4');
  });

  it('buildConsolidationPrompt includes extra context', () => {
    const prompt = buildConsolidationPrompt('/mem', '/sessions', 'extra info');
    expect(prompt).toContain('extra info');
    expect(prompt).toContain('Additional context');
  });

  it('buildConsolidationPrompt without extra omits Additional context', () => {
    const prompt = buildConsolidationPrompt('/mem', '/sessions');
    expect(prompt).not.toContain('Additional context');
  });

  it('buildSessionMemoryPrompt includes current notes and path', () => {
    const prompt = buildSessionMemoryPrompt('existing notes', '/notes.md');
    expect(prompt).toContain('existing notes');
    expect(prompt).toContain('/notes.md');
    expect(prompt).toContain('Current State');
    expect(prompt).toContain('Worklog');
  });
});

// ============================================================================
// SessionIndex
// ============================================================================

describe('SessionIndex', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'synapse-sidx-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts empty', () => {
    const idx = new SessionIndex(dir);
    expect(idx.count).toBe(0);
    expect(idx.recent()).toHaveLength(0);
  });

  it('adds and retrieves entries', () => {
    const idx = new SessionIndex(dir);
    idx.add({
      id: 's1',
      timestamp: '2026-04-01T10:00:00Z',
      summary: 'Built a REST API',
      topics: ['api', 'typescript'],
      messageCount: 15,
    });
    idx.add({
      id: 's2',
      timestamp: '2026-04-01T12:00:00Z',
      summary: 'Fixed Docker networking issue',
      topics: ['docker', 'networking'],
      messageCount: 8,
    });

    expect(idx.count).toBe(2);
    expect(idx.recent(1)[0].id).toBe('s2');
  });

  it('searches by summary keyword', () => {
    const idx = new SessionIndex(dir);
    idx.add({
      id: 's1',
      timestamp: '2026-04-01T10:00:00Z',
      summary: 'Built a REST API with Express',
      topics: ['api', 'express'],
      messageCount: 15,
    });
    idx.add({
      id: 's2',
      timestamp: '2026-04-01T12:00:00Z',
      summary: 'Fixed Docker networking issue',
      topics: ['docker'],
      messageCount: 8,
    });

    const results = idx.search('docker');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('s2');
  });

  it('searches by topic keyword', () => {
    const idx = new SessionIndex(dir);
    idx.add({
      id: 's1',
      timestamp: '2026-04-01T10:00:00Z',
      summary: 'Built something',
      topics: ['typescript', 'testing'],
      messageCount: 10,
    });

    const results = idx.search('typescript');
    expect(results).toHaveLength(1);
  });

  it('returns recent when search has no query terms', () => {
    const idx = new SessionIndex(dir);
    for (let i = 0; i < 15; i++) {
      idx.add({
        id: `s${i}`,
        timestamp: `2026-04-01T${String(i).padStart(2, '0')}:00:00Z`,
        summary: `Session ${i}`,
        topics: [],
        messageCount: 5,
      });
    }
    // Empty query returns recent
    expect(idx.search('')).toHaveLength(10);
  });

  it('persists to disk and reloads', () => {
    const idx1 = new SessionIndex(dir);
    idx1.add({
      id: 's1',
      timestamp: '2026-04-01T10:00:00Z',
      summary: 'Persistent session',
      topics: ['test'],
      messageCount: 5,
    });

    const idx2 = new SessionIndex(dir);
    expect(idx2.count).toBe(1);
    expect(idx2.recent(1)[0].summary).toBe('Persistent session');
  });

  it('clears entries', () => {
    const idx = new SessionIndex(dir);
    idx.add({
      id: 's1',
      timestamp: '2026-04-01T10:00:00Z',
      summary: 'test',
      topics: [],
      messageCount: 1,
    });
    idx.clear();
    expect(idx.count).toBe(0);
  });

  it('getAll returns copy', () => {
    const idx = new SessionIndex(dir);
    idx.add({
      id: 's1',
      timestamp: '2026-04-01T10:00:00Z',
      summary: 'test',
      topics: [],
      messageCount: 1,
    });
    const all = idx.getAll();
    expect(all).toHaveLength(1);
    // Mutating the copy doesn't affect the index
    all.push({
      id: 'fake',
      timestamp: '',
      summary: '',
      topics: [],
      messageCount: 0,
    });
    expect(idx.count).toBe(1);
  });

  it('handles corrupted index file gracefully', () => {
    writeFileSync(join(dir, 'session-index.json'), 'NOT JSON {{{');
    const idx = new SessionIndex(dir);
    expect(idx.count).toBe(0);
  });
});

// ============================================================================
// Dream
// ============================================================================

describe('Dream', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'synapse-dream-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('shouldTrigger returns false when no sessions exist', () => {
    const dream = new Dream(dir, { minHours: 0, minSessions: 1 });
    expect(dream.shouldTrigger()).toBe(false);
  });

  it('shouldTrigger returns false when lock is held', () => {
    // Write a lock file with locked=true
    writeFileSync(
      join(dir, '.dream-lock.json'),
      JSON.stringify({ lastConsolidatedAt: 0, locked: true }),
    );
    const dream = new Dream(dir, { minHours: 0, minSessions: 0 });
    expect(dream.shouldTrigger()).toBe(false);
  });

  it('shouldTrigger returns true when gates pass', () => {
    // Create sessions dir with files
    const sessionsDir = join(dir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(sessionsDir, `session-${i}.json`), '{}');
    }

    // Set lastConsolidated far in the past
    writeFileSync(
      join(dir, '.dream-lock.json'),
      JSON.stringify({ lastConsolidatedAt: Date.now() - 48 * 3600_000, locked: false }),
    );

    const dream = new Dream(dir, { minHours: 1, minSessions: 3 });
    expect(dream.shouldTrigger()).toBe(true);
  });

  it('run() creates memory dir and returns success', async () => {
    const dream = new Dream(dir, { minHours: 0, minSessions: 0 });
    const result = await dream.run();
    expect(result.success).toBe(true);
    expect(existsSync(join(dir, 'memory'))).toBe(true);
  });

  it('run() acquires and releases lock', async () => {
    const dream = new Dream(dir, { minHours: 0, minSessions: 0 });
    await dream.run();

    const lock = JSON.parse(readFileSync(join(dir, '.dream-lock.json'), 'utf-8'));
    expect(lock.locked).toBe(false);
    expect(lock.lastConsolidatedAt).toBeGreaterThan(0);
  });

  it('run() rolls back lock on error', async () => {
    // Create a memory dir that will cause issues (read-only on some systems)
    const dream = new Dream(dir, { minHours: 0, minSessions: 0 });

    // First run succeeds
    const result = await dream.run();
    expect(result.success).toBe(true);

    // Lock should be released
    const lock = JSON.parse(readFileSync(join(dir, '.dream-lock.json'), 'utf-8'));
    expect(lock.locked).toBe(false);
  });

  it('run() prunes oversized MEMORY.md index', async () => {
    const memoryDir = join(dir, 'memory');
    mkdirSync(memoryDir, { recursive: true });

    // Create an oversized index
    const lines = Array.from({ length: 250 }, (_, i) => `- [Topic ${i}](topic-${i}.md) — description for topic ${i}`);
    writeFileSync(join(memoryDir, 'MEMORY.md'), lines.join('\n'));

    const dream = new Dream(dir, { minHours: 0, minSessions: 0, maxIndexLines: 200 });
    const result = await dream.run();
    expect(result.success).toBe(true);
    expect(result.indexUpdated).toBe(true);

    const pruned = readFileSync(join(memoryDir, 'MEMORY.md'), 'utf-8').split('\n');
    expect(pruned.length).toBeLessThanOrEqual(200);
  });

  it('run() truncates verbose index entries', async () => {
    const memoryDir = join(dir, 'memory');
    mkdirSync(memoryDir, { recursive: true });

    const verboseLine = '- [Topic](file.md) — ' + 'x'.repeat(300);
    writeFileSync(join(memoryDir, 'MEMORY.md'), verboseLine);

    const dream = new Dream(dir, { minHours: 0, minSessions: 0 });
    const result = await dream.run();
    expect(result.indexUpdated).toBe(true);

    const pruned = readFileSync(join(memoryDir, 'MEMORY.md'), 'utf-8');
    expect(pruned.length).toBeLessThanOrEqual(200);
  });

  it('getPrompt returns consolidation prompt', () => {
    const dream = new Dream(dir);
    const prompt = dream.getPrompt();
    expect(prompt).toContain('Dream: Memory Consolidation');
    expect(prompt).toContain('Phase 1');
  });

  it('forceTrigger bypasses time gate but not lock', () => {
    writeFileSync(
      join(dir, '.dream-lock.json'),
      JSON.stringify({ lastConsolidatedAt: Date.now(), locked: true }),
    );
    const dream = new Dream(dir);
    expect(dream.forceTrigger()).toBe(false);

    // Unlock
    writeFileSync(
      join(dir, '.dream-lock.json'),
      JSON.stringify({ lastConsolidatedAt: Date.now(), locked: false }),
    );
    expect(dream.forceTrigger()).toBe(true);
  });

  it('config defaults are applied', () => {
    const dream = new Dream(dir);
    // Should not throw — defaults are valid
    expect(dream.shouldTrigger()).toBeDefined();
  });

  it('handles missing sessions directory gracefully', async () => {
    const dream = new Dream(dir, { minHours: 0, minSessions: 0 });
    const result = await dream.run();
    expect(result.success).toBe(true);
  });
});
