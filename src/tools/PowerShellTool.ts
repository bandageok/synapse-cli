// src/tools/PowerShellTool.ts
import { execSync } from 'child_process';
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

export const PowerShellTool: ToolDef<{ command: string; timeout?: number }> = {
  name: 'PowerShell',
  description: 'Execute a PowerShell command (Windows only)',
  schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'PowerShell command to execute' },
      timeout: { type: 'number', description: 'Timeout in ms (default: 30000)', default: 30000 },
    },
    required: ['command'],
  },
  permissions: 'execute',
  isEnabled: () => process.platform === 'win32',
  execute: async (input, ctx: ToolContext): Promise<ToolResult> => {
    // 危险命令检查
    const dangerousPatterns = [
      /Remove-Item\s+.*-Recurse\s+-Force\s+[\/\\]/,
      /Stop-Computer/,
      /Restart-Computer/,
      /Set-ExecutionPolicy\s+Unrestricted/,
      /Invoke-Expression.*\(New-Object\s+Net\.WebClient\)/,
      /Invoke-WebRequest.*\|\s*(Invoke-Expression|iex)/i,
      /Start-Process.*-Verb\s+RunAs/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(input.command)) {
        return {
          output: `🚫 Blocked: Command matches dangerous pattern: ${pattern.source}`,
          isError: true,
        };
      }
    }

    try {
      // 使用 -Command 参数，避免执行策略问题
      const psCommand = `powershell.exe -NoProfile -NonInteractive -Command "${input.command.replace(/"/g, '""')}"`;
      const output = execSync(psCommand, {
        cwd: ctx.cwd,
        timeout: input.timeout ?? 30_000,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });
      return { output, isError: false };
    } catch (err: any) {
      return { output: err.stderr || err.message, isError: true };
    }
  },
};
