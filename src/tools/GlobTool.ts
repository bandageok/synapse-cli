import { globSync, statSync } from 'fs';
import type { ToolDef, ToolResult } from '../core/types.js';

export const GlobTool: ToolDef<{ pattern: string; path?: string }> = {
  name: 'Glob',
  description: 'Find files matching a glob pattern',
  schema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern (e.g., **/*.ts)' },
      path: { type: 'string', description: 'Directory to search in' },
    },
    required: ['pattern'],
  },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input, ctx): Promise<ToolResult> => {
    const cwd = input.path || ctx.cwd;
    const results = globSync(input.pattern, { cwd })
      .filter(f => { try { return !statSync(`${cwd}/${f}`).isDirectory(); } catch { return true; } });
    return { output: results.join('\n') || 'No files found', isError: false };
  },
};
