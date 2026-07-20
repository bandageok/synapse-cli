import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import Ajv, { type ValidateFunction } from 'ajv';
import type { PermissionMode, PermissionModeInput, ToolContext, ToolDef, ToolResult, ToolUse } from './types.js';
import { loadPermissions, type PermissionConfig } from '../utils/permissions.js';
import { inspectToolPaths } from '../utils/workspacePaths.js';
import { PermissionManager } from './PermissionManager.js';

export interface ToolRegistryOptions {
  permissions?: PermissionConfig;
  workspaceRoots?: string[];
  permissionMode?: PermissionModeInput;
  permissionManager?: PermissionManager;
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
  private permissionManager: PermissionManager;

  constructor(options: ToolRegistryOptions = {}) {
    this.permissions = options.permissions ? structuredClone(options.permissions) : null;
    this.workspaceRoots = this.normalizeWorkspaceRoots(options.workspaceRoots ?? [process.cwd()]);
    this.permissionManager = options.permissionManager ?? new PermissionManager(options.permissionMode ?? 'ask');
  }

  initPermissions(dataDir: string): void {
    this.dataDir = dataDir;
    this.permissions = loadPermissions(dataDir);
  }

  setWorkspaceRoots(roots: string[]): void {
    this.workspaceRoots = this.normalizeWorkspaceRoots(roots);
  }

  setPermissionMode(mode: PermissionModeInput): PermissionMode {
    return this.permissionManager.setMode(mode).mode;
  }

  getPermissionMode(): PermissionMode {
    return this.permissionManager.getMode();
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
    if (permission === 'deny') return { output: `Error: ${this.permissionDeniedMessage(toolUse)}`, isError: true };
    if (permission === 'ask' && !authorization.humanApproved) {
      return { output: `Error: Human approval required for tool "${toolUse.name}"`, isError: true };
    }
    return tool.execute(toolUse.input, context);
  }

  checkPermission(toolUse: ToolUse, ctx?: ToolContext): 'allow' | 'deny' | 'ask' {
    const tool = this.tools.get(toolUse.name);
    if (!tool || !tool.isEnabled() || this.validateInput(toolUse) || !this.permissions) return 'deny';
    const pathInspection = inspectToolPaths(toolUse.name, toolUse.input, ctx ?? this.defaultContext());
    if (pathInspection.error || this.permissions.deniedTools.includes(toolUse.name)) return 'deny';
    const mode = this.permissionManager.getMode();
    if (mode === 'full-access') return 'allow';
    if (pathInspection.sensitive) return mode === 'ask' ? 'ask' : 'deny';
    if (mode === 'auto') {
      if (tool.permissions === 'read' || tool.permissions === 'write' || tool.autoApproveInWorkspace) return 'allow';
      return 'deny';
    }
    if (this.permissions.askForTools.includes(toolUse.name)) return 'ask';
    if (this.permissions.allowedTools.includes(toolUse.name)) return 'allow';
    return tool.permissions === 'read' ? 'allow' : 'ask';
  }

  permissionDeniedMessage(toolUse: ToolUse): string {
    const mode = this.permissionManager.getMode();
    if (mode === 'auto') {
      return `Permission denied for tool "${toolUse.name}" in auto mode. The tool cannot run inside the active workspace-safe boundary; use ask or explicitly switch to full-access.`;
    }
    return `Permission denied for tool "${toolUse.name}".`;
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
    const restrictedPermissions = this.permissions
      ? {
          allowedTools: this.permissions.allowedTools.filter(name => this.tools.get(name)?.permissions === 'read'),
          deniedTools: [...this.permissions.deniedTools],
          askForTools: [...new Set([
            ...this.permissions.askForTools,
            ...toolNames.filter(name => {
              const tool = this.tools.get(name);
              return tool && tool.permissions !== 'read' && !this.permissions?.deniedTools.includes(name);
            }),
          ])],
        }
      : undefined;
    const clone = new ToolRegistry({
      permissions: restrictedPermissions,
      workspaceRoots: this.workspaceRoots,
      permissionManager: this.permissionManager,
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
