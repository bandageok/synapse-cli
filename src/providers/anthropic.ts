// src/providers/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';
import type { StreamChunk, StreamParams, Message } from '../core/types.js';
import type { Provider, ProviderConfig } from './base.js';

export class AnthropicProvider implements Provider {
  name: string;
  private client: Anthropic;
  private model: string;

  constructor(config: ProviderConfig) {
    const opts: ConstructorParameters<typeof Anthropic>[0] = { apiKey: config.apiKey, timeout: config.timeoutMs ?? 120_000 };
    if (config.baseUrl) opts.baseURL = config.baseUrl;
    this.client = new Anthropic(opts);
    this.model = config.model ?? 'claude-sonnet-4-20250514';
    this.name = config.name ?? 'anthropic';
    if (config.auth === 'bearer') {
      this.client = new Anthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        timeout: config.timeoutMs ?? 120_000,
        defaultHeaders: { 'Authorization': `Bearer ${config.apiKey}` },
      });
    }
  }

  async *stream(params: StreamParams): AsyncIterable<StreamChunk> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 8192,
      system: params.system.join('\n'),
      messages: this.toAnthropicMessages(params.messages),
      tools: this.toAnthropicTools(params.tools),
    }, params.signal ? { signal: params.signal } : undefined);

    for await (const event of stream) {
      yield event as unknown as StreamChunk;
    }
  }

  async countTokens(params: StreamParams): Promise<number> {
    const result = await this.client.messages.countTokens({
      model: this.model,
      system: params.system.join('\n'),
      messages: this.toAnthropicMessages(params.messages),
      tools: this.toAnthropicTools(params.tools),
    }, params.signal ? { signal: params.signal } : undefined);
    return result.input_tokens;
  }

  private toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
    return messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user' as const,
      content: typeof m.content === 'string' ? m.content : m.content.filter(b => b.type !== 'image').map(block => {
        if (block.type === 'text') return { type: 'text' as const, text: block.text };
        if (block.type === 'tool_use') return { type: 'tool_use' as const, id: block.id, name: block.name, input: block.input };
        if (block.type === 'tool_result') return { type: 'tool_result' as const, tool_use_id: block.tool_use_id, content: [{ type: 'text' as const, text: block.content }], is_error: block.is_error };
        return { type: 'text' as const, text: '' };
      }),
    }));
  }

  private toAnthropicTools(tools: Record<string, unknown>[]): Array<Anthropic.Tool> {
    return tools.map(t => ({
      type: 'function' as const,
      name: t.name as string,
      description: t.description as string,
      input_schema: { type: 'object', ...(t.input_schema as Record<string, unknown>) } as unknown as Anthropic.Tool['input_schema'],
    }));
  }
}
