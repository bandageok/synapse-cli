import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createBashTool } from '../src/tools/BashTool.js';

const enabled = process.platform === 'linux' && process.env.SYNAPSE_E2E_SANDBOX === '1';
const temporary: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'synapse-sandbox-e2e-'));
  temporary.push(dir);
  return dir;
}

afterEach(() => {
  while (temporary.length) rmSync(temporary.pop()!, { recursive: true, force: true });
});

describe.skipIf(!enabled)('Bubblewrap runtime isolation', () => {
  it('allows workspace writes while blocking host writes and outbound DNS', async () => {
    const workspace = tempDir();
    const outside = tempDir();
    const tool = createBashTool({ sandbox: true, sandboxBackend: 'bubblewrap', timeout: 10_000 });
    const context = {
      cwd: workspace,
      workspaceRoots: [workspace],
      abortSignal: new AbortController().signal,
    };

    const workspaceWrite = await tool.execute({ command: 'printf isolated > sandbox-proof.txt' }, context);
    expect(workspaceWrite.isError).toBe(false);
    expect(readFileSync(join(workspace, 'sandbox-proof.txt'), 'utf-8')).toBe('isolated');

    const hostWrite = await tool.execute({ command: `printf escaped > '${join(outside, 'escape.txt')}'` }, context);
    expect(hostWrite.isError).toBe(true);
    expect(existsSync(join(outside, 'escape.txt'))).toBe(false);

    const network = await tool.execute({ command: 'getent hosts example.com >/dev/null 2>&1 && exit 7 || exit 0' }, context);
    expect(network.isError).toBe(false);

    const processes = await tool.execute({ command: "find /proc -maxdepth 1 -type d -name '[0-9]*' | wc -l" }, context);
    expect(processes.isError).toBe(false);
    expect(Number.parseInt(processes.output.trim(), 10)).toBeLessThanOrEqual(5);
  });
});
