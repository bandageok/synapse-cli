// src/providers/openrouter.ts
import type { ContentBlock, Message, StreamChunk, StreamParams, ToolUseBlock } from '../core/types.js';
import type { Provider, ProviderConfig } from './base.js';
import { parseRetryAfter } from '../core/retry.js';

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

type OpenAIMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

export class OpenRouterProvider implements Provider {
  name: string;
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private auth: 'bearer' | 'x-api-key';
  private timeoutMs: number;

  constructor(config: ProviderConfig) {
    this.name = config.name ?? 'openai-compatible';
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'xiaomi/mimo-v2-pro';
    this.baseUrl = config.baseUrl ?? 'https://openrouter.ai/api/v1';
    this.auth = config.auth ?? 'bearer';
    this.timeoutMs = config.timeoutMs ?? 120_000;
  }

  async *stream(params: StreamParams): AsyncIterable<StreamChunk> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.auth === 'x-api-key') headers['x-api-key'] = this.apiKey;
    else headers.Authorization = `Bearer ${this.apiKey}`;
    if (this.name === 'openrouter') headers['HTTP-Referer'] = 'https://github.com/bandageok/synapse-cli';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort(params.signal?.reason);
    if (params.signal?.aborted) onAbort();
    else params.signal?.addEventListener('abort', onAbort, { once: true });
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: params.system.join('\n') },
            ...this.toOpenAIMessages(params.messages),
          ],
          tools: params.tools.length > 0 ? params.tools.map(tool => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema,
            },
          })) : undefined,
          max_tokens: 4096,
          stream: true,
        }),
      });
    } catch (error) {
      clearTimeout(timeout);
      params.signal?.removeEventListener('abort', onAbort);
      if (error instanceof Error && error.name === 'AbortError') {
        if (params.signal?.aborted) throw Object.assign(new Error('Request cancelled.'), { name: 'AbortError' });
        throw new Error(`${this.name} request timed out after ${this.timeoutMs}ms.`);
      }
      throw error;
    }

    try {
      if (!response.ok) {
        const body = (await response.text()).replace(/\s+/g, ' ').slice(0, 2_000);
        const error = new Error(`${this.name} API error: ${response.status}${body ? ` - ${body}` : ''}`) as Error & {
          status?: number;
          retryAfterMs?: number;
        };
        error.status = response.status;
        error.retryAfterMs = parseRetryAfter(response.headers);
        throw error;
      }
      if (!response.body) throw new Error(`${this.name} API returned an empty response body.`);

      yield* this.decodeStream(response.body);
    } finally {
      clearTimeout(timeout);
      params.signal?.removeEventListener('abort', onAbort);
    }
  }

  private toOpenAIMessages(messages: Message[]): OpenAIMessage[] {
    const result: OpenAIMessage[] = [];
    for (const message of messages) {
      if (typeof message.content === 'string') {
        const role = message.role === 'assistant' ? 'assistant' : message.role;
        result.push({ role, content: message.content } as OpenAIMessage);
        continue;
      }

      if (message.role === 'assistant') {
        const text = message.content
          .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
          .map(block => block.text)
          .join('');
        const toolCalls = message.content
          .filter((block): block is ToolUseBlock => block.type === 'tool_use')
          .map(block => ({
            id: block.id,
            type: 'function' as const,
            function: { name: block.name, arguments: JSON.stringify(block.input) },
          }));
        result.push({
          role: 'assistant',
          content: text || (toolCalls.length > 0 ? null : ''),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        });
        continue;
      }

      const text = message.content
        .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
        .map(block => block.text)
        .join('\n');
      if (text) result.push({ role: 'user', content: text });
      for (const block of message.content) {
        if (block.type === 'tool_result') {
          result.push({ role: 'tool', tool_call_id: block.tool_use_id, content: block.content });
        }
      }
    }
    return result;
  }

  private async *decodeStream(body: ReadableStream<Uint8Array>): AsyncIterable<StreamChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const toolCalls = new Map<number, PendingToolCall>();
    let buffer = '';
    let textStarted = false;
    let stopped = false;

    const flush = function* (): Generator<StreamChunk> {
      if (textStarted) yield { type: 'content_block_stop' };
      for (const [, call] of [...toolCalls.entries()].sort(([a], [b]) => a - b)) {
        if (!call.id || !call.name) throw new Error('Provider returned an incomplete tool call without id or name.');
        yield {
          type: 'content_block_start',
          content_block: { type: 'tool_use', id: call.id, name: call.name, input: {} },
        };
        yield {
          type: 'content_block_delta',
          delta: { type: 'input_json_delta', partial_json: call.arguments || '{}' },
        };
        yield { type: 'content_block_stop' };
      }
      yield { type: 'message_stop' };
    };

    while (!stopped) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = done ? '' : lines.pop() ?? '';

      for (const line of lines) {
        const match = line.match(/^data:\s?(.*)$/);
        if (!match) continue;
        const data = match[1].trim();
        if (!data) continue;
        if (data === '[DONE]') {
          yield* flush();
          stopped = true;
          break;
        }

        let parsed: any;
        try {
          parsed = JSON.parse(data);
        } catch {
          throw new Error(`${this.name} returned malformed SSE JSON.`);
        }
        if (parsed.error) {
          const message = parsed.error.message ?? JSON.stringify(parsed.error);
          throw new Error(`${this.name} stream error: ${message}`);
        }
        const choice = parsed.choices?.[0];
        const delta = choice?.delta;
        if (!delta) continue;

        if (typeof delta.content === 'string' && delta.content.length > 0) {
          if (!textStarted) {
            textStarted = true;
            yield { type: 'content_block_start', content_block: { type: 'text', text: '' } };
          }
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: delta.content } };
        }

        for (const toolCall of delta.tool_calls ?? []) {
          const index = Number.isInteger(toolCall.index) ? toolCall.index : 0;
          const current = toolCalls.get(index) ?? { id: '', name: '', arguments: '' };
          if (toolCall.id) current.id = toolCall.id;
          if (toolCall.function?.name) current.name = toolCall.function.name;
          if (toolCall.function?.arguments) current.arguments += toolCall.function.arguments;
          toolCalls.set(index, current);
        }

        if (choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls') {
          yield* flush();
          stopped = true;
          break;
        }
      }
      if (done) break;
    }

    if (!stopped) yield* flush();
  }
}
