import { execFile } from 'child_process';
import type { ToolContext } from '../core/types.js';

export interface ProcessOptions {
  timeout: number;
  maxBuffer?: number;
  env?: NodeJS.ProcessEnv;
}

export function runProcess(
  file: string,
  args: string[],
  ctx: ToolContext,
  options: ProcessOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const onAbort = () => child.kill();
    const child = execFile(file, args, {
      cwd: ctx.cwd,
      timeout: options.timeout,
      maxBuffer: options.maxBuffer ?? 1024 * 1024,
      env: options.env ?? process.env,
      encoding: 'utf-8',
    }, (error, stdout, stderr) => {
      ctx.abortSignal.removeEventListener('abort', onAbort);
      if (error) reject(Object.assign(error, { stderr }));
      else resolve(stdout);
    });
    if (ctx.abortSignal.aborted) child.kill();
    ctx.abortSignal.addEventListener('abort', onAbort, { once: true });
  });
}
