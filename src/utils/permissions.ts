// src/utils/permissions.ts
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface PermissionConfig {
  allowedTools: string[];      // Always allow these tools
  deniedTools: string[];       // Always deny these tools
  askForTools: string[];       // Always ask for these tools
}

const DEFAULT_CONFIG: PermissionConfig = {
  allowedTools: ['FileRead', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'GitStatus', 'GitDiff', 'NotebookRead', 'TodoWrite', 'AskUserQuestion', 'Skill'],
  deniedTools: [],
  askForTools: ['Bash', 'PowerShell', 'Task', 'FileEdit', 'FileWrite', 'NotebookEdit', 'GitCommit'],
};

export function loadPermissions(dataDir: string): PermissionConfig {
  const path = join(dataDir, 'permissions.json');
  if (!existsSync(path)) {
    savePermissions(dataDir, DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<PermissionConfig>;
    return {
      allowedTools: stringArray(parsed.allowedTools, DEFAULT_CONFIG.allowedTools),
      deniedTools: stringArray(parsed.deniedTools, DEFAULT_CONFIG.deniedTools),
      askForTools: stringArray(parsed.askForTools, DEFAULT_CONFIG.askForTools),
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return [...fallback];
  return [...new Set(value)];
}

export function savePermissions(dataDir: string, config: PermissionConfig): void {
  const path = join(dataDir, 'permissions.json');
  writeFileSync(path, JSON.stringify(config, null, 2));
}

export function addToAllowlist(dataDir: string, tool: string): void {
  const config = loadPermissions(dataDir);
  if (!config.allowedTools.includes(tool)) {
    config.allowedTools.push(tool);
    config.askForTools = config.askForTools.filter(t => t !== tool);
    savePermissions(dataDir, config);
  }
}
