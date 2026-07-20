import { readFileSync, existsSync } from 'fs';
import type { ToolDef, ToolResult } from '../core/types.js';
import { resolveWorkspacePath } from '../utils/workspacePaths.js';

export const FileReadTool: ToolDef<{ file_path: string; offset?: number; limit?: number }> = {
  name: 'FileRead',
  description: 'Read the contents of a file',
  schema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file' },
      offset: { type: 'number', description: 'Start line (1-indexed)' },
      limit: { type: 'number', description: 'Number of lines to read' },
    },
    required: ['file_path'],
  },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input, ctx): Promise<ToolResult> => {
    try {
      const filePath = resolveWorkspacePath(input.file_path, ctx, 'read');
      if (!existsSync(filePath)) {
        return { output: `Error: File not found: ${input.file_path}`, isError: true };
      }
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      if (input.offset || input.limit) {
        const start = (input.offset ?? 1) - 1;
        const end = input.limit ? start + input.limit : lines.length;
        const sliced = lines.slice(start, end);
        const numbered = sliced.map((line, i) => `${start + i + 1}\t${line}`).join('\n');
        return { output: numbered, isError: false };
      }
      return { output: content, isError: false };
    } catch (error) {
      return { output: `Error: ${error instanceof Error ? error.message : String(error)}`, isError: true };
    }
  },
};
