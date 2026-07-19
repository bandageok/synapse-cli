// tests/fileTools.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileReadTool } from '../src/tools/FileReadTool.js';
import { FileWriteTool } from '../src/tools/FileWriteTool.js';
import { FileEditTool } from '../src/tools/FileEditTool.js';

describe('FileReadTool', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = join(tmpdir(), 'synapse-ft-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('reads an existing file', async () => {
    const testFile = join(tmpDir, 'test.txt');
    writeFileSync(testFile, 'hello world', 'utf-8');
    const result = await FileReadTool.execute({ file_path: testFile }, { cwd: tmpDir, abortSignal: new AbortController().signal });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('hello world');
  });

  it('returns error for non-existent file', async () => {
    const result = await FileReadTool.execute({ file_path: join(tmpDir, 'nope.txt') }, { cwd: tmpDir, abortSignal: new AbortController().signal });
    expect(result.isError).toBe(true);
    expect(result.output).toMatch(/not found|Error/i);
  });

  it('shows line count in output', async () => {
    const testFile = join(tmpDir, 'multi.txt');
    writeFileSync(testFile, 'line1\nline2\nline3', 'utf-8');
    const result = await FileReadTool.execute({ file_path: testFile }, { cwd: tmpDir, abortSignal: new AbortController().signal });
    expect(result.output).toContain('3');
  });
});

describe('FileWriteTool', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = join(tmpdir(), 'synapse-fw-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('writes a new file', async () => {
    const testFile = join(tmpDir, 'new.txt');
    const result = await FileWriteTool.execute({ file_path: testFile, content: 'test content' }, { cwd: tmpDir, abortSignal: new AbortController().signal });
    expect(result.isError).toBe(false);
    expect(result.output).toMatch(/written/i);
    // Verify file was actually written
    const { readFileSync } = await import('fs');
    expect(readFileSync(testFile, 'utf-8')).toBe('test content');
  });

  it('overwrites existing file', async () => {
    const testFile = join(tmpDir, 'overwrite.txt');
    writeFileSync(testFile, 'old content', 'utf-8');
    const result = await FileWriteTool.execute({ file_path: testFile, content: 'new content' }, { cwd: tmpDir, abortSignal: new AbortController().signal });
    expect(result.isError).toBe(false);
    const { readFileSync } = await import('fs');
    expect(readFileSync(testFile, 'utf-8')).toBe('new content');
  });

  it('creates parent directory if missing', async () => {
    const nestedFile = join(tmpDir, 'new_dir', 'nested.txt');
    const result = await FileWriteTool.execute({ file_path: nestedFile, content: 'nested' }, { cwd: tmpDir, abortSignal: new AbortController().signal });
    expect(result.isError).toBe(false);
    const { existsSync, readFileSync } = await import('fs');
    expect(existsSync(nestedFile)).toBe(true);
    expect(readFileSync(nestedFile, 'utf-8')).toBe('nested');
  });
});

describe('FileEditTool', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = join(tmpdir(), 'synapse-fe-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('replaces old_string with new_string', async () => {
    const testFile = join(tmpDir, 'edit.txt');
    writeFileSync(testFile, 'hello world\nline2\nline3', 'utf-8');
    const result = await FileEditTool.execute({
      file_path: testFile,
      old_string: 'hello world',
      new_string: 'goodbye world',
    }, { cwd: tmpDir, abortSignal: new AbortController().signal });
    expect(result.isError).toBe(false);
    const { readFileSync } = await import('fs');
    expect(readFileSync(testFile, 'utf-8')).toContain('goodbye world');
  });

  it('detects missing old_string', async () => {
    const testFile = join(tmpDir, 'missing.txt');
    writeFileSync(testFile, 'line1\nline2', 'utf-8');
    const result = await FileEditTool.execute({
      file_path: testFile,
      old_string: 'doesnotexist',
      new_string: 'replacement',
    }, { cwd: tmpDir, abortSignal: new AbortController().signal });
    expect(result.isError).toBe(true);
  });

  it('replaces only first occurrence by default', async () => {
    const testFile = join(tmpDir, 'dup.txt');
    writeFileSync(testFile, 'line\nline\nline', 'utf-8');
    const result = await FileEditTool.execute({
      file_path: testFile,
      old_string: 'line',
      new_string: 'changed',
    }, { cwd: tmpDir, abortSignal: new AbortController().signal });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('1 replacement');
    const { readFileSync } = await import('fs');
    const content = readFileSync(testFile, 'utf-8');
    expect(content).toBe('changed\nline\nline');
  });
});
