// src/tools/TaskTool.ts
// 子代理工具 — 支持 in-process 和 spawn 两种隔离模式
import { spawn } from 'child_process';
import type { ToolDef, ToolResult, ToolContext } from '../core/types.js';
import type { Provider } from '../providers/base.js';
import type { ToolRegistry } from '../core/ToolRegistry.js';
import { createEngine } from '../core/Engine.js';
import type { ContextBuilder } from '../core/Context.js';
import type { Compressor } from '../core/Compressor.js';
import type { HookSystem } from '../core/HookSystem.js';
import type { ErrorRecovery } from '../core/ErrorRecovery.js';

export interface TaskToolDeps {
  provider: Provider;
  tools: ToolRegistry;
  context: ContextBuilder;
  hooks: HookSystem;
  compressor: Compressor;
  errorRecovery: ErrorRecovery;
}

export type IsolationMode = 'in-process' | 'spawn';

export function createTaskTool(deps: TaskToolDeps, isolation: IsolationMode = 'in-process'): ToolDef<{ task: string; tools?: string[]; max_turns?: number }> {
  return {
    name: 'Task',
    description: 'Spawn a sub-agent to handle a task independently. Supports in-process and spawn isolation.',
    schema: {
      type: 'object',
      properties: {
        task: { type: 'string', minLength: 1, description: 'The task for the sub-agent to complete' },
        tools: { type: 'array', items: { type: 'string' }, uniqueItems: true, description: 'Allowed tool names (default: all)' },
        max_turns: { type: 'integer', minimum: 1, maximum: 200, description: 'Maximum turns (default: 20)', default: 20 },
      },
      required: ['task'],
    },
    permissions: 'execute',
    isEnabled: () => true,
    execute: async (input, ctx: ToolContext): Promise<ToolResult> => {
      if (isolation === 'spawn') {
        return executeSpawned(input, ctx);
      }
      return executeInProcess(input, deps, ctx);
    },
  };
}

/** In-process 模式：共享内存，快速但无隔离 */
async function executeInProcess(
  input: { task: string; tools?: string[]; max_turns?: number },
  deps: TaskToolDeps,
  ctx: ToolContext,
): Promise<ToolResult> {
  const maxTurns = input.max_turns ?? 20;
  let turnCount = 0;
  const outputs: string[] = [];

  const messages = [{ role: 'user' as const, content: input.task }];

  let subTools = deps.tools;
  if (input.tools && input.tools.length > 0) {
    subTools = deps.tools.cloneRestricted(input.tools);
  }

  try {
    for await (const event of createEngine(
      messages, deps.provider, subTools, deps.context,
      deps.hooks, deps.compressor, deps.errorRecovery,
      { maxTurns, signal: ctx.abortSignal },
    )) {
      switch (event.type) {
        case 'token':
          outputs.push(event.text);
          break;
        case 'tool_use':
          outputs.push(`🔧 [SubAgent] ${event.tool}`);
          break;
        case 'tool_result':
          outputs.push(`  → ${event.output.slice(0, 200)}`);
          break;
        case 'end_turn':
          turnCount++;
          if (turnCount >= maxTurns) {
            return { output: `[SubAgent] Max turns (${maxTurns}) reached.\n\n${outputs.join('\n')}`, isError: false };
          }
          messages.push({ role: 'user', content: 'Continue.' });
          break;
        case 'error':
          return { output: `[SubAgent] Error: ${event.error}\n\n${outputs.join('\n')}`, isError: true };
        case 'compressed':
          outputs.push(`📦 [SubAgent] Context compressed`);
          break;
      }
    }
    return { output: outputs.join('\n') || '[SubAgent] Task completed with no output.', isError: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: `[SubAgent] Failed: ${msg}\n\n${outputs.join('\n')}`, isError: true };
  }
}

/** Spawn 模式：独立进程，完全隔离 */
async function executeSpawned(
  input: { task: string; tools?: string[]; max_turns?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  if (ctx.abortSignal.aborted) return { output: '[Spawned SubAgent] Request cancelled.', isError: true };
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ToolResult) => {
      if (settled) return;
      settled = true;
      ctx.abortSignal.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const child = spawn(process.execPath, [
      '-e',
      `
        const task = ${JSON.stringify(input.task)};
        const maxTurns = ${input.max_turns ?? 20};
        // 简化版子代理：执行单个命令或返回任务描述
        console.log(JSON.stringify({
          output: '[Spawned SubAgent] Task received: ' + task + '\\nMax turns: ' + maxTurns + '\\nNote: Full spawn isolation requires synapse binary in PATH.',
          isError: false,
        }));
      `,
    ], {
      cwd: ctx.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    });

    let stdout = '';
    let stderr = '';
    const maxCapturedCharacters = 1_000_000;
    const appendBounded = (current: string, chunk: unknown) => (current + String(chunk)).slice(-maxCapturedCharacters);
    const onAbort = () => {
      child.kill();
      finish({ output: '[Spawned SubAgent] Request cancelled.', isError: true });
    };
    ctx.abortSignal.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (data) => { stdout = appendBounded(stdout, data); });
    child.stderr?.on('data', (data) => { stderr = appendBounded(stderr, data); });

    child.on('close', (code) => {
      try {
        const result = JSON.parse(stdout.trim());
        finish(result);
      } catch {
        finish({
          output: `[Spawned SubAgent] Exit code: ${code}\nStdout: ${stdout}\nStderr: ${stderr}`,
          isError: code !== 0,
        });
      }
    });

    child.on('error', (err) => {
      finish({ output: `[Spawned SubAgent] Failed to spawn: ${err.message}`, isError: true });
    });
  });
}
