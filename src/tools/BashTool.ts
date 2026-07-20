import { execFile } from 'child_process';
import { isAbsolute, relative, resolve } from 'path';
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';
import { createSandboxProcess, type SandboxBackend } from '../security/Sandbox.js';

const DANGEROUS_PATTERNS = [
  /\brm\s+.*-rf?\s+[\/\\]/, /\bdd\s+.*of=\/dev\//, /\bmkfs\b/, /\bfdisk\b/, /\bformat\b/,
  /\bshutdown\b/, /\breboot\b/, /\bhalt\b/, /\binit\s+[06]\b/, /\bkill\s+-9\s+1\b/,
  /\bkillall\b/, /\bpkill\b/, /\bchmod\s+.*777\b/, /\bchown\s+.*root\b/,
  /\b(?:curl|wget)\s+.*\|\s*bash/, /\b(?:nc|ncat)\s+-l\b/, /\bsocat\b/,
  /\biptables\b/, /\bufw\b/, /\bfirewall-cmd\b/, /\bsystemctl\s+(?:stop|disable)\b/,
  /\bservice\s+\w+\s+stop\b/,
];

export interface BashToolConfig {
  timeout?: number;
  allowedDirs?: string[];
  sandbox?: boolean;
  sandboxBackend?: 'auto' | SandboxBackend;
  allowNetworkInSandbox?: boolean;
  maxBuffer?: number;
}

const DEFAULT_CONFIG: Required<BashToolConfig> = {
  timeout: 30_000,
  allowedDirs: [],
  sandbox: false,
  sandboxBackend: 'auto',
  allowNetworkInSandbox: false,
  maxBuffer: 1024 * 1024,
};

export function createBashTool(userConfig: BashToolConfig = {}): ToolDef<{ command: string; timeout?: number }> {
  const config = { ...DEFAULT_CONFIG, ...userConfig };
  return {
    name: 'Bash',
    description: config.sandbox
      ? 'Execute a shell command in a strict workspace sandbox'
      : 'Execute a shell command with safety checks and human approval',
    schema: {
      type: 'object',
      properties: {
        command: { type: 'string', minLength: 1, description: 'The command to execute' },
        timeout: { type: 'integer', minimum: 100, maximum: 120_000, description: 'Timeout in milliseconds' },
      },
      required: ['command'],
    },
    permissions: 'execute',
    autoApproveInWorkspace: config.sandbox,
    isEnabled: () => true,
    execute: async (input, ctx): Promise<ToolResult> => {
      const dangerous = DANGEROUS_PATTERNS.find(pattern => pattern.test(input.command));
      if (dangerous) return { output: `Blocked: command matches dangerous pattern ${dangerous.source}`, isError: true };

      const allowedDirs = config.allowedDirs.length > 0 ? config.allowedDirs : (ctx.workspaceRoots ?? [ctx.cwd]);
      if (!isDirAllowed(ctx.cwd, allowedDirs)) {
        return { output: `Blocked: working directory ${ctx.cwd} is not in the allowed list.`, isError: true };
      }
      const timeout = input.timeout ?? config.timeout;
      if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120_000) {
        return { output: 'Error: timeout must be an integer between 100 and 120000 ms.', isError: true };
      }

      try {
        const spec = config.sandbox
          ? createSandboxProcess(input.command, {
              cwd: ctx.cwd,
              workspaceRoots: allowedDirs,
              network: config.allowNetworkInSandbox,
              backend: config.sandboxBackend,
            })
          : hostShell(input.command);
        const output = await runProcess(spec.file, spec.args, ctx, timeout, config.maxBuffer);
        return { output, isError: false };
      } catch (error) {
        const detail = error as { stderr?: string; message?: string };
        return { output: detail.stderr || detail.message || String(error), isError: true };
      }
    },
  };
}

function hostShell(command: string): { file: string; args: string[] } {
  return process.platform === 'win32'
    ? { file: 'cmd.exe', args: ['/d', '/s', '/c', command] }
    : { file: '/bin/sh', args: ['-c', command] };
}

function runProcess(file: string, args: string[], ctx: ToolContext, timeout: number, maxBuffer: number): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let child: ReturnType<typeof execFile>;
    const onAbort = () => child.kill();
    child = execFile(file, args, {
      cwd: ctx.cwd, timeout, encoding: 'utf-8', maxBuffer, windowsHide: true,
    }, (error, stdout, stderr) => {
      ctx.abortSignal.removeEventListener('abort', onAbort);
      if (error) reject(Object.assign(error, { stderr }));
      else resolvePromise(stdout);
    });
    if (ctx.abortSignal.aborted) onAbort();
    else ctx.abortSignal.addEventListener('abort', onAbort, { once: true });
  });
}

function isDirAllowed(cwd: string, allowedDirs: string[]): boolean {
  const normalizedCwd = resolve(cwd);
  return allowedDirs.some(dir => {
    const rel = relative(resolve(dir), normalizedCwd);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  });
}

export const BashTool = createBashTool();
