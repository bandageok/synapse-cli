import { describe, it, expect } from 'vitest';
import { BashTool, createBashTool } from '../src/tools/BashTool.js';
import { PowerShellTool } from '../src/tools/PowerShellTool.js';
import { mkdtempSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('BashTool', () => {
  const isWin = process.platform === 'win32';
  const hasBash = !isWin;

  it('validates tool definition', () => {
    // Verify tool schema and properties
    expect(BashTool.name).toBe('Bash');
    expect(BashTool.schema.required).toContain('command');
    expect(BashTool.isEnabled()).toBe(true);
  });

  it('blocks dangerous commands', async () => {
    const result = await BashTool.execute({ command: 'rm -rf /' }, { cwd: process.cwd(), abortSignal: new AbortController().signal });
    expect(result.isError).toBe(true);
    expect(result.output).toMatch(/Blocked|dangerous/i);
  });

  it('blocks dd commands', async () => {
    const result = await BashTool.execute({ command: 'dd of=/dev/sda' }, { cwd: process.cwd(), abortSignal: new AbortController().signal });
    expect(result.isError).toBe(true);
  });

  it('does not allow sibling paths that only share a prefix', async () => {
    const base = mkdtempSync(join(tmpdir(), 'synapse-allowed-'));
    const sibling = base + '-sibling';
    mkdirSync(sibling, { recursive: true });
    const scopedBash = createBashTool({ allowedDirs: [base] });

    const result = await scopedBash.execute(
      { command: 'echo should-not-run' },
      { cwd: sibling, abortSignal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.output).toContain('not in the allowed list');
  });

  if (hasBash) {
    it('executes echo command', async () => {
      const result = await BashTool.execute({ command: 'echo hello' }, { cwd: process.cwd(), abortSignal: new AbortController().signal });
      expect(result.isError).toBe(false);
      expect(result.output).toContain('hello');
    });

    it('lists directory', async () => {
      const result = await BashTool.execute({ command: 'ls -la' }, { cwd: process.cwd(), abortSignal: new AbortController().signal });
      expect(result.isError).toBe(false);
      expect(result.output.length).toBeGreaterThan(0);
    });
  } else {
    it('skips bash execution on Windows (use PowerShellTool)', () => {
      expect(true).toBe(true); // Pass: Windows has PowerShellTool
    });
  }
});

describe.skipIf(process.platform !== 'win32')('PowerShellTool', () => {
  it('executes Write-Output', async () => {
    const result = await PowerShellTool.execute({ command: 'Write-Output "hello"' }, { cwd: process.cwd(), abortSignal: new AbortController().signal });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('hello');
  });

  it('executes Get-ChildItem', async () => {
    const result = await PowerShellTool.execute({ command: 'Get-ChildItem' }, { cwd: process.cwd(), abortSignal: new AbortController().signal });
    expect(result.isError).toBe(false);
    expect(result.output.length).toBeGreaterThan(0);
  });
});
