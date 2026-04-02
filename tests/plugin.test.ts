// tests/plugin.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PluginRegistry } from '../src/plugins/registry.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('PluginRegistry', () => {
  let dir: string;
  beforeEach(() => { dir = join(tmpdir(), `cclaw-plugins-${Date.now()}`); mkdirSync(dir, { recursive: true }); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns empty list when plugins dir does not exist', () => {
    const registry = new PluginRegistry();
    registry.loadFromDir(dir);
    expect(registry.list()).toEqual([]);
  });

  it('skips entries that are not directories', () => {
    mkdirSync(join(dir, 'plugins'), { recursive: true });
    writeFileSync(join(dir, 'plugins', 'not-a-plugin.txt'), 'not a plugin');
    const registry = new PluginRegistry();
    registry.loadFromDir(dir);
    expect(registry.list()).toEqual([]);
  });

  it('skips directories without plugin.json', () => {
    const pluginsDir = join(dir, 'plugins');
    mkdirSync(join(pluginsDir, 'no-manifest'), { recursive: true });
    const registry = new PluginRegistry();
    registry.loadFromDir(dir);
    expect(registry.list()).toEqual([]);
  });

  it('loads valid plugin with manifest', () => {
    mkdirSync(join(dir, 'plugins', 'my-plugin'), { recursive: true });
    writeFileSync(join(dir, 'plugins', 'my-plugin', 'plugin.json'), JSON.stringify({
      name: 'my-plugin',
      version: '1.0.0',
      description: 'A test plugin',
    }));
    const registry = new PluginRegistry();
    registry.loadFromDir(dir);
    const list = registry.list();
    expect(list).toHaveLength(1);
    expect(list[0].manifest.name).toBe('my-plugin');
    expect(list[0].manifest.version).toBe('1.0.0');
  });

  it('skips invalid JSON manifest', () => {
    mkdirSync(join(dir, 'plugins', 'bad-plugin'), { recursive: true });
    writeFileSync(join(dir, 'plugins', 'bad-plugin', 'plugin.json'), 'not valid json {');
    const registry = new PluginRegistry();
    registry.loadFromDir(dir);
    expect(registry.list()).toEqual([]);
  });

  it('get() returns correct plugin', () => {
    mkdirSync(join(dir, 'plugins', 'test-plugin'), { recursive: true });
    writeFileSync(join(dir, 'plugins', 'test-plugin', 'plugin.json'), JSON.stringify({
      name: 'test-plugin',
      version: '2.0.0',
    }));
    const registry = new PluginRegistry();
    registry.loadFromDir(dir);
    const plugin = registry.get('test-plugin');
    expect(plugin).toBeDefined();
    expect(plugin!.manifest.version).toBe('2.0.0');
  });

  it('get() returns undefined for non-existent plugin', () => {
    const registry = new PluginRegistry();
    registry.loadFromDir(dir);
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('loads multiple plugins', () => {
    mkdirSync(join(dir, 'plugins', 'plugin-a'), { recursive: true });
    mkdirSync(join(dir, 'plugins', 'plugin-b'), { recursive: true });
    writeFileSync(join(dir, 'plugins', 'plugin-a', 'plugin.json'), JSON.stringify({ name: 'plugin-a', version: '1.0.0' }));
    writeFileSync(join(dir, 'plugins', 'plugin-b', 'plugin.json'), JSON.stringify({ name: 'plugin-b', version: '2.0.0' }));
    const registry = new PluginRegistry();
    registry.loadFromDir(dir);
    expect(registry.list()).toHaveLength(2);
  });
});
