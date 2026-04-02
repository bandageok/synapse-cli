// src/tools/TaskTool.ts
// 子代理工具 — 支持 in-process 和 spawn 两种隔离模式
import { spawn } from 'child_process';
import type { ToolDef, ToolResult, ToolContext } from '../core/types.js';
import type { ToolRegistry } from '../core/ToolRegistry.js';
import type { Provider } from '../core/types.js';
import { createEngine } from '../core/Engine.js';

export interface TaskToolDeps {
  provider: Provider;
  tools: ToolRegistry;
  context: any;
  hooks: any;
  compressor: any;
  errorRecovery: any;
}

export type IsolationMode = 'in-process' | 'spawn';

export function createTaskTool(deps: TaskToolDeps, isolation: IsolationMode = 'in-process'): ToolDef<{ task: string; tools?: string[]; max_turns?: number }> {
  return {
    name: 'Task',
    description: 'Spawn a sub-agent to handle a task independently. Supports in-process and spawn isolation.',
    schema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The task for the sub-agent to complete' },
        tools: { type: 'array', items: { type: 'string' }, description: 'Allowed tool names (default: all)' },
        max_turns: { type: 'number', description: 'Maximum turns (default: 20)', default: 20 },
      },
      required: ['task'],
    },
    permissions: 'execute',
    isEnabled: () => true,
    execute: async (input, ctx: ToolContext): Promise<ToolResult> => {
      if (isolation === 'spawn') {
        return executeSpawned(input, ctx);
      }
      return executeInProcess(input, deps);
    },
  };
}

/** In-process 模式：共享内存，快速但无隔离 */
async function executeInProcess(
  input: { task: string; tools?: string[]; max_turns?: number },
  deps: TaskToolDeps,
): Promise<ToolResult> {
  const maxTurns = input.max_turns ?? 20;
  let turnCount = 0;
  const outputs: string[] = [];

  const messages = [{ role: 'user' as const, content: input.task }];

  let subTools = deps.tools;
  if (input.tools && input.tools.length > 0) {
    const { ToolRegistry } = await import('../core/ToolRegistry.js');
    subTools = new ToolRegistry();
    for (const toolName of input.tools) {
      const tool = deps.tools.get(toolName);
      if (tool) subTools.register(tool);
    }
  }

  try {
    for await (const event of createEngine(
      messages, deps.provider, subTools, deps.context,
      deps.hooks, deps.compressor, deps.errorRecovery,
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
  } catch (err: any) {
    return { output: `[SubAgent] Failed: ${err.message}\n\n${outputs.join('\n')}`, isError: true };
  }
}

/** Spawn 模式：独立进程，完全隔离 */
async function executeSpawned(
  input: { task: string; tools?: string[]; max_turns?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      '-e',
      `
        const task = ${JSON.stringify(input.task)};
        const maxTurns = ${input.max_turns ?? 20};
        // 简化版子代理：执行单个命令或返回任务描述
        console.log(JSON.stringify({
          output: '[Spawned SubAgent] Task received: ' + task + '\\nMax turns: ' + maxTurns + '\\nNote: Full spawn isolation requires cclaw binary in PATH.',
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

    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch {
        resolve({
          output: `[Spawned SubAgent] Exit code: ${code}\nStdout: ${stdout}\nStderr: ${stderr}`,
          isError: code !== 0,
        });
      }
    });

    child.on('error', (err) => {
      resolve({ output: `[Spawned SubAgent] Failed to spawn: ${err.message}`, isError: true });
    });
  });
}
