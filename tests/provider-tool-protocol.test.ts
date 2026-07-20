import { afterEach, describe, expect, it } from 'vitest';
import { OpenRouterProvider } from '../src/providers/openrouter.js';
import type { Message, StreamChunk } from '../src/core/types.js';
import { FallbackProvider } from '../src/providers/fallback.js';
import type { Provider } from '../src/providers/base.js';

function sseResponse(events: unknown[]): Response {
  const body = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('OpenAI-compatible tool protocol', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('preserves assistant tool calls and tool result identifiers', async () => {
    let requestBody: any;
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return sseResponse([{ choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] }]);
    };
    const provider = new OpenRouterProvider({ apiKey: 'key', baseUrl: 'http://local/v1', model: 'model' });
    const messages: Message[] = [
      { role: 'user', content: 'read it' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'call_123', name: 'FileRead', input: { file_path: 'x' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_123', content: 'result' }] },
    ];
    for await (const _ of provider.stream({ system: ['system'], messages, tools: [] })) {}

    expect(requestBody.messages[2]).toMatchObject({
      role: 'assistant',
      tool_calls: [{ id: 'call_123', function: { name: 'FileRead', arguments: '{"file_path":"x"}' } }],
    });
    expect(requestBody.messages[3]).toEqual({ role: 'tool', tool_call_id: 'call_123', content: 'result' });
  });

  it('assembles multiple streamed tool calls without mixing arguments', async () => {
    globalThis.fetch = async () => sseResponse([
      { choices: [{ delta: { tool_calls: [
        { index: 0, id: 'call_a', function: { name: 'A', arguments: '{"x":' } },
        { index: 1, id: 'call_b', function: { name: 'B', arguments: '{"y":' } },
      ] } }] },
      { choices: [{ delta: { tool_calls: [
        { index: 0, function: { arguments: '1}' } },
        { index: 1, function: { arguments: '2}' } },
      ] }, finish_reason: 'tool_calls' }] },
    ]);
    const provider = new OpenRouterProvider({ apiKey: 'key', baseUrl: 'http://local/v1', model: 'model' });
    const chunks: StreamChunk[] = [];
    for await (const chunk of provider.stream({ system: [], messages: [], tools: [] })) chunks.push(chunk);

    const starts = chunks.filter(chunk => chunk.type === 'content_block_start');
    const deltas = chunks.filter(chunk => chunk.type === 'content_block_delta');
    expect(starts.map((chunk: any) => chunk.content_block.name)).toEqual(['A', 'B']);
    expect(deltas.map((chunk: any) => chunk.delta.partial_json)).toEqual(['{"x":1}', '{"y":2}']);
  });

  it('aborts provider requests after the configured timeout', async () => {
    globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
    const provider = new OpenRouterProvider({ apiKey: 'key', baseUrl: 'http://local/v1', model: 'model', timeoutMs: 20 });
    await expect(async () => {
      for await (const _ of provider.stream({ system: [], messages: [], tools: [] })) {}
    }).rejects.toThrow('timed out after 20ms');
  });

  it('surfaces explicit provider stream errors', async () => {
    globalThis.fetch = async () => sseResponse([{ error: { message: 'upstream failed' } }]);
    const provider = new OpenRouterProvider({ apiKey: 'key', baseUrl: 'http://local/v1', model: 'model' });
    await expect(async () => {
      for await (const _ of provider.stream({ system: [], messages: [], tools: [] })) {}
    }).rejects.toThrow('upstream failed');
  });
});

describe('provider fallback strategy', () => {
  it('falls back only when the primary fails before streaming output', async () => {
    const primary: Provider = { name: 'primary', async *stream() { throw new Error('rate limited'); } };
    const secondary: Provider = {
      name: 'secondary',
      async *stream() { yield { type: 'message_stop' } as StreamChunk; },
    };
    const provider = new FallbackProvider([primary, secondary]);
    const chunks: StreamChunk[] = [];
    for await (const chunk of provider.stream({ system: [], messages: [], tools: [] })) chunks.push(chunk);
    expect(chunks).toEqual([{ type: 'message_stop' }]);
  });

  it('does not switch providers after partial output', async () => {
    let secondaryCalled = false;
    const primary: Provider = {
      name: 'primary',
      async *stream() {
        yield { type: 'content_block_start', content_block: { type: 'text', text: '' } } as StreamChunk;
        throw new Error('stream disconnected');
      },
    };
    const secondary: Provider = {
      name: 'secondary',
      async *stream() { secondaryCalled = true; yield { type: 'message_stop' } as StreamChunk; },
    };
    const provider = new FallbackProvider([primary, secondary]);
    await expect(async () => {
      for await (const _ of provider.stream({ system: [], messages: [], tools: [] })) {}
    }).rejects.toThrow('stream disconnected');
    expect(secondaryCalled).toBe(false);
  });

  it('does not retry authentication or malformed-request failures', async () => {
    let secondaryCalled = false;
    const primary: Provider = { name: 'primary', async *stream() { throw new Error('API error: 401 unauthorized'); } };
    const secondary: Provider = {
      name: 'secondary',
      async *stream() { secondaryCalled = true; yield { type: 'message_stop' } as StreamChunk; },
    };
    const provider = new FallbackProvider([primary, secondary]);
    await expect(async () => {
      for await (const _ of provider.stream({ system: [], messages: [], tools: [] })) {}
    }).rejects.toThrow('401 unauthorized');
    expect(secondaryCalled).toBe(false);
  });
});
