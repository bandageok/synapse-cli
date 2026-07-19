import { describe, it, expect } from 'vitest';
import { BashTool } from '../src/tools/BashTool.js';
import { FileReadTool } from '../src/tools/FileReadTool.js';
import { FileWriteTool } from '../src/tools/FileWriteTool.js';
import { FileEditTool } from '../src/tools/FileEditTool.js';
import { GlobTool } from '../src/tools/GlobTool.js';
import { TodoWriteTool } from '../src/tools/TodoWriteTool.js';
import { AskUserQuestionTool } from '../src/tools/AskUserQuestionTool.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';

const ctx = { cwd: process.cwd(), abortSignal: new AbortController().signal };

describe('BashTool', () => {
  it('executes a simple command', async () => {
    const result = await BashTool.execute({ command: 'echo hello' }, ctx);
    expect(result.output.trim()).toBe('hello');
    expect(result.isError).toBe(false);
  });

  it('returns error on failed command', async () => {
    const result = await BashTool.execute({ command: 'exit 1' }, ctx);
    expect(result.isError).toBe(true);
  });
});

describe('FileReadTool', () => {
  it('reads a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'synapse-'));
    writeFileSync(join(dir, 'test.txt'), 'hello world');
    const result = await FileReadTool.execute({ file_path: join(dir, 'test.txt') }, { ...ctx, cwd: dir });
    expect(result.output).toContain('hello world');
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns error for missing file', async () => {
    const result = await FileReadTool.execute({ file_path: '/nonexistent/file.txt' }, ctx);
    expect(result.isError).toBe(true);
  });

  it('reads with offset and limit', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'synapse-'));
    writeFileSync(join(dir, 'lines.txt'), 'line1\nline2\nline3\nline4\nline5');
    const result = await FileReadTool.execute({ file_path: join(dir, 'lines.txt'), offset: 2, limit: 2 }, { ...ctx, cwd: dir });
    expect(result.output).toContain('line2');
    expect(result.output).toContain('line3');
    expect(result.output).not.toContain('line1');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('FileWriteTool', () => {
  it('writes a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'synapse-'));
    const result = await FileWriteTool.execute(
      { file_path: join(dir, 'out.txt'), content: 'test content' },
      { ...ctx, cwd: dir }
    );
    expect(result.isError).toBe(false);
    expect(result.output).toContain('written');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('FileEditTool', () => {
  it('edits a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'synapse-'));
    writeFileSync(join(dir, 'edit.txt'), 'hello world');
    const result = await FileEditTool.execute(
      { file_path: join(dir, 'edit.txt'), old_string: 'hello', new_string: 'goodbye' },
      { ...ctx, cwd: dir }
    );
    expect(result.isError).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns error when old_string not found', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'synapse-'));
    writeFileSync(join(dir, 'edit.txt'), 'hello world');
    const result = await FileEditTool.execute(
      { file_path: join(dir, 'edit.txt'), old_string: 'notfound', new_string: 'x' },
      { ...ctx, cwd: dir }
    );
    expect(result.isError).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('GlobTool', () => {
  it('finds files by pattern', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'synapse-'));
    writeFileSync(join(dir, 'a.ts'), '');
    writeFileSync(join(dir, 'b.js'), '');
    const result = await GlobTool.execute({ pattern: '*.ts' }, { ...ctx, cwd: dir });
    expect(result.output).toContain('a.ts');
    expect(result.output).not.toContain('b.js');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('TodoWriteTool', () => {
  it('creates a todo list', async () => {
    const result = await TodoWriteTool.execute({
      todos: [
        { id: '1', content: 'Task A', status: 'in_progress', priority: 'high' },
        { id: '2', content: 'Task B', status: 'pending', priority: 'medium' },
      ],
    }, ctx);
    expect(result.isError).toBe(false);
    expect(result.output).toContain('Task A');
    expect(result.output).toContain('🔄');
    expect(result.output).toContain('⬜');
  });
});

describe('AskUserQuestionTool', () => {
  it('asks a question', async () => {
    const result = await AskUserQuestionTool.execute({ question: 'Pick one?' }, ctx);
    expect(result.output).toContain('Pick one?');
  });

  it('includes options', async () => {
    const result = await AskUserQuestionTool.execute({ question: 'Pick?', options: ['A', 'B'] }, ctx);
    expect(result.output).toContain('1. A');
    expect(result.output).toContain('2. B');
  });
});
