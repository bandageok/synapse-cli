// src/services/mcp/client.ts
// MCP client — 对标 Claude Code MCP 支持
// 支持 tools/resources/prompts/sampling
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import type { MCPServerConfig, MCPTool, MCPResource, MCPPrompt, MCPServerCapabilities } from './types.js';
import type { ToolDef, ToolResult } from '../../core/types.js';

export class MCPClient {
  private servers: Map<string, {
    config: MCPServerConfig;
    process: ChildProcess | null;
    capabilities: MCPServerCapabilities;
    tools: MCPTool[];
    resources: MCPResource[];
    prompts: MCPPrompt[];
  }> = new Map();

  private requestId = 0;

  loadConfig(dataDir: string): MCPServerConfig[] {
    const path = join(dataDir, '.mcp.json');
    if (!existsSync(path)) return [];
    try {
      const config = JSON.parse(readFileSync(path, 'utf-8'));
      const servers: MCPServerConfig[] = [];
      for (const [name, value] of Object.entries(config.mcpServers ?? {})) {
        servers.push({ name, ...(value as any) });
      }
      return servers;
    } catch {
      return [];
    }
  }

  async connect(config: MCPServerConfig): Promise<MCPTool[]> {
    try {
      const proc = spawn(config.command, config.args ?? [], {
        env: { ...process.env, ...config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const serverEntry = {
        config,
        process: proc,
        capabilities: {} as MCPServerCapabilities,
        tools: [] as MCPTool[],
        resources: [] as MCPResource[],
        prompts: [] as MCPPrompt[],
      };
      this.servers.set(config.name, serverEntry);

      // Send initialize
      const initResp = await this.sendRequest(proc, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { sampling: {} },
        clientInfo: { name: 'cclaw', version: '0.2.0' },
      });

      serverEntry.capabilities = initResp?.result?.capabilities ?? {};

      // Send initialized notification
      this.sendNotification(proc, 'notifications/initialized', {});

      // List tools
      if (serverEntry.capabilities.tools) {
        const toolsResp = await this.sendRequest(proc, 'tools/list', {});
        serverEntry.tools = toolsResp?.result?.tools ?? [];
      }

      // List resources
      if (serverEntry.capabilities.resources) {
        const resResp = await this.sendRequest(proc, 'resources/list', {});
        serverEntry.resources = resResp?.result?.resources ?? [];
      }

      // List prompts
      if (serverEntry.capabilities.prompts) {
        const promptsResp = await this.sendRequest(proc, 'prompts/list', {});
        serverEntry.prompts = promptsResp?.result?.prompts ?? [];
      }

      return serverEntry.tools;
    } catch {
      return [];
    }
  }

  /** 获取所有已连接服务器的资源 */
  getResources(): { server: string; resource: MCPResource }[] {
    const result: { server: string; resource: MCPResource }[] = [];
    for (const [name, server] of this.servers) {
      for (const resource of server.resources) {
        result.push({ server: name, resource });
      }
    }
    return result;
  }

  /** 获取所有已连接服务器的 prompts */
  getPrompts(): { server: string; prompt: MCPPrompt }[] {
    const result: { server: string; prompt: MCPPrompt }[] = [];
    for (const [name, server] of this.servers) {
      for (const prompt of server.prompts) {
        result.push({ server: name, prompt });
      }
    }
    return result;
  }

  /** 读取资源 */
  async readResource(serverName: string, uri: string): Promise<string> {
    const server = this.servers.get(serverName);
    if (!server?.process) return `Error: MCP server ${serverName} not connected`;

    const resp = await this.sendRequest(server.process, 'resources/read', { uri });
    const contents = resp?.result?.contents ?? [];
    return contents.map((c: any) => c.text ?? c.blob ?? '').join('\n') || 'Empty resource';
  }

  /** 获取 prompt */
  async getPrompt(serverName: string, name: string, args?: Record<string, string>): Promise<string> {
    const server = this.servers.get(serverName);
    if (!server?.process) return `Error: MCP server ${serverName} not connected`;

    const resp = await this.sendRequest(server.process, 'prompts/get', { name, arguments: args });
    const messages = resp?.result?.messages ?? [];
    return messages.map((m: any) => m.content?.text ?? '').join('\n') || 'Empty prompt';
  }

  /** 包装为 ToolDef */
  wrapAsToolDef(mcpTool: MCPTool, serverName: string): ToolDef {
    return {
      name: `mcp__${serverName}__${mcpTool.name}`,
      description: `[MCP:${serverName}] ${mcpTool.description}`,
      schema: mcpTool.inputSchema,
      permissions: 'execute',
      isEnabled: () => true,
      execute: async (input): Promise<ToolResult> => {
        const server = this.servers.get(serverName);
        if (!server?.process) return { output: `MCP server ${serverName} not connected`, isError: true };

        const resp = await this.sendRequest(server.process, 'tools/call', {
          name: mcpTool.name,
          arguments: input,
        });

        if (resp?.error) {
          return { output: `MCP error: ${resp.error.message}`, isError: true };
        }

        const content = resp?.result?.content?.[0]?.text ?? JSON.stringify(resp?.result ?? 'No result');
        return { output: content, isError: false };
      },
    };
  }

  /** 包装资源为 ToolDef */
  wrapResourceAsToolDef(resource: MCPResource, serverName: string): ToolDef {
    return {
      name: `mcp__${serverName}__res__${resource.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
      description: `[MCP Resource:${serverName}] ${resource.description ?? resource.name} (${resource.uri})`,
      schema: { type: 'object', properties: {} },
      permissions: 'read',
      isEnabled: () => true,
      execute: async (): Promise<ToolResult> => {
        const content = await this.readResource(serverName, resource.uri);
        return { output: content, isError: false };
      },
    };
  }

  disconnect(): void {
    for (const [, server] of this.servers) {
      server.process?.kill();
    }
    this.servers.clear();
  }

  // --- 内部方法 ---

  private sendRequest(proc: ChildProcess, method: string, params: any): Promise<any> {
    return new Promise((resolve) => {
      const id = ++this.requestId;
      const req = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      proc.stdin?.write(req);

      let buffer = '';
      const handler = (data: Buffer) => {
        buffer += data.toString();
        for (const line of buffer.split('\n')) {
          if (!line.trim()) continue;
          try {
            const resp = JSON.parse(line);
            if (resp.id === id) {
              proc.stdout?.off('data', handler);
              resolve(resp);
              return;
            }
          } catch {}
        }
      };
      proc.stdout?.on('data', handler);
      setTimeout(() => resolve(null), 10000);
    });
  }

  private sendNotification(proc: ChildProcess, method: string, params: any): void {
    const req = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    proc.stdin?.write(req);
  }
}
