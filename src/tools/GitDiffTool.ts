import { execSync } from 'child_process';
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

export const GitDiffTool: ToolDef<{ staged?: boolean; path?: string }> = {
  name: 'GitDiff',
  description: 'Show git diff',
  schema: {
    type: 'object',
    properties: {
      staged: { type: 'boolean', description: 'Show staged changes only' },
      path: { type: 'string', description: 'Specific file path' },
    },
  },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input, ctx): Promise<ToolResult> => {
    try {
      const flags = input.staged ? '--staged' : '';
      const path = input.path ?? '';
      const cmd = `git diff ${flags} ${path}`.trim();
      const diff = execSync(cmd, { cwd: ctx.cwd, encoding: 'utf-8', timeout: 10000, maxBuffer: 1024 * 1024 });
      return { output: diff || 'No changes', isError: false };
    } catch (err: unknown) {
      return { output: (err instanceof Error ? err.message : String(err)), isError: true };
    }
  },
};
