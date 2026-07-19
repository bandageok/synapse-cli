import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setProvider } from '../src/providers/management.js';

const root = process.cwd();
const tsxCli = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const entry = join(root, 'src', 'entry', 'cli.ts');

describe('real CLI conversation path', () => {
  const cleanup: string[] = [];
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>(resolve => server!.close(() => resolve()));
      server = undefined;
    }
    while (cleanup.length) rmSync(cleanup.pop()!, { recursive: true, force: true });
  });

  it('runs synapse chat --pipe through a real OpenAI-compatible SSE response', async () => {
    let requestBody = '';
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', chunk => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        requestBody = Buffer.concat(chunks).toString('utf-8');
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        response.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'READY' } }] }) + '\n\n');
        response.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\n');
        response.end('data: [DONE]\n\n');
      });
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not expose a port');

    const dataDir = mkdtempSync(join(tmpdir(), 'synapse-conversation-'));
    cleanup.push(dataDir);
    setProvider('local-sse', {
      dataDir,
      baseUrl: 'http://127.0.0.1:' + address.port + '/v1',
      protocol: 'openai',
      model: 'test-model',
      apiKey: 'test-key',
    });

    const child = spawn(process.execPath, [tsxCli, entry, 'chat', '--pipe'], {
      cwd: root,
      env: { ...process.env, SYNAPSE_DATA_DIR: dataDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
    child.stdin.end('Say hello\n');

    const result = await new Promise<{ code: number | null }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('CLI conversation timed out. stderr=' + Buffer.concat(stderr).toString('utf-8')));
      }, 15_000);
      child.on('error', reject);
      child.on('close', code => {
        clearTimeout(timeout);
        resolve({ code });
      });
    });

    expect(result.code).toBe(0);
    expect(Buffer.concat(stdout).toString('utf-8')).toContain('READY');
    expect(JSON.parse(requestBody).model).toBe('test-model');
  });
});
