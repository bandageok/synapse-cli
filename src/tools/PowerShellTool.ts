// src/tools/PowerShellTool.ts
import { execFile } from 'child_process';
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
      /Remove-Item\s+.*-Recurse\s+-Force\s+[\/\\]/i,
      /Stop-Computer/i,
      /Restart-Computer/i,
      /Set-ExecutionPolicy\s+Unrestricted/i,
      /Invoke-Expression.*\(New-Object\s+Net\.WebClient\)/,
      /Invoke-WebRequest.*\|\s*(Invoke-Expression|iex)/i,
      /Start-Process.*-Verb\s+RunAs/i,
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
      const timeout = input.timeout ?? 30_000;
      if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120_000) {
        return { output: 'Error: timeout must be an integer between 100 and 120000 ms.', isError: true };
      }
      const output = await runPowerShell(input.command, ctx, timeout);
      return { output, isError: false };
    } catch (err: unknown) {
      const e = err as { stderr?: string; message?: string };
      return { output: e.stderr || e.message || String(err), isError: true };
    }
  },
};

function runPowerShell(command: string, ctx: ToolContext, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const onAbort = () => child.kill();
    const child = execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
      cwd: ctx.cwd,
      timeout,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    }, (error, stdout, stderr) => {
      ctx.abortSignal.removeEventListener('abort', onAbort);
      if (error) reject(Object.assign(error, { stderr }));
      else resolve(stdout);
    });
    if (ctx.abortSignal.aborted) child.kill();
    ctx.abortSignal.addEventListener('abort', onAbort, { once: true });
  });
}
