// src/core/types.ts

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
  _inputJson?: string;
  _parseError?: boolean;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  output: string;
  isError: boolean;
}

export interface ToolDef<T = Record<string, unknown>> {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  permissions: 'read' | 'write' | 'execute' | 'network';
  isEnabled: () => boolean;
  execute: (input: T, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  cwd: string;
  abortSignal: AbortSignal;
}

export type EngineEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_use'; tool: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; output: string }
  | { type: 'compressed'; tokensBefore: number; tokensAfter: number }
  | { type: 'end_turn' }
  | { type: 'error'; error: string };

export interface StreamChunk {
  type: string;
  [key: string]: unknown;
}

export interface StreamParams {
  system: string[];
  messages: Message[];
  tools: Record<string, unknown>[];
}

export interface Provider {
  name: string;
  stream(params: StreamParams): AsyncIterable<StreamChunk>;
}

export type PermissionMode = 'ask' | 'bubble' | 'allow';

export interface HookResult {
  blocked: boolean;
  reason?: string;
}

export interface CompressionResult {
  compressed: boolean;
  stats?: { tokensBefore: number; tokensAfter: number };
}

export interface SessionMeta {
  id: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  tokenUsage: number;
  turnCount: number;
}

export interface SessionData {
  messages: Message[];
  metadata: SessionMeta;
}

export enum AgentIsolation {
  InProcess = 'in_process',
  LocalAgent = 'local_agent',
}

export interface AgentConfig {
  isolation: AgentIsolation;
  maxTurns: number;
  timeout: number;
  tools: string[];
  inheritContext: boolean;
  canSpawnChildren: boolean;
}
