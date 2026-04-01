import { readFileSync, existsSync } from 'fs';
import type { ToolDef, ToolResult } from '../core/types.js';

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
  execute: async (input): Promise<ToolResult> => {
    if (!existsSync(input.notebook_path)) {
      return { output: `Error: File not found: ${input.notebook_path}`, isError: true };
    }
    try {
      const nb = JSON.parse(readFileSync(input.notebook_path, 'utf-8'));
      const cells = (nb.cells ?? []).map((cell: any, i: number) => {
        const type = cell.cell_type;
        const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
        return `[${i}] (${type}):\n${source}`;
      }).join('\n\n---\n\n');
      return { output: cells || 'Empty notebook', isError: false };
    } catch (err: any) {
      return { output: `Error parsing notebook: ${err.message}`, isError: true };
    }
  },
};
