// src/providers/openrouter.ts
import type { StreamChunk, StreamParams, Provider } from '../core/types.js';
import type { ProviderConfig } from './base.js';

export class OpenRouterProvider implements Provider {
  name = 'openrouter';
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'anthropic/claude-sonnet-4';
    this.baseUrl = config.baseUrl ?? 'https://openrouter.ai/api/v1';
  }

  async *stream(params: StreamParams): AsyncIterable<StreamChunk> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/cclaw/cclaw',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: params.system.join('\n') },
          ...params.messages,
        ],
        tools: params.tools,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          yield { type: 'openrouter_chunk', ...parsed } as StreamChunk;
        } catch {
          // skip malformed JSON
        }
      }
    }
  }
}
