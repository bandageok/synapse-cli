import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { ToolDef, ToolResult } from '../core/types.js';

export const FileWriteTool: ToolDef<{ file_path: string; content: string }> = {
  name: 'FileWrite',
  description: 'Write content to a file (creates or overwrites)',
  schema: {
    type: 'object',
    properties: {
      file_path: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['file_path', 'content'],
  },
  permissions: 'write',
  isEnabled: () => true,
  execute: async (input): Promise<ToolResult> => {
    try {
      mkdirSync(dirname(input.file_path), { recursive: true });
      writeFileSync(input.file_path, input.content);
      return { output: `File written: ${input.file_path}`, isError: false };
    } catch (err: any) {
      return { output: `Error: ${err.message}`, isError: true };
    }
  },
};
