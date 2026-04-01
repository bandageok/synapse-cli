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
    this.model = config.model ?? 'xiaomi/mimo-v2-pro';
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
          ...params.messages.map(m => ({
            role: m.role,
            content: typeof m.content === 'string'
              ? m.content
              : m.content.map(b => {
                  if (b.type === 'text') return b.text;
                  if (b.type === 'tool_result') return `[Tool Result] ${b.content}`;
                  return `[${b.type}]`;
                }).join('\n'),
          })),
        ],
        tools: params.tools.length > 0 ? params.tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
          },
        })) : undefined,
        max_tokens: 4096,
        stream: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${body}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Track state for OpenAI → Anthropic format conversion
    let currentBlockIndex = -1;
    let blockType: 'text' | 'tool_use' | null = null;
    let toolCallIndex = -1;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') {
          // Emit stop for current block
          if (blockType) {
            yield { type: 'content_block_stop' } as StreamChunk;
          }
          yield { type: 'message_stop' } as StreamChunk;
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          // Handle tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.index !== undefined && tc.index !== toolCallIndex) {
                // New tool call block
                if (blockType) {
                  yield { type: 'content_block_stop' } as StreamChunk;
                }
                toolCallIndex = tc.index;
                blockType = 'tool_use';
                currentBlockIndex++;
                yield {
                  type: 'content_block_start',
                  content_block: {
                    type: 'tool_use',
                    id: tc.id ?? `toolu_${Date.now()}`,
                    name: tc.function?.name ?? '',
                    input: {},
                  },
                } as StreamChunk;
              }
              if (tc.function?.arguments) {
                yield {
                  type: 'content_block_delta',
                  delta: {
                    type: 'input_json_delta',
                    partial_json: tc.function.arguments,
                  },
                } as StreamChunk;
              }
            }
          }

          // Handle text content
          if (delta.content) {
            if (blockType !== 'text') {
              if (blockType) {
                yield { type: 'content_block_stop' } as StreamChunk;
              }
              blockType = 'text';
              currentBlockIndex++;
              yield {
                type: 'content_block_start',
                content_block: { type: 'text', text: '' },
              } as StreamChunk;
            }
            yield {
              type: 'content_block_delta',
              delta: { type: 'text_delta', text: delta.content },
            } as StreamChunk;
          }

          // Handle finish
          const finishReason = parsed.choices?.[0]?.finish_reason;
          if (finishReason === 'stop' || finishReason === 'tool_calls') {
            if (blockType) {
              yield { type: 'content_block_stop' } as StreamChunk;
              blockType = null;
            }
            yield { type: 'message_stop' } as StreamChunk;
            return;
          }
        } catch {
          // skip malformed JSON
        }
      }
    }

    // Stream ended without [DONE]
    if (blockType) {
      yield { type: 'content_block_stop' } as StreamChunk;
    }
    yield { type: 'message_stop' } as StreamChunk;
  }
}
