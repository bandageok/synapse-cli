import { spawn, type ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { isAbsolute, join } from 'path';
import type { ToolDef, ToolResult } from '../../core/types.js';
import { VERSION } from '../../version.js';
import { MCPTrustStore } from './trust.js';
import type {
  MCPCapabilityManifest, MCPPrompt, MCPResource, MCPServerCapabilities, MCPServerConfig, MCPTool,
} from './types.js';

type MCPResponse = {
  jsonrpc: string;
  id?: number;
  result?: {
    capabilities?: MCPServerCapabilities;
    tools?: MCPTool[];
    resources?: MCPResource[];
    prompts?: MCPPrompt[];
    contents?: Array<{ text?: string; blob?: string }>;
    messages?: Array<{ content?: { text?: string } }>;
    content?: Array<{ text?: string }>;
    [key: string]: unknown;
  };
  error?: { code: number; message: string };
};

interface ServerEntry {
  config: MCPServerConfig;
  process: ChildProcess;
  capabilities: MCPServerCapabilities;
  tools: MCPTool[];
  resources: MCPResource[];
  prompts: MCPPrompt[];
}

export class MCPClient {
  private servers = new Map<string, ServerEntry>();
  private requestId = 0;
  private diagnostics: string[] = [];
  private trustStore?: MCPTrustStore;

  constructor(dataDir?: string) {
    if (dataDir) this.trustStore = new MCPTrustStore(dataDir);
  }

  loadConfig(dataDir: string): MCPServerConfig[] {
    const path = join(dataDir, '.mcp.json');
    if (!existsSync(path)) return [];
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { mcpServers?: unknown };
      if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object' || Array.isArray(parsed.mcpServers)) return [];
      const servers: MCPServerConfig[] = [];
      for (const [name, value] of Object.entries(parsed.mcpServers)) {
        const config = validateConfig(name, value);
        if (config) servers.push(config);
        else this.diagnostics.push(`${name}: invalid MCP configuration; skipped`);
      }
      return servers;
    } catch (error) {
      this.diagnostics.push(`MCP config parse failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  async connect(config: MCPServerConfig): Promise<MCPTool[]> {
    if (!this.trustStore?.verifyCommand(config)) {
      this.diagnostics.push(`${config.name}: command is not trusted or its fingerprint changed; run "synapse mcp trust ${config.name}"`);
      return [];
    }
    try {
      const entry = await this.start(config);
      const manifest = capabilityManifest(entry);
      if (!this.trustStore.verifyCapabilities(config, manifest)) {
        entry.process.kill();
        this.servers.delete(config.name);
        this.diagnostics.push(`${config.name}: capability manifest changed; review and re-run "synapse mcp trust ${config.name}"`);
        return [];
      }
      this.servers.set(config.name, entry);
      return entry.tools;
    } catch (error) {
      this.diagnostics.push(`${config.name}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  async inspectAndTrust(config: MCPServerConfig, dataDir: string): Promise<{ manifest: MCPCapabilityManifest; commandFingerprint: string; capabilityFingerprint: string }> {
    const store = this.trustStore ?? new MCPTrustStore(dataDir);
    const entry = await this.start(config);
    try {
      const manifest = capabilityManifest(entry);
      const record = store.trust(config, manifest);
      return { manifest, commandFingerprint: record.commandFingerprint, capabilityFingerprint: record.capabilityFingerprint };
    } finally {
      entry.process.kill();
      this.servers.delete(config.name);
    }
  }

  getDiagnostics(): string[] {
    return [...this.diagnostics];
  }

  getResources(): { server: string; resource: MCPResource }[] {
    return [...this.servers].flatMap(([server, entry]) => entry.resources.map(resource => ({ server, resource })));
  }

  getPrompts(): { server: string; prompt: MCPPrompt }[] {
    return [...this.servers].flatMap(([server, entry]) => entry.prompts.map(prompt => ({ server, prompt })));
  }

  async readResource(serverName: string, uri: string): Promise<string> {
    const server = this.servers.get(serverName);
    if (!server) return `Error: MCP server ${serverName} not connected`;
    const response = await this.sendRequest(server.process, 'resources/read', { uri });
    return (response.result?.contents ?? []).map(content => content.text ?? content.blob ?? '').join('\n') || 'Empty resource';
  }

  async getPrompt(serverName: string, name: string, args?: Record<string, string>): Promise<string> {
    const server = this.servers.get(serverName);
    if (!server) return `Error: MCP server ${serverName} not connected`;
    const response = await this.sendRequest(server.process, 'prompts/get', { name, arguments: args });
    return (response.result?.messages ?? []).map(message => message.content?.text ?? '').join('\n') || 'Empty prompt';
  }

  wrapAsToolDef(mcpTool: MCPTool, serverName: string): ToolDef {
    return {
      name: `mcp__${serverName}__${mcpTool.name}`,
      description: `[MCP:${serverName}] ${mcpTool.description}`,
      schema: mcpTool.inputSchema,
      permissions: 'execute',
      isEnabled: () => this.servers.has(serverName),
      execute: async (input): Promise<ToolResult> => {
        const server = this.servers.get(serverName);
        if (!server) return { output: `MCP server ${serverName} not connected`, isError: true };
        const response = await this.sendRequest(server.process, 'tools/call', { name: mcpTool.name, arguments: input });
        if (response.error) return { output: `MCP error: ${response.error.message}`, isError: true };
        const content = response.result?.content?.map(item => item.text ?? '').join('\n') ?? JSON.stringify(response.result ?? 'No result');
        return { output: content, isError: false };
      },
    };
  }

  wrapResourceAsToolDef(resource: MCPResource, serverName: string): ToolDef {
    return {
      name: `mcp__${serverName}__res__${resource.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
      description: `[MCP Resource:${serverName}] ${resource.description ?? resource.name} (${resource.uri})`,
      schema: { type: 'object', properties: {} },
      permissions: 'read',
      isEnabled: () => this.servers.has(serverName),
      execute: async () => ({ output: await this.readResource(serverName, resource.uri), isError: false }),
    };
  }

  disconnect(): void {
    for (const server of this.servers.values()) server.process.kill();
    this.servers.clear();
  }

  private async start(config: MCPServerConfig): Promise<ServerEntry> {
    const proc = spawn(config.command, config.args ?? [], {
      cwd: config.cwd,
      env: { ...process.env, ...config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    proc.stderr?.resume();
    try {
      const entry: ServerEntry = { config, process: proc, capabilities: {}, tools: [], resources: [], prompts: [] };
      const initialized = await this.sendRequest(proc, 'initialize', {
        protocolVersion: '2024-11-05', capabilities: { sampling: {} }, clientInfo: { name: 'synapse', version: VERSION },
      });
      if (initialized.error) throw new Error(`initialize failed: ${initialized.error.message}`);
      entry.capabilities = initialized.result?.capabilities ?? {};
      this.sendNotification(proc, 'notifications/initialized', {});
      if (entry.capabilities.tools) entry.tools = (await this.sendRequest(proc, 'tools/list', {})).result?.tools ?? [];
      if (entry.capabilities.resources) entry.resources = (await this.sendRequest(proc, 'resources/list', {})).result?.resources ?? [];
      if (entry.capabilities.prompts) entry.prompts = (await this.sendRequest(proc, 'prompts/list', {})).result?.prompts ?? [];
      return entry;
    } catch (error) {
      proc.kill();
      throw error;
    }
  }

  private sendRequest(proc: ChildProcess, method: string, params: unknown): Promise<MCPResponse> {
    return new Promise((resolvePromise, reject) => {
      const id = ++this.requestId;
      let buffer = '';
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        proc.stdout?.off('data', onData);
        proc.off('error', onError);
        proc.off('exit', onExit);
      };
      const finish = (response: MCPResponse) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolvePromise(response);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const onData = (data: Buffer) => {
        buffer += data.toString('utf-8');
        let newline = buffer.indexOf('\n');
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) {
            try {
              const response = JSON.parse(line) as MCPResponse;
              if (response.id === id) return finish(response);
            } catch {
              // Ignore log lines and unrelated malformed output until timeout.
            }
          }
          newline = buffer.indexOf('\n');
        }
      };
      const onError = (error: Error) => fail(error);
      const onExit = (code: number | null) => fail(new Error(`MCP server exited before ${method} completed (code ${code ?? 'unknown'}).`));
      const timer = setTimeout(() => fail(new Error(`MCP ${method} timed out after 10000ms.`)), 10_000);
      proc.stdout?.on('data', onData);
      proc.once('error', onError);
      proc.once('exit', onExit);
      proc.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  private sendNotification(proc: ChildProcess, method: string, params: unknown): void {
    proc.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }
}

function capabilityManifest(entry: ServerEntry): MCPCapabilityManifest {
  return {
    capabilities: Object.keys(entry.capabilities).sort(),
    capabilityDetails: { ...entry.capabilities },
    tools: entry.tools.map(tool => tool.name).sort(),
    toolSchemas: Object.fromEntries(entry.tools.map(tool => [
      tool.name,
      createHash('sha256').update(JSON.stringify(tool.inputSchema)).digest('hex'),
    ]).sort(([a], [b]) => a.localeCompare(b))),
    resources: entry.resources.map(resource => `${resource.name}:${resource.uri}`).sort(),
    prompts: entry.prompts.map(prompt => prompt.name).sort(),
  };
}

function validateConfig(name: string, value: unknown): MCPServerConfig | null {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(name) || !value || typeof value !== 'object' || Array.isArray(value)) return null;
  const config = value as Record<string, unknown>;
  if (typeof config.command !== 'string' || !config.command.trim() || /[\0\r\n]/.test(config.command)) return null;
  if (config.args !== undefined && (!Array.isArray(config.args) || config.args.some(arg => typeof arg !== 'string' || /\0/.test(arg)))) return null;
  if (config.env !== undefined && (!config.env || typeof config.env !== 'object' || Array.isArray(config.env)
    || Object.entries(config.env).some(([key, entry]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof entry !== 'string'))) return null;
  if (config.cwd !== undefined && (typeof config.cwd !== 'string' || !isAbsolute(config.cwd))) return null;
  return {
    name,
    command: config.command,
    args: config.args as string[] | undefined,
    env: config.env as Record<string, string> | undefined,
    cwd: config.cwd as string | undefined,
  };
}
