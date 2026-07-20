import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { ToolDef, ToolResult } from '../core/types.js';
import { resolveWorkspacePath } from '../utils/workspacePaths.js';

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
  execute: async (input, ctx): Promise<ToolResult> => {
    try {
      const filePath = resolveWorkspacePath(input.file_path, ctx, 'write');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, input.content);
      return { output: `File written: ${filePath}`, isError: false };
    } catch (err: unknown) {
      return { output: `Error: ${(err instanceof Error ? err.message : String(err))}`, isError: true };
    }
  },
};
