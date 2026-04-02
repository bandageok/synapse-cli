import { execSync } from 'child_process';
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

export const GitCommitTool: ToolDef<{ message: string; add_all?: boolean }> = {
  name: 'GitCommit',
  description: 'Create a git commit',
  schema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Commit message' },
      add_all: { type: 'boolean', description: 'Stage all changes before committing' },
    },
    required: ['message'],
  },
  permissions: 'execute',
  isEnabled: () => true,
  execute: async (input, ctx): Promise<ToolResult> => {
    try {
      if (input.add_all) {
        execSync('git add -A', { cwd: ctx.cwd, encoding: 'utf-8', timeout: 5000 });
      }
      const result = execSync(`git commit -m "${input.message.replace(/"/g, '\\"')}"`, {
        cwd: ctx.cwd, encoding: 'utf-8', timeout: 10000,
      });
      return { output: result, isError: false };
    } catch (err: unknown) {
      const e = err as { stderr?: string };
      return { output: e.stderr || (err instanceof Error ? err.message : String(err)), isError: true };
    }
  },
};
