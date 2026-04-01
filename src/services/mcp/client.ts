// src/services/mcp/client.ts
// Basic MCP client — loads .mcp.json and wraps MCP tools as ToolDef
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import type { MCPServerConfig, MCPTool } from './types.js';
import type { ToolDef, ToolResult } from '../../core/types.js';

export class MCPClient {
  private servers: Map<string, { config: MCPServerConfig; process: ChildProcess | null }> = new Map();

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
      this.servers.set(config.name, { config, process: proc });

      // Send initialize request
      const initReq = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'cclaw', version: '0.2.0' } },
      }) + '\n';
      proc.stdin?.write(initReq);

      // Read response (simplified — real impl would handle streaming)
      return new Promise((resolve) => {
        let buffer = '';
        proc.stdout?.on('data', (data) => {
          buffer += data.toString();
          if (buffer.includes('\n')) {
            try {
              const response = JSON.parse(buffer.split('\n')[0]);
              if (response.result?.capabilities) {
                // Now list tools
                const listReq = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n';
                proc.stdin?.write(listReq);
              }
              if (response.result?.tools) {
                resolve(response.result.tools as MCPTool[]);
              }
            } catch {}
          }
        });
        // Timeout fallback
        setTimeout(() => resolve([]), 5000);
      });
    } catch {
      return [];
    }
  }

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

        return new Promise((resolve) => {
          const id = Date.now();
          const req = JSON.stringify({
            jsonrpc: '2.0', id,
            method: 'tools/call',
            params: { name: mcpTool.name, arguments: input },
          }) + '\n';
          server.process!.stdin?.write(req);

          let buffer = '';
          const handler = (data: Buffer) => {
            buffer += data.toString();
            for (const line of buffer.split('\n')) {
              if (!line.trim()) continue;
              try {
                const resp = JSON.parse(line);
                if (resp.id === id) {
                  server.process!.stdout?.off('data', handler);
                  const content = resp.result?.content?.[0]?.text ?? JSON.stringify(resp.result ?? resp.error);
                  resolve({ output: content, isError: !!resp.error });
                  return;
                }
              } catch {}
            }
          };
          server.process!.stdout?.on('data', handler);
          setTimeout(() => resolve({ output: 'MCP call timeout', isError: true }), 10000);
        });
      },
    };
  }

  disconnect(): void {
    for (const [, server] of this.servers) {
      server.process?.kill();
    }
    this.servers.clear();
  }
}
