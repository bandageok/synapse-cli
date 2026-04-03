import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GlobTool } from '../src/tools/GlobTool.js';
import { GrepTool } from '../src/tools/GrepTool.js';

describe('GlobTool', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = join(tmpdir(), 'cclaw-glob-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'test.ts'), 'content', 'utf-8');
    writeFileSync(join(tmpDir, 'readme.md'), '', 'utf-8');
    writeFileSync(join(tmpDir, 'src', 'main.ts'), 'content', 'utf-8');
    writeFileSync(join(tmpDir, 'src', 'util.js'), 'content', 'utf-8');
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('matches by extension', async () => {
    const result = await GlobTool.execute({ pattern: '*.ts' }, { cwd: tmpDir, abortSignal: new AbortController().signal });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('test.ts');
    expect(result.output).not.toContain('readme');
  });

  it('matches by directory pattern', async () => {
    const result = await GlobTool.execute({ pattern: 'src/*.ts' }, { cwd: tmpDir, abortSignal: new AbortController().signal });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('main.ts');
    expect(result.output).not.toContain('test.ts');
  });

  it('recursive search with **', async () => {
    const result = await GlobTool.execute({ pattern: '**/*.js' }, { cwd: tmpDir, abortSignal: new AbortController().signal });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('util.js');
  });
});

describe('GrepTool', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = join(tmpdir(), 'cclaw-grep-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'hello.txt'), 'hello world\nsecond line', 'utf-8');
    writeFileSync(join(tmpDir, 'data.csv'), 'name,age\nalice,30', 'utf-8');
    writeFileSync(join(tmpDir, 'empty.txt'), '', 'utf-8');
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('finds matching lines', async () => {
    const result = await GrepTool.execute({ pattern: 'hello' }, { cwd: tmpDir, abortSignal: new AbortController().signal });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('hello.txt');
    expect(result.output).toContain('hello world');
  });

  it('returns no match for non-existent pattern', async () => {
    const result = await GrepTool.execute({ pattern: 'zzznomatch' }, { cwd: tmpDir, abortSignal: new AbortController().signal });
    expect(result.output).toMatch(/No match|No result/i);
  });

  it('case-insensitive search', async () => {
    const result = await GrepTool.execute({ pattern: 'HELLO', case_insensitive: true }, { cwd: tmpDir, abortSignal: new AbortController().signal });
    // On Windows findstr /I is case-insensitive by default; on Linux grep -i is
    expect(result.output).toMatch(/hello|HELLO/i);
  });
});
