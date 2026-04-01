import { execSync } from 'child_process';
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

export const GitStatusTool: ToolDef<{}> = {
  name: 'GitStatus',
  description: 'Show git working tree status',
  schema: { type: 'object', properties: {} },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (_input, ctx): Promise<ToolResult> => {
    try {
      const status = execSync('git status --short --branch', { cwd: ctx.cwd, encoding: 'utf-8', timeout: 5000 });
      return { output: status || 'Clean working tree', isError: false };
    } catch {
      return { output: 'Not a git repository', isError: true };
    }
  },
};
