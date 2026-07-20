// src/services/mcp/types.ts
export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResource {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
}

export interface MCPSamplingMessage {
  role: 'user' | 'assistant';
  content: { type: string; text?: string; data?: string; mimeType?: string };
}

export interface MCPSamplingParams {
  messages: MCPSamplingMessage[];
  modelPreferences?: { hints?: { name?: string }[]; costPriority?: number; speedPriority?: number; intelligencePriority?: number };
  systemPrompt?: string;
  includeContext?: 'none' | 'thisServer' | 'allServers';
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface MCPServerCapabilities {
  tools?: Record<string, unknown>;
  resources?: { subscribe?: boolean };
  prompts?: Record<string, unknown>;
  sampling?: Record<string, unknown>;
  logging?: Record<string, unknown>;
}

export interface MCPCapabilityManifest {
  capabilities: string[];
  capabilityDetails?: Record<string, unknown>;
  tools: string[];
  toolSchemas?: Record<string, string>;
  resources: string[];
  prompts: string[];
}
