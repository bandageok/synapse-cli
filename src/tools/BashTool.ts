// src/tools/BashTool.ts
import { execSync, spawn } from 'child_process';
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

// ============================================================================
// 危险命令黑名单
// ============================================================================

const DANGEROUS_PATTERNS = [
  /\brm\s+.*-rf?\s+[\/\\]/,           // rm -rf /
  /\bdd\s+.*of=\/dev\//,              // dd of=/dev/...
  /\bmkfs\b/,                         // mkfs
  /\bfdisk\b/,                        // fdisk
  /\bformat\b/,                       // format
  /\bshutdown\b/,                     // shutdown
  /\breboot\b/,                       // reboot
  /\bhalt\b/,                         // halt
  /\binit\s+0\b/,                     // init 0
  /\binit\s+6\b/,                     // init 6
  /\bkill\s+-9\s+1\b/,               // kill -9 1
  /\bkillall\b/,                      // killall
  /\bpkill\b/,                        // pkill
  /\bchmod\s+.*777\b/,               // chmod 777
  /\bchown\s+.*root\b/,              // chown root
  /\bcurl\s+.*\|\s*bash/,            // curl | bash
  /\bwget\s+.*\|\s*bash/,            // wget | bash
  /\bnc\s+-l\b/,                      // nc -l (netcat listener)
  /\bncat\s+-l\b/,                    // ncat -l
  /\bsocat\b/,                        // socat
  /\biptables\b/,                     // iptables
  /\bufw\b/,                          // ufw
  /\bfirewall-cmd\b/,                 // firewall-cmd
  /\bsystemctl\s+(stop|disable)\b/,   // systemctl stop/disable
  /\bservice\s+\w+\s+stop\b/,         // service stop
];

// ============================================================================
// 工作目录白名单（可配置）
// ============================================================================

export interface BashToolConfig {
  /** 最大执行时间（毫秒） */
  timeout?: number;
  /** 工作目录白名单（空 = 不限制） */
  allowedDirs?: string[];
  /** 是否启用沙箱 */
  sandbox?: boolean;
  /** 最大输出缓冲（字节） */
  maxBuffer?: number;
}

const DEFAULT_CONFIG: BashToolConfig = {
  timeout: 30_000,
  allowedDirs: [],
  sandbox: false,
  maxBuffer: 1024 * 1024,
};

// ============================================================================
// 沙箱执行（macOS sandbox-exec / Linux seccomp）
// ============================================================================

function buildSandboxPolicy(cwd: string): string {
  // macOS sandbox-exec policy
  return `(version 1)
(deny default)
(allow file-read* (subpath "/"))
(allow file-write* (subpath "${cwd}"))
(allow file-write* (subpath "/tmp"))
(allow process-exec)
(allow process-fork)
(allow network-outbound)
(deny network*)`;
}

function executeSandboxed(command: string, cwd: string, timeout: number, maxBuffer: number): string {
  if (process.platform === 'darwin') {
    const policy = buildSandboxPolicy(cwd);
    return execSync(`sandbox-exec -p '${policy}' sh -c "${command.replace(/"/g, '\\"')}"`, {
      cwd,
      timeout,
      encoding: 'utf-8',
      maxBuffer,
    });
  }
  // Linux: fallback to normal exec (seccomp requires container)
  return execSync(command, {
    cwd,
    timeout,
    encoding: 'utf-8',
    maxBuffer,
  });
}

// ============================================================================
// 危险命令检测
// ============================================================================

function isDangerous(command: string): { dangerous: boolean; reason?: string } {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { dangerous: true, reason: `Command matches dangerous pattern: ${pattern.source}` };
    }
  }
  return { dangerous: false };
}

// ============================================================================
// 工作目录检查
// ============================================================================

function isDirAllowed(cwd: string, allowedDirs: string[]): boolean {
  if (allowedDirs.length === 0) return true;
  return allowedDirs.some(dir => cwd.startsWith(dir));
}

// ============================================================================
// BashTool
// ============================================================================

export function createBashTool(userConfig: BashToolConfig = {}): ToolDef<{ command: string; timeout?: number }> {
  const config = { ...DEFAULT_CONFIG, ...userConfig };

  return {
    name: 'Bash',
    description: 'Execute a shell command with safety checks',
    schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
        timeout: { type: 'number', description: 'Timeout in ms (default: 30000)' },
      },
      required: ['command'],
    },
    permissions: 'execute',
    isEnabled: () => true,
    execute: async (input, ctx: ToolContext): Promise<ToolResult> => {
      // 1. 危险命令检查
      const danger = isDangerous(input.command);
      if (danger.dangerous) {
        return {
          output: `🚫 Blocked: ${danger.reason}\nThis command is blocked for safety. If you really need to run it, use a different approach.`,
          isError: true,
        };
      }

      // 2. 工作目录检查
      if (!isDirAllowed(ctx.cwd, config.allowedDirs!)) {
        return {
          output: `🚫 Blocked: Working directory ${ctx.cwd} is not in the allowed list.`,
          isError: true,
        };
      }

      // 3. 执行
      const timeout = input.timeout ?? config.timeout!;
      const maxBuffer = config.maxBuffer!;

      try {
        let output: string;
        if (config.sandbox) {
          output = executeSandboxed(input.command, ctx.cwd, timeout, maxBuffer);
        } else {
          output = execSync(input.command, {
            cwd: ctx.cwd,
            timeout,
            encoding: 'utf-8',
            maxBuffer,
          });
        }
        return { output, isError: false };
      } catch (err: any) {
        return { output: err.stderr || err.message, isError: true };
      }
    },
  };
}

// 默认实例（向后兼容）
export const BashTool = createBashTool();
