import { execSync } from 'child_process';
import type { ToolDef, ToolResult } from '../core/types.js';
import { platform } from 'os';

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
      const searchPath = input.path || ctx.cwd;
      const includeFlag = input.include ? `--include="${input.include}"` : '';
      const caseFlag = input.case_insensitive ? '-i' : '';
      const isWin = platform() === 'win32';
      const cmd = isWin
        ? `findstr /s /r /n ${input.case_insensitive ? '/i ' : ''}/c:"${input.pattern}" "${searchPath}\\*"`
        : `grep -rn ${caseFlag} ${includeFlag} "${input.pattern}" "${searchPath}"`;
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 10_000, maxBuffer: 1024 * 1024 });
      return { output: output.slice(0, 10_000), isError: false };
    } catch (err: unknown) {
      const e = err as { status?: number };
      if (e.status === 1) return { output: 'No matches found', isError: false };
      return { output: err instanceof Error ? err.message : String(err), isError: true };
    }
  },
};
