// src/core/HookSystem.ts
import type { HookResult } from './types.js';

interface HookConfig {
  event: 'preToolUse' | 'postToolUse';
  tool?: string;
  command?: string;
  handler?: (toolUse: { id: string; name: string; input: Record<string, unknown> }, result?: any) => Promise<HookResult>;
}

export class HookSystem {
  private hooks: HookConfig[];

  constructor(config: { hooks: HookConfig[] } = { hooks: [] }) {
    this.hooks = config.hooks;
  }

  async preToolUse(toolUse: { id: string; name: string; input: Record<string, unknown> }): Promise<HookResult> {
    for (const hook of this.hooks) {
      if (hook.event !== 'preToolUse') continue;
      if (hook.tool && hook.tool !== toolUse.name) continue;
      if (hook.handler) {
        const result = await hook.handler(toolUse);
        if (result.blocked) return result;
      }
    }
    return { blocked: false };
  }

  async postToolUse(toolUse: { id: string; name: string; input: Record<string, unknown> }, result: any): Promise<void> {
    for (const hook of this.hooks) {
      if (hook.event !== 'postToolUse') continue;
      if (hook.tool && hook.tool !== toolUse.name) continue;
      if (hook.handler) {
        await hook.handler(toolUse, result);
      }
    }
  }
}
