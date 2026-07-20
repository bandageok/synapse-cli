import type { ToolDef, ToolResult } from '../core/types.js';
import { runProcess } from '../utils/process.js';

export const GitStatusTool: ToolDef<Record<string, never>> = {
  name: 'GitStatus',
  description: 'Show git working tree status',
  schema: { type: 'object', properties: {} },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (_input, ctx): Promise<ToolResult> => {
    try {
      const status = await runProcess('git', ['status', '--short', '--branch'], ctx, { timeout: 5_000 });
      return { output: status || 'Clean working tree', isError: false };
    } catch {
      return { output: 'Not a git repository', isError: true };
    }
  },
};
