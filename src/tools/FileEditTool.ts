import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { ToolDef, ToolResult } from '../core/types.js';

export const FileEditTool: ToolDef<{ file_path: string; old_string: string; new_string: string }> = {
  name: 'FileEdit',
  description: 'Edit a file by replacing old_string with new_string',
  schema: {
    type: 'object',
    properties: {
      file_path: { type: 'string' },
      old_string: { type: 'string', description: 'Text to find and replace' },
      new_string: { type: 'string', description: 'Replacement text' },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },
  permissions: 'write',
  isEnabled: () => true,
  execute: async (input): Promise<ToolResult> => {
    if (!existsSync(input.file_path)) {
      return { output: `Error: File not found: ${input.file_path}`, isError: true };
    }
    const content = readFileSync(input.file_path, 'utf-8');
    if (!content.includes(input.old_string)) {
      return { output: 'Error: old_string not found in file', isError: true };
    }
    const newContent = content.replace(input.old_string, input.new_string);
    writeFileSync(input.file_path, newContent);
    return { output: 'File edited successfully', isError: false };
  },
};
