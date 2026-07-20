import { existsSync, realpathSync } from 'fs';
import { dirname, isAbsolute, relative, resolve } from 'path';
import type { ToolContext } from '../core/types.js';

export type PathAccess = 'read' | 'write';

export class WorkspacePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspacePathError';
  }
}

function comparable(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

function isWithin(root: string, target: string): boolean {
  const rel = relative(comparable(root), comparable(target));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function nearestExistingAncestor(path: string): string {
  let current = path;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

function canonical(path: string): string {
  return existsSync(path) ? realpathSync.native(path) : resolve(path);
}

export function workspaceRoots(ctx: ToolContext): string[] {
  const roots = ctx.workspaceRoots?.length ? ctx.workspaceRoots : [ctx.cwd];
  return roots.map(root => resolve(root));
}

export function resolveWorkspacePath(
  requestedPath: string,
  ctx: ToolContext,
  access: PathAccess,
): string {
  if (typeof requestedPath !== 'string' || requestedPath.trim() === '') {
    throw new WorkspacePathError('Path must be a non-empty string.');
  }

  const target = resolve(ctx.cwd, requestedPath);
  const roots = workspaceRoots(ctx);
  const lexicalRoot = roots.find(root => isWithin(root, target));
  if (!lexicalRoot) {
    throw new WorkspacePathError(`Path is outside the workspace: ${requestedPath}`);
  }

  const existingTarget = access === 'write' ? nearestExistingAncestor(target) : target;
  if (existsSync(existingTarget)) {
    const realTarget = canonical(existingTarget);
    const realRoot = canonical(lexicalRoot);
    if (!isWithin(realRoot, realTarget)) {
      throw new WorkspacePathError(`Path escapes the workspace through a link: ${requestedPath}`);
    }
  }

  return target;
}

export function isSensitivePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  const segments = normalized.split('/').filter(Boolean);
  const name = segments.at(-1) ?? '';
  return segments.some(segment => ['.ssh', '.aws', '.gnupg'].includes(segment))
    || ['.env', '.npmrc', '.pypirc', 'credentials', 'credentials.json', 'id_rsa', 'id_ed25519'].includes(name)
    || /\.(pem|p12|pfx|key)$/.test(name);
}

const TOOL_PATH_FIELDS: Record<string, Array<{ field: string; access: PathAccess }>> = {
  FileRead: [{ field: 'file_path', access: 'read' }],
  FileWrite: [{ field: 'file_path', access: 'write' }],
  FileEdit: [{ field: 'file_path', access: 'write' }],
  Glob: [{ field: 'path', access: 'read' }],
  Grep: [{ field: 'path', access: 'read' }],
  NotebookRead: [{ field: 'notebook_path', access: 'read' }],
  NotebookEdit: [{ field: 'notebook_path', access: 'write' }],
  ImageRead: [{ field: 'file_path', access: 'read' }],
  ImageGenerate: [{ field: 'output_path', access: 'write' }],
  TTS: [{ field: 'output_path', access: 'write' }],
};

export function inspectToolPaths(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): { sensitive: boolean; error?: string } {
  let sensitive = false;
  for (const spec of TOOL_PATH_FIELDS[toolName] ?? []) {
    const value = input[spec.field];
    if (value === undefined) continue;
    if (typeof value !== 'string') return { sensitive, error: `${spec.field} must be a string.` };
    try {
      const resolved = resolveWorkspacePath(value, ctx, spec.access);
      sensitive ||= isSensitivePath(resolved);
    } catch (error) {
      return { sensitive, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { sensitive };
}
