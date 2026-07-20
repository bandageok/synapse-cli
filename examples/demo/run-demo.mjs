import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = join(root, 'dist', 'cli.mjs');
const record = process.argv.includes('--record');

if (!existsSync(cli)) {
  console.error('dist/cli.mjs is missing. Run npm run build first.');
  process.exit(1);
}

const dataDir = mkdtempSync(join(tmpdir(), 'synapse-readme-demo-'));
const transcript = [];
let port = 0;
let memoryObserved = false;

function clean(value) {
  return value
    .replaceAll(dataDir, '~/.synapse')
    .replaceAll(dataDir.replaceAll('\\', '/'), '~/.synapse')
    .replaceAll('~/.synapse\\', '~/.synapse/')
    .replaceAll(String(port), '<port>')
    .replace(/Latency: \d+ms/g, 'Latency: <local>');
}

function show(value = '') {
  const output = clean(value).trimEnd();
  if (!output) return;
  console.log(output);
  transcript.push(...output.split(/\r?\n/));
}

function command(label, args, options = {}) {
  show(`$ ${label}`);
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: options.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(clean(result.stderr || result.stdout || `${label} failed`));
  }
  if (!options.quiet) show(result.stdout);
  transcript.push('');
  console.log('');
}

function pipeChat(env) {
  const prompt = 'Which package command should I use on Windows?';
  show(`$ echo "${prompt}" | synapse chat --pipe`);
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [cli, 'chat', '--pipe'], {
      cwd: root,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
    child.stdin.end(`${prompt}\n`);
    const timeout = setTimeout(() => {
      child.kill();
      rejectPromise(new Error('Demo chat timed out.'));
    }, 15_000);
    child.on('error', rejectPromise);
    child.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0) {
        rejectPromise(new Error(Buffer.concat(stderr).toString('utf8') || `Chat exited with ${code}`));
        return;
      }
      show(Buffer.concat(stdout).toString('utf8'));
      resolvePromise();
    });
  });
}

const server = createServer((request, response) => {
  const chunks = [];
  request.on('data', chunk => chunks.push(Buffer.from(chunk)));
  request.on('end', () => {
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    memoryObserved = JSON.stringify(payload.messages).includes('Use npm.cmd on Windows');
    response.writeHead(memoryObserved ? 200 : 500, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    if (!memoryObserved) {
      response.end(JSON.stringify({ error: { message: 'Project memory was not present in the request.' } }));
      return;
    }
    for (const content of ['Project memory loaded. ', 'Use npm.cmd on Windows.']) {
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
    }
    response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
});

try {
  await new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local demo server did not expose a port.');
  port = address.port;

  const env = {
    ...process.env,
    SYNAPSE_DATA_DIR: dataDir,
    SYNAPSE_DEMO_KEY: 'offline-demo-key',
  };

  command('synapse init', ['init'], { env, quiet: true });
  appendFileSync(join(dataDir, 'MEMORY.md'), '\n- Use npm.cmd on Windows\n', 'utf8');
  command('synapse provider set local-demo ...', [
    'provider', 'set', 'local-demo',
    '--base-url', `http://127.0.0.1:${port}/v1`,
    '--protocol', 'openai',
    '--model', 'synapse-demo',
    '--api-key-env', 'SYNAPSE_DEMO_KEY',
  ], { env });
  command('synapse doctor', ['doctor'], { env });
  await pipeChat(env);

  if (!memoryObserved) throw new Error('The local endpoint did not observe the project memory rule.');

  if (record) {
    const output = join(root, 'docs', 'assets', 'demo-transcript.txt');
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${transcript.join('\n').trim()}\n`, 'utf8');
    console.log(`\nRecorded ${output}`);
  }
} finally {
  await new Promise(resolvePromise => server.close(() => resolvePromise()));
  rmSync(dataDir, { recursive: true, force: true });
}
