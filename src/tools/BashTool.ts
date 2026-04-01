import { execSync } from 'child_process';
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

export const BashTool: ToolDef<{ command: string }> = {
  name: 'Bash',
  description: 'Execute a shell command',
  schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The command to execute' },
    },
    required: ['command'],
  },
  permissions: 'execute',
  isEnabled: () => true,
  execute: async (input, ctx: ToolContext): Promise<ToolResult> => {
    try {
      const output = execSync(input.command, {
        cwd: ctx.cwd,
        timeout: 30_000,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
      });
      return { output, isError: false };
    } catch (err: any) {
      return { output: err.stderr || err.message, isError: true };
    }
  },
};
