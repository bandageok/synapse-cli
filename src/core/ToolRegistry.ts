// src/core/ToolRegistry.ts
import type { ToolDef, ToolUse, ToolResult, ToolContext } from './types.js';

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

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
    return 'allow';
  }
}
