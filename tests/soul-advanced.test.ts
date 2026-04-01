// tests/soul-advanced.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Heartbeat } from '../src/soul/Heartbeat.js';
import { SelfImprovement } from '../src/soul/SelfImprovement.js';
import { FakeExecutionWatchdog } from '../src/soul/FakeExecutionWatchdog.js';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Heartbeat', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cclaw-hb-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('loads builtin tasks', () => {
    const hb = new Heartbeat(dir);
    const tasks = hb.getTasks();
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    expect(tasks.some(t => t.name === 'memory-archive')).toBe(true);
    expect(tasks.some(t => t.name === 'session-cleanup')).toBe(true);
  });

  it('loads tasks from HEARTBEAT.md', () => {
    writeFileSync(join(dir, 'HEARTBEAT.md'), `## custom-task\n\`\`\`bash\necho hello\n\`\`\`\n`);
    const hb = new Heartbeat(dir);
    const tasks = hb.getTasks();
    expect(tasks.some(t => t.name === 'custom-task')).toBe(true);
  });

  it('start and stop without error', () => {
    const hb = new Heartbeat(dir);
    hb.start();
    hb.stop();
  });
});

describe('SelfImprovement', () => {
  let dir: string;
  let si: SelfImprovement;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cclaw-si-'));
    si = new SelfImprovement(dir);
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('logs errors to ERRORS.md', () => {
    si.logError('Bash', 'rm -rf /', 'Permission denied');
    const content = readFileSync(join(dir, '.learnings/ERRORS.md'), 'utf-8');
    expect(content).toContain('Bash failed');
    expect(content).toContain('Permission denied');
  });

  it('logs corrections to LEARNINGS.md', () => {
    si.logCorrection('used console.log', 'use logger');
    const content = readFileSync(join(dir, '.learnings/LEARNINGS.md'), 'utf-8');
    expect(content).toContain('correction');
    expect(content).toContain('use logger');
  });

  it('logs knowledge gaps', () => {
    si.logKnowledgeGap('Rust lifetimes', 'Need to understand borrow checker');
    const content = readFileSync(join(dir, '.learnings/LEARNINGS.md'), 'utf-8');
    expect(content).toContain('knowledge_gap');
  });

  it('logs best practices', () => {
    si.logBestPractice('error handling', 'Always use Result<T, E>');
    const content = readFileSync(join(dir, '.learnings/LEARNINGS.md'), 'utf-8');
    expect(content).toContain('best_practice');
  });

  it('logs feature requests', () => {
    si.logFeatureRequest('Add MCP support');
    const content = readFileSync(join(dir, '.learnings/FEATURE_REQUESTS.md'), 'utf-8');
    expect(content).toContain('MCP support');
  });

  it('getRecent returns entries', () => {
    si.logCorrection('used console.log', 'use logger');
    si.logKnowledgeGap('TypeScript', 'need generics');
    const recent = si.getRecent(5);
    expect(recent).toHaveLength(2);
  });

  it('getHotPatterns finds 3x repeated patterns', () => {
    si.logCorrection('used console.log', 'use logger');
    si.logCorrection('used console.log', 'use logger');
    si.logCorrection('used console.log', 'use logger');
    const hot = si.getHotPatterns();
    expect(hot.length).toBeGreaterThan(0);
  });
});

describe('FakeExecutionWatchdog', () => {
  it('detects no violation when tool was called', () => {
    const wd = new FakeExecutionWatchdog();
    wd.recordTurn(1, '我来修改这个文件', true);
    const { clean } = wd.check();
    expect(clean).toBe(true);
  });

  it('detects fake execution: intent without tool call', () => {
    const wd = new FakeExecutionWatchdog();
    wd.recordTurn(1, '我来修改这个文件', false);
    const { violations } = wd.check();
    expect(violations).toHaveLength(1);
    expect(violations[0].turnNumber).toBe(1);
  });

  it('detects multiple violations', () => {
    const wd = new FakeExecutionWatchdog();
    wd.recordTurn(1, '正在处理中', false);
    wd.recordTurn(2, '已修改完成', false);
    wd.recordTurn(3, 'ok', false); // no intent
    const { violations } = wd.check();
    expect(violations).toHaveLength(2);
  });

  it('generates report', () => {
    const wd = new FakeExecutionWatchdog();
    wd.recordTurn(1, '马上改', false);
    const report = wd.report();
    expect(report).toContain('Fake execution');
    expect(report).toContain('Turn 1');
  });

  it('returns empty report when clean', () => {
    const wd = new FakeExecutionWatchdog();
    wd.recordTurn(1, 'ok', true);
    expect(wd.report()).toBe('');
  });

  it('resets turns', () => {
    const wd = new FakeExecutionWatchdog();
    wd.recordTurn(1, '正在做', false);
    wd.reset();
    expect(wd.check().clean).toBe(true);
  });

  it('does not flag non-intent text', () => {
    const wd = new FakeExecutionWatchdog();
    wd.recordTurn(1, '这个文件的内容是...', false);
    expect(wd.check().clean).toBe(true);
  });
});
