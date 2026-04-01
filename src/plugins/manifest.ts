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
