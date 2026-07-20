// src/utils/permissions.ts
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';

export interface PermissionConfig {
  allowedTools: string[];      // Allow in ask mode after path and sensitive-data checks
  deniedTools: string[];       // Deny in every profile
  askForTools: string[];       // Require approval in ask mode; takes precedence over allowedTools
}

const DEFAULT_CONFIG: PermissionConfig = {
  allowedTools: ['FileRead', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'GitStatus', 'GitDiff', 'NotebookRead', 'TodoWrite', 'AskUserQuestion', 'Skill'],
  deniedTools: [],
  askForTools: ['Bash', 'PowerShell', 'Task', 'FileEdit', 'FileWrite', 'NotebookEdit', 'GitCommit'],
};

export function loadPermissions(dataDir: string): PermissionConfig {
  const path = join(dataDir, 'permissions.json');
  if (!existsSync(path)) {
    const defaults = defaultConfig();
    savePermissions(dataDir, defaults);
    return defaults;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    throw new Error(`Invalid permissions file ${path}: expected valid JSON.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid permissions file ${path}: expected a JSON object.`);
  }
  const config = parsed as Partial<PermissionConfig>;
  return {
    allowedTools: stringArray(config.allowedTools, DEFAULT_CONFIG.allowedTools, 'allowedTools', path),
    deniedTools: stringArray(config.deniedTools, DEFAULT_CONFIG.deniedTools, 'deniedTools', path),
    askForTools: stringArray(config.askForTools, DEFAULT_CONFIG.askForTools, 'askForTools', path),
  };
}

function defaultConfig(): PermissionConfig {
  return {
    allowedTools: [...DEFAULT_CONFIG.allowedTools],
    deniedTools: [...DEFAULT_CONFIG.deniedTools],
    askForTools: [...DEFAULT_CONFIG.askForTools],
  };
}

function stringArray(value: unknown, fallback: string[], field: string, path: string): string[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`Invalid permissions file ${path}: ${field} must be an array of non-empty tool names.`);
  }
  return [...new Set(value)];
}

export function savePermissions(dataDir: string, config: PermissionConfig): void {
  const path = join(dataDir, 'permissions.json');
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function addToAllowlist(dataDir: string, tool: string): void {
  const config = loadPermissions(dataDir);
  let changed = false;
  if (!config.allowedTools.includes(tool)) {
    config.allowedTools.push(tool);
    changed = true;
  }
  const nextAskForTools = config.askForTools.filter(t => t !== tool);
  if (nextAskForTools.length !== config.askForTools.length) changed = true;
  config.askForTools = nextAskForTools;
  if (changed) savePermissions(dataDir, config);
}
