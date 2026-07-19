import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path';

export type MemorySource = 'long-term' | 'daily' | 'learning' | 'session';

export interface MemoryFile {
  path: string;
  relativePath: string;
  source: MemorySource;
  bytes: number;
  lines: number;
  modifiedAt: string;
  injected: boolean;
}

export interface MemoryInspection {
  dataDir: string;
  totalFiles: number;
  totalBytes: number;
  sources: Array<{
    source: MemorySource;
    files: number;
    bytes: number;
    lines: number;
  }>;
  files: MemoryFile[];
}

export interface MemorySearchMatch {
  path: string;
  source: MemorySource;
  line: number;
  text: string;
}

export interface MemoryPruneResult {
  applied: boolean;
  scope: PruneScope;
  olderThanDays: number;
  files: Array<{ path: string; bytes: number; modifiedAt: string }>;
  bytes: number;
}

export type PruneScope = 'memory' | 'learnings' | 'sessions' | 'all';

interface CollectedFile extends MemoryFile {
  content?: string;
}

function normalizeRelative(path: string): string {
  return path.split(sep).join('/');
}

function countLines(content: string): number {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

function walkRegularFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) result.push(...walkRegularFiles(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

function describeFile(path: string, dataDir: string, source: MemorySource): CollectedFile {
  const content = readFileSync(path, 'utf-8');
  const stat = statSync(path);
  const relativePath = normalizeRelative(relative(dataDir, path));
  return {
    path,
    relativePath,
    source,
    bytes: stat.size,
    lines: countLines(content),
    modifiedAt: stat.mtime.toISOString(),
    injected: relativePath === 'MEMORY.md' && countLines(content) <= 200,
    content,
  };
}

export function collectMemoryFiles(
  dataDir: string,
  options: { includeSessions?: boolean } = {},
): CollectedFile[] {
  const files: CollectedFile[] = [];
  const longTerm = join(dataDir, 'MEMORY.md');
  if (existsSync(longTerm) && lstatSync(longTerm).isFile() && !lstatSync(longTerm).isSymbolicLink()) {
    files.push(describeFile(longTerm, dataDir, 'long-term'));
  }

  const addDirectory = (name: string, source: MemorySource, extensions: string[]) => {
    for (const path of walkRegularFiles(join(dataDir, name))) {
      if (!extensions.some(extension => path.toLowerCase().endsWith(extension))) continue;
      files.push(describeFile(path, dataDir, source));
    }
  };
  addDirectory('memory', 'daily', ['.md', '.txt']);
  addDirectory('.learnings', 'learning', ['.md', '.txt', '.json']);
  if (options.includeSessions) addDirectory('sessions', 'session', ['.json']);

  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function inspectMemory(dataDir: string): MemoryInspection {
  const files = collectMemoryFiles(dataDir, { includeSessions: true });
  const sources = (['long-term', 'daily', 'learning', 'session'] as MemorySource[]).map(source => {
    const selected = files.filter(file => file.source === source);
    return {
      source,
      files: selected.length,
      bytes: selected.reduce((sum, file) => sum + file.bytes, 0),
      lines: selected.reduce((sum, file) => sum + file.lines, 0),
    };
  });
  return {
    dataDir,
    totalFiles: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    sources,
    files: files.map(({ content: _content, ...file }) => file),
  };
}

export function searchMemory(
  dataDir: string,
  query: string,
  options: { includeSessions?: boolean; limit?: number } = {},
): MemorySearchMatch[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) throw new Error('Search query must not be empty.');
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('Search limit must be an integer between 1 and 500.');
  }

  const matches: MemorySearchMatch[] = [];
  for (const file of collectMemoryFiles(dataDir, { includeSessions: options.includeSessions })) {
    const lines = (file.content ?? '').split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      if (!lines[index].toLocaleLowerCase().includes(needle)) continue;
      matches.push({
        path: file.relativePath,
        source: file.source,
        line: index + 1,
        text: lines[index].trim().slice(0, 500),
      });
      if (matches.length >= limit) return matches;
    }
  }
  return matches;
}

function isPrunable(path: string, scope: PruneScope, dataDir: string): boolean {
  const rel = normalizeRelative(relative(dataDir, path));
  if (scope === 'memory') {
    const name = basename(path);
    return rel.startsWith('memory/')
      && (/^\d{4}-\d{2}-\d{2}\.md$/i.test(name) || /^archive-.+\.md$/i.test(name));
  }
  if (scope === 'learnings') return rel.startsWith('.learnings/');
  if (scope === 'sessions') return rel.startsWith('sessions/') && rel.endsWith('.json');
  return isPrunable(path, 'memory', dataDir)
    || isPrunable(path, 'learnings', dataDir)
    || isPrunable(path, 'sessions', dataDir);
}

export function pruneMemory(
  dataDir: string,
  options: { olderThanDays: number; scope?: PruneScope; apply?: boolean },
): MemoryPruneResult {
  const olderThanDays = options.olderThanDays;
  if (!Number.isInteger(olderThanDays) || olderThanDays < 0 || olderThanDays > 36_500) {
    throw new Error('older-than must be an integer between 0 and 36500 days.');
  }
  const scope = options.scope ?? 'memory';
  if (!['memory', 'learnings', 'sessions', 'all'].includes(scope)) {
    throw new Error('Prune scope must be one of: memory, learnings, sessions, all.');
  }
  const cutoff = Date.now() - olderThanDays * 86_400_000;
  const candidateRoots = scope === 'all'
    ? ['memory', '.learnings', 'sessions']
    : [scope === 'learnings' ? '.learnings' : scope];
  const files = candidateRoots
    .flatMap(root => walkRegularFiles(join(dataDir, root)))
    .filter(path => isPrunable(path, scope, dataDir))
    .map(path => ({ path, stat: statSync(path) }))
    .filter(entry => entry.stat.mtimeMs < cutoff)
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(entry => ({
      path: normalizeRelative(relative(dataDir, entry.path)),
      absolutePath: entry.path,
      bytes: entry.stat.size,
      modifiedAt: entry.stat.mtime.toISOString(),
    }));

  if (options.apply) {
    for (const file of files) rmSync(file.absolutePath, { force: false });
  }
  return {
    applied: Boolean(options.apply),
    scope,
    olderThanDays,
    files: files.map(({ absolutePath: _absolutePath, ...file }) => file),
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
  };
}

function atomicWrite(path: string, content: string): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const temporary = join(dir, `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(temporary, content, 'utf-8');
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function exportMemory(
  dataDir: string,
  outputPath: string,
  options: { format?: 'json' | 'markdown'; includeSessions?: boolean; overwrite?: boolean } = {},
): { path: string; files: number; bytes: number; format: 'json' | 'markdown' } {
  const format = options.format ?? 'json';
  if (format !== 'json' && format !== 'markdown') {
    throw new Error('Export format must be json or markdown.');
  }
  const target = resolve(outputPath);
  if (existsSync(target) && !options.overwrite) {
    throw new Error(`Export already exists: ${target}. Use --force to overwrite it.`);
  }
  const files = collectMemoryFiles(dataDir, { includeSessions: options.includeSessions });
  const exportedAt = new Date().toISOString();
  const content = format === 'json'
    ? JSON.stringify({
        schemaVersion: 1,
        exportedAt,
        files: files.map(file => ({
          path: file.relativePath,
          source: file.source,
          modifiedAt: file.modifiedAt,
          content: file.content ?? '',
        })),
      }, null, 2) + '\n'
    : [
        '# Synapse Memory Export',
        '',
        `Exported: ${exportedAt}`,
        '',
        ...files.flatMap(file => [
          `## ${file.relativePath}`,
          '',
          `Source: ${file.source} | Modified: ${file.modifiedAt}`,
          '',
          file.content ?? '',
          '',
          '---',
          '',
        ]),
      ].join('\n');
  atomicWrite(target, content);
  return { path: target, files: files.length, bytes: Buffer.byteLength(content), format };
}

export function appendLongTermMemory(dataDir: string, text: string): { lines: number; path: string } {
  const entry = text.trim();
  if (!entry) throw new Error('Memory text must not be empty.');
  const path = join(dataDir, 'MEMORY.md');
  const current = existsSync(path) ? readFileSync(path, 'utf-8') : '# MEMORY.md\n';
  const updated = `${current.trimEnd()}\n- ${entry.replace(/\r?\n/g, ' ')}\n`;
  const lines = countLines(updated.trimEnd());
  if (lines > 200) {
    throw new Error(`MEMORY.md would have ${lines} lines (maximum 200). Prune or compact it first.`);
  }
  atomicWrite(path, updated);
  return { lines, path };
}

export function readManagedMemoryFile(dataDir: string, requestedPath: string): { path: string; content: string } {
  const requested = requestedPath.trim();
  if (!requested || isAbsolute(requested)) throw new Error('Provide a relative memory file path.');
  const candidates = collectMemoryFiles(dataDir, { includeSessions: true });
  const normalized = normalizeRelative(requested).replace(/^\.\//, '');
  const exact = candidates.find(file => file.relativePath === normalized);
  const shorthand = normalized.includes('/')
    ? undefined
    : candidates.find(file => file.relativePath === `memory/${normalized}`);
  const match = exact || shorthand;
  if (!match) throw new Error(`Memory file not found: ${requested}`);

  const resolvedDataDir = resolve(dataDir);
  const resolvedPath = resolve(match.path);
  if (resolvedPath !== resolvedDataDir && !resolvedPath.startsWith(resolvedDataDir + sep)) {
    throw new Error('Refusing to read outside the Synapse data directory.');
  }
  return { path: match.relativePath, content: match.content ?? readFileSync(match.path, 'utf-8') };
}
