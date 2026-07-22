// src/providers/base.ts
import type { StreamChunk, StreamParams } from '../core/types.js';

export interface ProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  name?: string;
  auth?: 'bearer' | 'x-api-key';
  timeoutMs?: number;
}

/** Provider 实例接口 — 核心流式接口 */
export interface Provider {
  name: string;
  stream(params: StreamParams): AsyncIterable<StreamChunk>;
  countTokens?(params: StreamParams): Promise<number>;
  getModel?(): string;
  setModel?(model: string): void;
}
