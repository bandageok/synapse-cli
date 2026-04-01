// src/providers/base.ts
import type { StreamChunk, StreamParams } from '../core/types.js';

export interface ProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}
