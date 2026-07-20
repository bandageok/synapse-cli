import { readFileSync, existsSync } from 'fs';
import type { ToolDef, ToolResult } from '../core/types.js';
import { resolveWorkspacePath } from '../utils/workspacePaths.js';

export const NotebookReadTool: ToolDef<{ notebook_path: string }> = {
  name: 'NotebookRead',
  description: 'Read a Jupyter notebook (.ipynb) and return cells with their types and contents',
  schema: {
    type: 'object',
    properties: {
      notebook_path: { type: 'string', description: 'Absolute path to the .ipynb file' },
    },
    required: ['notebook_path'],
  },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input, ctx): Promise<ToolResult> => {
    try {
      const notebookPath = resolveWorkspacePath(input.notebook_path, ctx, 'read');
      if (!existsSync(notebookPath)) return { output: `Error: File not found: ${input.notebook_path}`, isError: true };
      const nb = JSON.parse(readFileSync(notebookPath, 'utf-8'));
      const cells = (nb.cells ?? []).map((cell: { cell_type: string; source: string[] }, i: number) => {
        const type = cell.cell_type;
        const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
        return `[${i}] (${type}):\n${source}`;
      }).join('\n\n---\n\n');
      return { output: cells || 'Empty notebook', isError: false };
    } catch (err: unknown) {
      return { output: `Error parsing notebook: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    }
  },
};
