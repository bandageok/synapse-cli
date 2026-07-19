// tests/plugin.test.ts
// PluginRegistry: load, list, get
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PluginRegistry } from '../src/plugins/registry.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('PluginRegistry', () => {
  let dir: string;
  beforeEach(() => { dir = join(tmpdir(), 'synapse-plg-' + Date.now()); mkdirSync(dir, { recursive: true }); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns empty list when plugins dir does not exist', () => {
    const r = new PluginRegistry();
    r.loadFromDir(dir);
    expect(r.list()).toEqual([]);
  });

  it('skips entries that are not directories', () => {
    mkdirSync(join(dir, 'plugins'), { recursive: true });
    writeFileSync(join(dir, 'plugins', 'not.txt'), 'x');
    const r = new PluginRegistry();
    r.loadFromDir(dir);
    expect(r.list()).toEqual([]);
  });

  it('skips directories without plugin.json', () => {
    mkdirSync(join(dir, 'plugins', 'no-manifest'), { recursive: true });
    const r = new PluginRegistry();
    r.loadFromDir(dir);
    expect(r.list()).toEqual([]);
  });

  it('loads a valid plugin', () => {
    mkdirSync(join(dir, 'plugins', 'my-plugin'), { recursive: true });
    writeFileSync(join(dir, 'plugins', 'my-plugin', 'plugin.json'),
      JSON.stringify({ name: 'my-plugin', version: '1.0.0', description: 'Test' }));
    const r = new PluginRegistry();
    r.loadFromDir(dir);
    expect(r.list().length).toBe(1);
    expect(r.list()[0].manifest.name).toBe('my-plugin');
  });

  it('skips plugins with invalid JSON', () => {
    mkdirSync(join(dir, 'plugins', 'bad-json'), { recursive: true });
    writeFileSync(join(dir, 'plugins', 'bad-json', 'plugin.json'), 'not json');
    const r = new PluginRegistry();
    r.loadFromDir(dir);
    expect(r.list().length).toBe(0);
  });

  it('returns plugin by name', () => {
    mkdirSync(join(dir, 'plugins', 'findable'), { recursive: true });
    writeFileSync(join(dir, 'plugins', 'findable', 'plugin.json'),
      JSON.stringify({ name: 'findable', version: '2.0.0' }));
    const r = new PluginRegistry();
    r.loadFromDir(dir);
    expect(r.get('findable')).toBeDefined();
    expect(r.get('findable')?.manifest.name).toBe('findable');
  });

  it('returns undefined for missing plugin', () => {
    const r = new PluginRegistry();
    r.loadFromDir(dir);
    expect(r.get('nope')).toBeUndefined();
  });
});
