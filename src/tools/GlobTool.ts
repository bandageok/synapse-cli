import fg from 'fast-glob';
import type { ToolDef, ToolResult } from '../core/types.js';
import { isAbsolute } from 'path';
import { resolveWorkspacePath } from '../utils/workspacePaths.js';

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
    try {
      if (isAbsolute(input.pattern) || input.pattern.split(/[\\/]+/).includes('..')) {
        return { output: 'Error: Glob pattern must stay within the selected workspace directory.', isError: true };
      }
      const cwd = resolveWorkspacePath(input.path || ctx.cwd, ctx, 'read');
      const results = fg.sync(input.pattern, { cwd, onlyFiles: true, unique: true, followSymbolicLinks: false });
      return { output: results.join('\n') || 'No files found', isError: false };
    } catch (error) {
      return { output: `Error: ${error instanceof Error ? error.message : String(error)}`, isError: true };
    }
  },
};
