// tests/soul.test.ts
// Soul system: Heartbeat, SoulLoader, Dream baseline tests
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Heartbeat } from '../src/soul/Heartbeat.js';
import { SoulLoader } from '../src/soul/SoulLoader.js';

// Heartbeat tests
describe('Heartbeat', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), 'synapse-hb-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    // Create heartbeat.md
    writeFileSync(join(tmpDir, 'HEARTBEAT.md'), '', 'utf-8');
  });

  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('instantiates without error', () => {
    const hb = new Heartbeat(tmpDir);
    expect(hb).toBeDefined();
  });

  it('starts without error', () => {
    const hb = new Heartbeat(tmpDir);
    expect(() => hb.start()).not.toThrow();
  });

  it('stops without error', () => {
    const hb = new Heartbeat(tmpDir);
    hb.start();
    expect(() => hb.stop()).not.toThrow();
  });

  it('can be restarted', () => {
    const hb = new Heartbeat(tmpDir);
    hb.start();
    hb.stop();
    expect(() => hb.start()).not.toThrow();
  });
});

// SoulLoader tests
describe('SoulLoader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), 'synapse-sl-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns empty for missing SOUL.md', () => {
    const sl = new SoulLoader(tmpDir);
    const result = sl.load();
    expect(result).toBeFalsy(); // null or empty string
  });

  it('loads soul content from SOUL.md', () => {
    writeFileSync(join(tmpDir, 'SOUL.md'), '# SOUL.md\nHello soul', 'utf-8');
    const sl = new SoulLoader(tmpDir);
    const result = sl.load();
    expect(result).toBeTruthy();
    expect(result).toContain('Hello soul');
  });

  it('returns updated content on reload', () => {
    writeFileSync(join(tmpDir, 'SOUL.md'), 'v1', 'utf-8');
    const sl = new SoulLoader(tmpDir);
    let result = sl.load();
    expect(result).toContain('v1');
    writeFileSync(join(tmpDir, 'SOUL.md'), 'v2', 'utf-8');
    result = sl.load();
    expect(result).toContain('v2');
  });
});
