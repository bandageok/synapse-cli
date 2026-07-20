// src/core/types.ts

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

export interface ImageBlock {
  type: 'image';
  source: { type: string; data: string; media_type: string };
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ImageBlock;

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

/** Type guards for ContentBlock narrowing */
export function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text';
}
export function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use';
}
export function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return block.type === 'tool_result';
}
export function isImageBlock(block: ContentBlock): block is ImageBlock {
  return block.type === 'image';
}

/** Type guards for StreamChunk narrowing */
export function isStreamChunkDelta(chunk: StreamChunk): chunk is StreamChunkContentBlockDelta {
  return chunk.type === 'content_block_delta';
}
export function isStreamChunkStart(chunk: StreamChunk): chunk is StreamChunkContentBlockStart {
  return chunk.type === 'content_block_start';
}
export function isStreamChunkStop(chunk: StreamChunk): chunk is StreamChunkContentBlockStop {
  return chunk.type === 'content_block_stop';
}
export function isTextDelta(delta: TextDelta | InputJsonDelta): delta is TextDelta {
  return delta.type === 'text_delta';
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
  /** Safe for no-prompt auto mode after enforcing its own workspace or network boundary. */
  autoApproveInWorkspace?: boolean;
  isEnabled: () => boolean;
  execute: (input: T, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  cwd: string;
  abortSignal: AbortSignal;
  workspaceRoots?: string[];
}

export type EngineEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_use'; tool: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; output: string }
  | { type: 'compressed'; tokensBefore: number; tokensAfter: number }
  | { type: 'end_turn' }
  | { type: 'error'; error: string }
  | { type: 'permission_ask'; tool: string; input: Record<string, unknown>; toolUseId: string };

export interface StreamChunkContentBlockStart {
  type: 'content_block_start';
  content_block: TextBlock | ToolUseBlock;
  index?: number;
}

export interface StreamChunkContentBlockDelta {
  type: 'content_block_delta';
  index?: number;
  delta: TextDelta | InputJsonDelta;
}

export interface TextDelta {
  type: 'text_delta';
  text: string;
}

export interface InputJsonDelta {
  type: 'input_json_delta';
  partial_json: string;
}

export interface StreamChunkContentBlockStop {
  type: 'content_block_stop';
  index?: number;
}

export interface StreamChunkMessageStop {
  type: 'message_stop';
}

export type StreamChunk =
  | StreamChunkContentBlockStart
  | StreamChunkContentBlockDelta
  | StreamChunkContentBlockStop
  | StreamChunkMessageStop;

export interface StreamParams {
  system: string[];
  messages: Message[];
  tools: Record<string, unknown>[];
  signal?: AbortSignal;
}

export interface Provider {
  name: string;
  stream(params: StreamParams): AsyncIterable<StreamChunk>;
  countTokens?(params: StreamParams): Promise<number>;
}

export type PermissionMode = 'ask' | 'auto' | 'full-access';
export type PermissionModeInput = PermissionMode | 'workspace-auto' | 'yolo';

export interface HookResult {
  blocked: boolean;
  reason?: string;
}

export interface CompressionResult {
  compressed: boolean;
  stats?: CompressionStats;
}

export interface CompressionQuality {
  score: number;
  protectedFactRetention: number;
  recentMessageRetention: number;
  toolCallIntegrity: number;
}

export interface CompressionStats {
  tokensBefore: number;
  tokensAfter: number;
  tokenMethod: 'provider' | 'exact' | 'estimated';
  reductionRatio: number;
  quality: CompressionQuality;
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
