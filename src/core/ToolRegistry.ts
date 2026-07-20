import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import Ajv, { type ValidateFunction } from 'ajv';
import type { PermissionMode, ToolContext, ToolDef, ToolResult, ToolUse } from './types.js';
import { loadPermissions, type PermissionConfig } from '../utils/permissions.js';
import { inspectToolPaths } from '../utils/workspacePaths.js';

export interface ToolRegistryOptions {
  permissions?: PermissionConfig;
  workspaceRoots?: string[];
  permissionMode?: PermissionMode;
}

export interface ToolAuthorization {
  humanApproved?: boolean;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();
  private permissions: PermissionConfig | null = null;
  private dataDir: string | null = null;
  private workspaceRoots: string[];
  private validators = new Map<string, ValidateFunction>();
  private ajv = new Ajv({ allErrors: true, useDefaults: true, strict: false });
  private permissionMode: PermissionMode;

  constructor(options: ToolRegistryOptions = {}) {
    this.permissions = options.permissions ? structuredClone(options.permissions) : null;
    this.workspaceRoots = this.normalizeWorkspaceRoots(options.workspaceRoots ?? [process.cwd()]);
    this.permissionMode = options.permissionMode ?? 'ask';
  }

  initPermissions(dataDir: string): void {
    this.dataDir = dataDir;
    this.permissions = loadPermissions(dataDir);
  }

  setWorkspaceRoots(roots: string[]): void {
    this.workspaceRoots = this.normalizeWorkspaceRoots(roots);
  }

  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode;
  }

  reloadPermissions(): void {
    if (this.dataDir) this.permissions = loadPermissions(this.dataDir);
  }

  register(tool: ToolDef): void {
    const schema = this.normalizedSchema(tool.schema);
    this.validators.set(tool.name, this.ajv.compile(schema));
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  schemas(): { name: string; description: string; input_schema: Record<string, unknown> }[] {
    return [...this.tools.values()].filter(tool => tool.isEnabled()).map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: this.normalizedSchema(tool.schema),
    }));
  }

  async execute(toolUse: ToolUse, ctx?: ToolContext, authorization: ToolAuthorization = {}): Promise<ToolResult> {
    const tool = this.tools.get(toolUse.name);
    if (!tool) return { output: `Error: Unknown tool "${toolUse.name}"`, isError: true };
    if (!tool.isEnabled()) return { output: `Error: Tool "${toolUse.name}" is disabled`, isError: true };
    const context = ctx
      ? { ...this.defaultContext(), ...ctx, workspaceRoots: ctx.workspaceRoots ?? this.workspaceRoots }
      : this.defaultContext();
    const validationError = this.validateInput(toolUse);
    if (validationError) return { output: `Error: ${validationError}`, isError: true };
    const pathInspection = inspectToolPaths(toolUse.name, toolUse.input, context);
    if (pathInspection.error) return { output: `Error: ${pathInspection.error}`, isError: true };
    const permission = this.checkPermission(toolUse, context);
    if (permission === 'deny') return { output: `Error: Permission denied for tool "${toolUse.name}"`, isError: true };
    if (permission === 'ask' && !authorization.humanApproved) {
      return { output: `Error: Human approval required for tool "${toolUse.name}"`, isError: true };
    }
    return tool.execute(toolUse.input, context);
  }

  checkPermission(toolUse: ToolUse, ctx?: ToolContext): 'allow' | 'deny' | 'ask' {
    const tool = this.tools.get(toolUse.name);
    if (!tool || this.validateInput(toolUse) || !this.permissions) return 'deny';
    const pathInspection = inspectToolPaths(toolUse.name, toolUse.input, ctx ?? this.defaultContext());
    if (pathInspection.error || this.permissions.deniedTools.includes(toolUse.name)) return 'deny';
    if (pathInspection.sensitive) return 'ask';
    if (this.permissionMode === 'workspace-auto' && (tool.permissions === 'write' || tool.autoApproveInWorkspace)) return 'allow';
    if (this.permissions.askForTools.includes(toolUse.name)) return 'ask';
    if (tool.permissions !== 'read') return 'ask';
    return this.permissions.allowedTools.includes(toolUse.name) || tool.permissions === 'read' ? 'allow' : 'ask';
  }

  validateInput(toolUse: ToolUse): string | null {
    const validator = this.validators.get(toolUse.name);
    if (!validator) return `Schema is unavailable for tool ${toolUse.name}.`;
    if (validator(toolUse.input)) return null;
    const detail = validator.errors?.map(error => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`).join('; ')
      ?? 'input is invalid';
    return `Invalid tool input for ${toolUse.name}: ${detail}`;
  }

  cloneRestricted(toolNames: string[]): ToolRegistry {
    const clone = new ToolRegistry({
      permissions: this.permissions ?? undefined,
      workspaceRoots: this.workspaceRoots,
      permissionMode: this.permissionMode,
    });
    for (const name of toolNames) {
      const tool = this.tools.get(name);
      if (tool) clone.register(tool);
    }
    return clone;
  }

  listToolNames(): string[] {
    return [...this.tools.keys()];
  }

  get count(): number {
    return this.tools.size;
  }

  private defaultContext(): ToolContext {
    return { cwd: process.cwd(), abortSignal: new AbortController().signal, workspaceRoots: this.workspaceRoots };
  }

  private normalizedSchema(schema: Record<string, unknown>): Record<string, unknown> {
    if (schema.type === 'object' && schema.properties && schema.additionalProperties === undefined) {
      return { ...schema, additionalProperties: false };
    }
    return schema;
  }

  private normalizeWorkspaceRoots(roots: string[]): string[] {
    if (roots.length === 0) throw new Error('At least one workspace root is required.');
    return [...new Set(roots.map(root => {
      const absolute = resolve(root);
      if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
        throw new Error(`Workspace root does not exist or is not a directory: ${root}`);
      }
      return absolute;
    }))];
  }
}
