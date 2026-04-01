import type { ToolDef, ToolResult } from '../core/types.js';

export const AskUserQuestionTool: ToolDef<{ question: string; options?: string[] }> = {
  name: 'AskUserQuestion',
  description: 'Ask the user a clarifying question',
  schema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question to ask' },
      options: { type: 'array', items: { type: 'string' }, description: 'Multiple choice options' },
    },
    required: ['question'],
  },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input): Promise<ToolResult> => {
    let output = `Question: ${input.question}`;
    if (input.options?.length) {
      output += '\n' + input.options.map((o, i) => `  ${i + 1}. ${o}`).join('\n');
    }
    return { output, isError: false };
  },
};
