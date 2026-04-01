import { execSync } from 'child_process';
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

export const GrepTool: ToolDef<{ pattern: string; path?: string; include?: string }> = {
  name: 'Grep',
  description: 'Search file contents using regex',
  schema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search' },
      path: { type: 'string', description: 'Directory to search' },
      include: { type: 'string', description: 'File glob filter (e.g., *.ts)' },
    },
    required: ['pattern'],
  },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input, ctx): Promise<ToolResult> => {
    try {
      const includeFlag = input.include ? `--include="${input.include}"` : '';
      const cmd = `grep -rn ${includeFlag} "${input.pattern}" "${input.path || ctx.cwd}"`;
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 10_000, maxBuffer: 1024 * 1024 });
      return { output: output.slice(0, 10_000), isError: false };
    } catch (err: any) {
      if (err.status === 1) return { output: 'No matches found', isError: false };
      return { output: err.message, isError: true };
    }
  },
};
