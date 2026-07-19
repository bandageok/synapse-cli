import { describe, it, expect } from 'vitest';
import { GitStatusTool } from '../src/tools/GitStatusTool.js';
import { GitDiffTool } from '../src/tools/GitDiffTool.js';
import { NotebookReadTool } from '../src/tools/NotebookReadTool.js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';

const ctx = { cwd: process.cwd(), abortSignal: new AbortController().signal };

describe('GitStatusTool', () => {
  it('returns git status', async () => {
    const result = await GitStatusTool.execute({}, ctx);
    expect(result.isError).toBe(false);
  });
});

describe('GitDiffTool', () => {
  it('returns git diff', async () => {
    const result = await GitDiffTool.execute({}, ctx);
    expect(result.isError).toBe(false);
  });
});

describe('NotebookReadTool', () => {
  it('reads a notebook', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'synapse-nb-'));
    const nb = { cells: [{ cell_type: 'code', source: ['print("hello")'] }] };
    writeFileSync(join(dir, 'test.ipynb'), JSON.stringify(nb));
    const result = await NotebookReadTool.execute({ notebook_path: join(dir, 'test.ipynb') }, { ...ctx, cwd: dir });
    expect(result.output).toContain('print("hello")');
    expect(result.output).toContain('(code)');
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns error for missing file', async () => {
    const result = await NotebookReadTool.execute({ notebook_path: '/nonexistent.ipynb' }, ctx);
    expect(result.isError).toBe(true);
  });
});
