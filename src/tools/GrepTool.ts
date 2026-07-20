import { readFileSync } from 'fs';
import type { ToolDef, ToolResult } from '../core/types.js';
import fg from 'fast-glob';
import { resolveWorkspacePath } from '../utils/workspacePaths.js';

export const GrepTool: ToolDef<{ pattern: string; path?: string; include?: string; case_insensitive?: boolean }> = {
  name: 'Grep',
  description: 'Search file contents using regex',
  schema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search' },
      path: { type: 'string', description: 'Directory to search' },
      include: { type: 'string', description: 'File glob filter (e.g., *.ts)' },
      case_insensitive: { type: 'boolean', description: 'Case insensitive search' },
    },
    required: ['pattern'],
  },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input, ctx): Promise<ToolResult> => {
    try {
      const searchPath = resolveWorkspacePath(input.path || ctx.cwd, ctx, 'read');
      const regex = new RegExp(input.pattern, input.case_insensitive ? 'i' : undefined);
      const files = fg.sync(input.include || '**/*', {
        cwd: searchPath,
        absolute: true,
        onlyFiles: true,
        followSymbolicLinks: false,
      }).slice(0, 5_000);
      const matches: string[] = [];
      for (const file of files) {
        const safeFile = resolveWorkspacePath(file, ctx, 'read');
        let content: string;
        try { content = readFileSync(safeFile, 'utf-8'); } catch { continue; }
        if (content.includes('\0')) continue;
        for (const [index, line] of content.split(/\r?\n/).entries()) {
          if (regex.test(line)) matches.push(`${safeFile}:${index + 1}:${line}`);
          regex.lastIndex = 0;
          if (matches.join('\n').length >= 10_000) break;
        }
        if (matches.join('\n').length >= 10_000) break;
      }
      return { output: matches.join('\n').slice(0, 10_000) || 'No matches found', isError: false };
    } catch (err: unknown) {
      return { output: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    }
  },
};
