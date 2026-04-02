// src/providers/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';
import type { StreamChunk, StreamParams } from '../core/types.js';
import type { Provider, ProviderConfig } from './base.js';

export class AnthropicProvider implements Provider {
  name = 'anthropic';
  private client: Anthropic;
  private model: string;

  constructor(config: ProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? 'claude-sonnet-4-20250514';
  }

  async *stream(params: StreamParams): AsyncIterable<StreamChunk> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 8192,
      system: params.system.join('\n'),
      messages: params.messages as any,
      tools: params.tools as any,
    });

    for await (const event of stream) {
      yield event as unknown as StreamChunk;
    }
  }
}
