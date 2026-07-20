import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setProvider } from '../src/providers/management.js';
import { setConfiguredPermissionMode } from '../src/utils/permissionConfig.js';

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
    const payload = JSON.parse(requestBody);
    expect(payload.model).toBe('test-model');
    expect(payload.messages[0]).toMatchObject({ role: 'system' });
    expect(payload.messages[0].content).toContain('Developer and maintainer: BandageOK');
    expect(payload.messages[0].content).toContain('Configured provider: "local-sse"');
    expect(payload.messages[0].content).toContain('Configured primary model: "test-model"');
    expect(payload.messages[0].content).toContain('prior assistant messages');
    expect(existsSync(join(dataDir, 'IDENTITY.md'))).toBe(true);
  });

  it('answers product identity locally without calling the configured provider', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'synapse-identity-conversation-'));
    cleanup.push(dataDir);
    setProvider('company-gateway', {
      dataDir,
      baseUrl: 'http://127.0.0.1:1/v1',
      protocol: 'openai',
      model: 'company-model',
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
    child.stdin.end('你是谁开发的？\n');

    const code = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('Local identity response timed out. stderr=' + Buffer.concat(stderr).toString('utf-8')));
      }, 15_000);
      child.on('error', reject);
      child.on('close', result => { clearTimeout(timeout); resolve(result); });
    });

    const output = Buffer.concat(stdout).toString('utf-8');
    expect(code).toBe(0);
    expect(output).toContain('我是 Synapse，由 BandageOK 开发和维护。');
    expect(output).toContain('company-gateway');
  });

  it('completes a real CLI tool round-trip with preserved tool_call_id', async () => {
    const requestBodies: any[] = [];
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', chunk => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        requestBodies.push(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        if (requestBodies.length === 1) {
          response.write('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{
            index: 0,
            id: 'call_read_package',
            function: { name: 'FileRead', arguments: JSON.stringify({ file_path: join(root, 'package.json') }) },
          }] } }] }) + '\n\n');
          response.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }) + '\n\n');
        } else {
          response.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'TOOL_ROUNDTRIP_OK' } }] }) + '\n\n');
          response.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\n');
        }
        response.end();
      });
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not expose a port');

    const dataDir = mkdtempSync(join(tmpdir(), 'synapse-tool-roundtrip-'));
    cleanup.push(dataDir);
    setProvider('local-tool-sse', {
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
    child.stdin.end('Read package.json with FileRead and report success\n');

    const code = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('CLI tool round-trip timed out. stderr=' + Buffer.concat(stderr).toString('utf-8')));
      }, 15_000);
      child.on('error', reject);
      child.on('close', result => { clearTimeout(timeout); resolve(result); });
    });

    expect(code).toBe(0);
    expect(Buffer.concat(stdout).toString('utf-8')).toContain('TOOL_ROUNDTRIP_OK');
    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[1].messages).toContainEqual(expect.objectContaining({
      role: 'tool',
      tool_call_id: 'call_read_package',
    }));
  });

  it('executes a Bash tool call without approval when --yolo selects full-access', async () => {
    const requestBodies: any[] = [];
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', chunk => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        requestBodies.push(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        if (requestBodies.length === 1) {
          response.write('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{
            index: 0,
            id: 'call_yolo_bash',
            function: { name: 'Bash', arguments: JSON.stringify({ command: 'echo YOLO_EXEC_OK' }) },
          }] } }] }) + '\n\n');
          response.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }) + '\n\n');
        } else {
          response.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'YOLO_ROUNDTRIP_OK' } }] }) + '\n\n');
          response.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\n');
        }
        response.end();
      });
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not expose a port');

    const dataDir = mkdtempSync(join(tmpdir(), 'synapse-yolo-roundtrip-'));
    cleanup.push(dataDir);
    setProvider('local-yolo-sse', {
      dataDir,
      baseUrl: 'http://127.0.0.1:' + address.port + '/v1',
      protocol: 'openai',
      model: 'test-model',
      apiKey: 'test-key',
    });

    const child = spawn(process.execPath, [tsxCli, entry, 'chat', '--pipe', '--yolo'], {
      cwd: root,
      env: { ...process.env, SYNAPSE_DATA_DIR: dataDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
    child.stdin.end('Run the requested Bash command\n');

    const code = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('CLI --yolo round-trip timed out. stderr=' + Buffer.concat(stderr).toString('utf-8')));
      }, 15_000);
      child.on('error', reject);
      child.on('close', result => { clearTimeout(timeout); resolve(result); });
    });

    expect(code).toBe(0);
    expect(Buffer.concat(stdout).toString('utf-8')).toContain('YOLO_ROUNDTRIP_OK');
    expect(Buffer.concat(stderr).toString('utf-8')).toContain('Full access runs host commands without approval prompts');
    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[1].messages).toContainEqual(expect.objectContaining({
      role: 'tool',
      tool_call_id: 'call_yolo_bash',
      content: expect.stringContaining('YOLO_EXEC_OK'),
    }));
  });

  it.each([
    {
      name: 'ask without an interactive approval handler',
      args: ['--permission-mode', 'ask'],
      persisted: 'full-access' as const,
      expectedToolResult: 'Permission denied (no handler)',
      finalText: 'ASK_DENIED_OK',
    },
    {
      name: 'auto without prompting or host fallback',
      args: [],
      persisted: 'auto' as const,
      expectedToolResult: 'Permission denied for tool "Task" in auto mode',
      finalText: 'AUTO_DENIED_OK',
    },
  ])('returns a deterministic tool result in $name', async scenario => {
    const requestBodies: any[] = [];
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', chunk => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        requestBodies.push(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        if (requestBodies.length === 1) {
          response.write('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{
            index: 0,
            id: 'call_permission_task',
            function: { name: 'Task', arguments: JSON.stringify({ task: 'must not execute' }) },
          }] } }] }) + '\n\n');
          response.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }) + '\n\n');
        } else {
          response.write('data: ' + JSON.stringify({ choices: [{ delta: { content: scenario.finalText } }] }) + '\n\n');
          response.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\n');
        }
        response.end();
      });
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not expose a port');

    const dataDir = mkdtempSync(join(tmpdir(), 'synapse-permission-denial-roundtrip-'));
    cleanup.push(dataDir);
    setProvider('local-permission-sse', {
      dataDir,
      baseUrl: 'http://127.0.0.1:' + address.port + '/v1',
      protocol: 'openai',
      model: 'test-model',
      apiKey: 'test-key',
    });
    setConfiguredPermissionMode(dataDir, scenario.persisted);

    const child = spawn(process.execPath, [tsxCli, entry, 'chat', '--pipe', ...scenario.args], {
      cwd: root,
      env: { ...process.env, SYNAPSE_DATA_DIR: dataDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
    child.stdin.end('Try the Task tool\n');

    const code = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('Permission denial round-trip timed out. stderr=' + Buffer.concat(stderr).toString('utf-8')));
      }, 15_000);
      child.on('error', reject);
      child.on('close', result => { clearTimeout(timeout); resolve(result); });
    });

    expect(code).toBe(0);
    expect(Buffer.concat(stdout).toString('utf-8')).toContain(scenario.finalText);
    expect(Buffer.concat(stderr).toString('utf-8')).not.toContain('Full access runs host commands');
    expect(JSON.parse(readFileSync(join(dataDir, '.synapse.json'), 'utf-8')).permissionMode).toBe(scenario.persisted);
    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[1].messages).toContainEqual(expect.objectContaining({
      role: 'tool',
      tool_call_id: 'call_permission_task',
      content: expect.stringContaining(scenario.expectedToolResult),
    }));
  });
});
