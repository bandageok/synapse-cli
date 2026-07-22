// src/plugins/registry.ts
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parsePluginManifest, type PluginManifest } from './manifest.js';

export interface LoadedPlugin {
  manifest: PluginManifest;
  path: string;
}

export class PluginRegistry {
  private plugins: Map<string, LoadedPlugin> = new Map();

  loadFromDir(dataDir: string): void {
    const pluginsDir = join(dataDir, 'plugins');
    if (!existsSync(pluginsDir)) return;

    for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pluginDir = join(pluginsDir, entry.name);
      const manifestPath = join(pluginDir, 'plugin.json');
      if (!existsSync(manifestPath)) continue;

      try {
        const manifest = parsePluginManifest(JSON.parse(readFileSync(manifestPath, 'utf-8')));
        this.plugins.set(manifest.name, { manifest, path: pluginDir });
      } catch {
        // skip invalid plugins
      }
    }
  }

  list(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  get(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }
}
