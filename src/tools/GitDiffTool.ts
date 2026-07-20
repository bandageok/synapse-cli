import { relative } from 'path';
import type { ToolDef, ToolResult } from '../core/types.js';
import { runProcess } from '../utils/process.js';
import { resolveWorkspacePath } from '../utils/workspacePaths.js';

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
      const args = ['diff'];
      if (input.staged) args.push('--staged');
      if (input.path) {
        const filePath = resolveWorkspacePath(input.path, ctx, 'read');
        args.push('--', relative(ctx.cwd, filePath));
      }
      const diff = await runProcess('git', args, ctx, { timeout: 10_000 });
      return { output: diff || 'No changes', isError: false };
    } catch (error) {
      return { output: error instanceof Error ? error.message : String(error), isError: true };
    }
  },
};
