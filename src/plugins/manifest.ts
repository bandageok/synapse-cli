// src/plugins/manifest.ts
export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  commands?: string;       // path to commands directory
  skills?: string[];       // paths to skill files
  hooks?: {
    preToolUse?: string;   // path to hook script
    postToolUse?: string;
  };
  config?: Record<string, { type: string; sensitive?: boolean }>;
}

export function parsePluginManifest(value: unknown): PluginManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('plugin.json must contain an object.');
  }
  const manifest = value as Partial<PluginManifest>;
  if (typeof manifest.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(manifest.name)) {
    throw new Error('plugin name must use 1-64 letters, numbers, dots, underscores, or hyphens.');
  }
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
    throw new Error('plugin version is required.');
  }
  return manifest as PluginManifest;
}

export function declaredPluginCapabilities(manifest: PluginManifest): string[] {
  return [
    manifest.commands ? 'commands' : '',
    manifest.skills?.length ? 'skills' : '',
    manifest.hooks ? 'hooks' : '',
  ].filter(Boolean);
}
