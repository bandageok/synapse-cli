// src/core/ToolRegistry.ts
import type { ToolDef, ToolUse, ToolResult, ToolContext } from './types.js';
import { loadPermissions, type PermissionConfig } from '../utils/permissions.js';

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();
  private permissions: PermissionConfig | null = null;
  private dataDir: string | null = null;

  /** 初始化权限系统 */
  initPermissions(dataDir: string): void {
    this.dataDir = dataDir;
    this.permissions = loadPermissions(dataDir);
  }

  /** 重新加载权限 */
  reloadPermissions(): void {
    if (this.dataDir) {
      this.permissions = loadPermissions(this.dataDir);
    }
  }

  register(tool: ToolDef): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  schemas(): { name: string; description: string; input_schema: Record<string, unknown> }[] {
    return Array.from(this.tools.values())
      .filter(t => t.isEnabled())
      .map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.schema,
      }));
  }

  async execute(toolUse: ToolUse, ctx?: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(toolUse.name);
    if (!tool) {
      return { output: `Error: Unknown tool "${toolUse.name}"`, isError: true };
    }
    if (!tool.isEnabled()) {
      return { output: `Error: Tool "${toolUse.name}" is disabled`, isError: true };
    }

    const context: ToolContext = ctx ?? {
      cwd: process.cwd(),
      abortSignal: new AbortController().signal,
    };

    return tool.execute(toolUse.input, context);
  }

  checkPermission(toolUse: ToolUse): 'allow' | 'deny' | 'ask' {
    const tool = this.tools.get(toolUse.name);
    if (!tool) return 'deny';

    // 如果没有初始化权限系统，默认允许
    if (!this.permissions) return 'allow';

    // 检查拒绝列表
    if (this.permissions.deniedTools.includes(toolUse.name)) {
      return 'deny';
    }

    // 检查允许列表
    if (this.permissions.allowedTools.includes(toolUse.name)) {
      return 'allow';
    }

    // 检查询问列表
    if (this.permissions.askForTools.includes(toolUse.name)) {
      return 'ask';
    }

    // 根据工具权限级别决定
    switch (tool.permissions) {
      case 'read':
        return 'allow';
      case 'write':
      case 'execute':
      case 'network':
        return 'ask';
      default:
        return 'ask';
    }
  }

  /** 获取所有已注册工具名称 */
  listToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /** 获取工具数量 */
  get count(): number {
    return this.tools.size;
  }
}
