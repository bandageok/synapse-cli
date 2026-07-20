import type { ToolDef, ToolResult } from '../core/types.js';
import { runProcess } from '../utils/process.js';

export const GitCommitTool: ToolDef<{ message: string; add_all?: boolean }> = {
  name: 'GitCommit',
  description: 'Create a git commit',
  schema: {
    type: 'object',
    properties: {
      message: { type: 'string', minLength: 1, maxLength: 500, description: 'Commit message' },
      add_all: { type: 'boolean', description: 'Stage all changes before committing' },
    },
    required: ['message'],
  },
  permissions: 'execute',
  isEnabled: () => true,
  execute: async (input, ctx): Promise<ToolResult> => {
    try {
      if (input.add_all) await runProcess('git', ['add', '-A'], ctx, { timeout: 5_000 });
      const result = await runProcess('git', ['commit', '-m', input.message], ctx, { timeout: 10_000 });
      return { output: result, isError: false };
    } catch (error) {
      const detail = error as { stderr?: string };
      return { output: detail.stderr || (error instanceof Error ? error.message : String(error)), isError: true };
    }
  },
};
