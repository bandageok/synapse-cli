// src/providers/base.ts
import type { StreamChunk, StreamParams } from '../core/types.js';

export interface ProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

/** Provider 实例接口 — 核心流式接口 */
export interface Provider {
  name: string;
  stream(params: StreamParams): AsyncIterable<StreamChunk>;
}
