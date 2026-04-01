import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { ToolDef, ToolResult } from '../core/types.js';

export const NotebookEditTool: ToolDef<{
  notebook_path: string;
  cell_number: number;
  new_source: string;
  cell_type?: 'code' | 'markdown';
}> = {
  name: 'NotebookEdit',
  description: 'Edit a cell in a Jupyter notebook',
  schema: {
    type: 'object',
    properties: {
      notebook_path: { type: 'string' },
      cell_number: { type: 'number', description: 'Cell index (0-based)' },
      new_source: { type: 'string', description: 'New cell content' },
      cell_type: { type: 'string', enum: ['code', 'markdown'] },
    },
    required: ['notebook_path', 'cell_number', 'new_source'],
  },
  permissions: 'write',
  isEnabled: () => true,
  execute: async (input): Promise<ToolResult> => {
    if (!existsSync(input.notebook_path)) {
      return { output: `Error: File not found: ${input.notebook_path}`, isError: true };
    }
    try {
      const nb = JSON.parse(readFileSync(input.notebook_path, 'utf-8'));
      if (input.cell_number >= (nb.cells?.length ?? 0)) {
        return { output: `Error: Cell ${input.cell_number} does not exist (${nb.cells?.length ?? 0} cells)`, isError: true };
      }
      nb.cells[input.cell_number].source = input.new_source.split('\n').map((l: string, i: number, arr: string[]) => i < arr.length - 1 ? l + '\n' : l);
      if (input.cell_type) nb.cells[input.cell_number].cell_type = input.cell_type;
      writeFileSync(input.notebook_path, JSON.stringify(nb, null, 1));
      return { output: `Cell ${input.cell_number} updated`, isError: false };
    } catch (err: any) {
      return { output: `Error: ${err.message}`, isError: true };
    }
  },
};
