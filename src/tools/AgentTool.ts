import type { ToolDef, ToolResult } from '../core/types.js';

export const AgentTool: ToolDef<{ task: string; tools?: string[]; max_turns?: number }> = {
  name: 'Agent',
  description: 'Spawn a sub-agent to handle a task independently',
  schema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The task for the sub-agent' },
      tools: { type: 'array', items: { type: 'string' }, description: 'Allowed tools' },
      max_turns: { type: 'number', description: 'Max turns (default: 20)', default: 20 },
    },
    required: ['task'],
  },
  permissions: 'execute',
  isEnabled: () => true,
  execute: async (input): Promise<ToolResult> => {
    return {
      output: `[Agent stub] Task received: ${input.task}. Full agent spawning not yet implemented.`,
      isError: false,
    };
  },
};
