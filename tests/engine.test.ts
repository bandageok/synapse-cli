// tests/engine.test.ts
import { describe, it, expect } from 'vitest';
import { createEngine } from '../src/core/Engine.js';
import { ToolRegistry } from '../src/core/ToolRegistry.js';
import type { Provider, Message, StreamChunk, ToolDef } from '../src/core/types.js';

// Mock provider that returns a simple text response
function mockTextProvider(text: string): Provider {
  return {
    name: 'mock',
    async *stream() {
      yield { type: 'content_block_start', content_block: { type: 'text', text: '' } } as StreamChunk;
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text } } as StreamChunk;
      yield { type: 'content_block_stop' } as StreamChunk;
      yield { type: 'message_stop' } as StreamChunk;
    },
  };
}

// Mock provider that calls a tool then responds with text
function mockToolProvider(toolName: string, toolInput: Record<string, unknown>, finalText: string): Provider {
  let callCount = 0;
  return {
    name: 'mock',
    async *stream() {
      callCount++;
      if (callCount <= 1) {
        // First call: tool use
        yield { type: 'content_block_start', content_block: { type: 'tool_use', id: 'tool-1', name: toolName, input: {} } } as StreamChunk;
        yield { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: JSON.stringify(toolInput) } } as StreamChunk;
        yield { type: 'content_block_stop' } as StreamChunk;
      } else {
        // Second call: text response
        yield { type: 'content_block_start', content_block: { type: 'text', text: '' } } as StreamChunk;
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: finalText } } as StreamChunk;
        yield { type: 'content_block_stop' } as StreamChunk;
      }
      yield { type: 'message_stop' } as StreamChunk;
    },
  };
}

const noopHooks = {
  preToolUse: async () => ({ blocked: false }),
  postToolUse: async () => {},
};

const noopCompressor = {
  checkAndCompress: async () => ({ compressed: false }),
};

const noopErrorRecovery = {
  executeWithRetry: async <T>(fn: () => Promise<T>) => fn(),
  handleApiError: async () => false,
};

const noopContext = {
  build: async () => ['You are helpful'],
};

function explicitRegistry(): ToolRegistry {
  return new ToolRegistry({
    permissions: { allowedTools: [], deniedTools: [], askForTools: [] },
  });
}

describe('Engine', () => {
  it('yields tokens and ends turn for text-only response', async () => {
    const messages: Message[] = [{ role: 'user', content: 'hello' }];
    const provider = mockTextProvider('Hi there!');
    const tools = explicitRegistry();

    const events: any[] = [];
    for await (const event of createEngine(messages, provider, tools, noopContext, noopHooks, noopCompressor, noopErrorRecovery)) {
      events.push(event);
    }

    const tokens = events.filter(e => e.type === 'token');
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.map(t => t.text).join('')).toBe('Hi there!');
    expect(events[events.length - 1].type).toBe('end_turn');
  });

  it('executes tool and continues loop', async () => {
    const messages: Message[] = [{ role: 'user', content: 'echo hello' }];
    const provider = mockToolProvider('Echo', { text: 'hello' }, 'Done!');

    const echoTool: ToolDef = {
      name: 'Echo',
      description: 'Echo',
      schema: {},
      permissions: 'read',
      isEnabled: () => true,
      execute: async (input: any) => ({ output: `Echoed: ${input.text}`, isError: false }),
    };

    const tools = explicitRegistry();
    tools.register(echoTool);

    const events: any[] = [];
    for await (const event of createEngine(messages, provider, tools, noopContext, noopHooks, noopCompressor, noopErrorRecovery)) {
      events.push(event);
    }

    const toolUse = events.find(e => e.type === 'tool_use');
    expect(toolUse).toBeDefined();
    expect(toolUse.tool).toBe('Echo');
    expect(toolUse.toolUseId).toBe('tool-1');

    const toolResult = events.find(e => e.type === 'tool_result');
    expect(toolResult).toBeDefined();
    expect(toolResult.output).toContain('Echoed: hello');
    expect(toolResult).toMatchObject({ toolUseId: 'tool-1', isError: false });
    expect(toolResult.durationMs).toBeGreaterThanOrEqual(0);

    const endTurn = events.find(e => e.type === 'end_turn');
    expect(endTurn).toBeDefined();
  });

  it('handles blocked hook', async () => {
    const messages: Message[] = [{ role: 'user', content: 'run dangerous command' }];
    const provider = mockToolProvider('Bash', { command: 'rm -rf /' }, 'Done!');

    const bashTool: ToolDef = {
      name: 'Bash',
      description: 'Shell',
      schema: {},
      permissions: 'execute',
      isEnabled: () => true,
      execute: async () => ({ output: 'executed', isError: false }),
    };

    const tools = explicitRegistry();
    tools.register(bashTool);

    const blockingHooks = {
      preToolUse: async () => ({ blocked: true, reason: 'Dangerous command blocked' }),
      postToolUse: async () => {},
    };

    const events: any[] = [];
    for await (const event of createEngine(messages, provider, tools, noopContext, blockingHooks, noopCompressor, noopErrorRecovery)) {
      events.push(event);
    }

    // The blocked attempt is visible, but the tool itself never executes.
    const toolResults = events.filter(e => e.type === 'tool_result');
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0]).toMatchObject({ toolUseId: 'tool-1', tool: 'Bash', isError: true, durationMs: 0 });
    expect(toolResults[0].output).toContain('Dangerous command blocked');
  });

  it('handles denied permission', async () => {
    const messages: Message[] = [{ role: 'user', content: 'do something' }];
    const provider = mockToolProvider('Secret', {}, 'Done!');

    const tools = explicitRegistry();
    // Don't register the tool → checkPermission returns 'deny'

    const events: any[] = [];
    for await (const event of createEngine(messages, provider, tools, noopContext, noopHooks, noopCompressor, noopErrorRecovery)) {
      events.push(event);
    }

    const toolResults = events.filter(e => e.type === 'tool_result');
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0]).toMatchObject({ toolUseId: 'tool-1', tool: 'Secret', isError: true, durationMs: 0 });
  });

  it('handles tool execution error gracefully', async () => {
    const messages: Message[] = [{ role: 'user', content: 'fail' }];
    const provider = mockToolProvider('FailTool', {}, 'Recovered');

    const failTool: ToolDef = {
      name: 'FailTool',
      description: 'Always fails',
      schema: {},
      permissions: 'read',
      isEnabled: () => true,
      execute: async () => { throw new Error('Tool exploded'); },
    };

    const tools = explicitRegistry();
    tools.register(failTool);

    const events: any[] = [];
    for await (const event of createEngine(messages, provider, tools, noopContext, noopHooks, noopCompressor, noopErrorRecovery)) {
      events.push(event);
    }

    const toolResult = events.find(e => e.type === 'tool_result');
    expect(toolResult).toBeDefined();
    expect(toolResult.output).toContain('Tool exploded');
    expect(toolResult.isError).toBe(true);
  });

  it('audits tool permission and execution lifecycle', async () => {
    const messages: Message[] = [{ role: 'user', content: 'echo hello' }];
    const provider = mockToolProvider('Echo', { text: 'hello' }, 'Done!');
    const auditEvents: { action: string; meta?: Record<string, unknown> }[] = [];

    const echoTool: ToolDef = {
      name: 'Echo',
      description: 'Echo',
      schema: {},
      permissions: 'read',
      isEnabled: () => true,
      execute: async (input: any) => ({ output: `Echoed: ${input.text}`, isError: false }),
    };

    const tools = explicitRegistry();
    tools.register(echoTool);

    for await (const _event of createEngine(
      messages,
      provider,
      tools,
      noopContext,
      noopHooks,
      noopCompressor,
      noopErrorRecovery,
      {
        logger: {
          info: () => {},
          warn: () => {},
          error: () => {},
          audit: (action, meta) => auditEvents.push({ action, meta }),
        },
      },
    )) {}

    expect(auditEvents.map(e => e.action)).toContain('tool.permission_decision');
    expect(auditEvents.map(e => e.action)).toContain('tool.execution_started');
    expect(auditEvents.map(e => e.action)).toContain('tool.execution_finished');
    expect(auditEvents.find(e => e.action === 'tool.permission_decision')?.meta?.decision).toBe('allow');
  });

  it('returns schema errors to the model for self-correction without executing the tool', async () => {
    let executions = 0;
    const messages: Message[] = [{ role: 'user', content: 'echo' }];
    const provider = mockToolProvider('Echo', { text: 42 }, 'Corrected');
    const tools = explicitRegistry();
    tools.register({
      name: 'Echo',
      description: 'Echo',
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      permissions: 'read',
      isEnabled: () => true,
      execute: async () => { executions++; return { output: 'unexpected', isError: false }; },
    });
    const events: any[] = [];
    for await (const event of createEngine(messages, provider, tools, noopContext, noopHooks, noopCompressor, noopErrorRecovery)) {
      events.push(event);
    }
    expect(executions).toBe(0);
    expect(JSON.stringify(messages)).toContain('Invalid tool input for Echo');
    expect(events.find(event => event.type === 'tool_result')).toMatchObject({
      toolUseId: 'tool-1', tool: 'Echo', isError: true, durationMs: 0,
    });
    expect(events.filter(event => event.type === 'token').map(event => event.text).join('')).toBe('Corrected');
  });

  it('stops an unbounded tool loop at the configured safety limit', async () => {
    const provider: Provider = {
      name: 'loop',
      async *stream() {
        yield { type: 'content_block_start', content_block: { type: 'tool_use', id: `tool-${Date.now()}`, name: 'Echo', input: {} } } as StreamChunk;
        yield { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } } as StreamChunk;
        yield { type: 'content_block_stop' } as StreamChunk;
      },
    };
    const tools = explicitRegistry();
    tools.register({
      name: 'Echo', description: 'Echo', schema: { type: 'object', properties: {} }, permissions: 'read',
      isEnabled: () => true, execute: async () => ({ output: 'ok', isError: false }),
    });
    const events: any[] = [];
    for await (const event of createEngine(
      [{ role: 'user', content: 'loop' }], provider, tools, noopContext, noopHooks, noopCompressor, noopErrorRecovery,
      { maxTurns: 2 },
    )) events.push(event);
    expect(events.at(-1)).toEqual({ type: 'error', error: 'Agent stopped after reaching the 2-turn safety limit.' });
  });

  it('keeps the same agent turn alive while a rate-limited provider recovers', async () => {
    let calls = 0;
    const provider: Provider = {
      name: 'limited',
      async *stream() {
        calls++;
        if (calls < 3) {
          throw Object.assign(new Error('exceeded retry limit, last status: 429 Too Many Requests'), {
            status: 429,
            retryAfterMs: 0,
          });
        }
        yield { type: 'content_block_start', content_block: { type: 'text', text: '' } } as StreamChunk;
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Recovered' } } as StreamChunk;
        yield { type: 'content_block_stop' } as StreamChunk;
        yield { type: 'message_stop' } as StreamChunk;
      },
    };
    const recovery = {
      executeWithRetry: async <T>(fn: () => Promise<T>) => fn(),
      handleApiError: async () => false,
      resetFailures: () => {},
    };
    const events: any[] = [];
    for await (const event of createEngine(
      [{ role: 'user', content: 'finish the task' }],
      provider,
      explicitRegistry(),
      noopContext,
      noopHooks,
      noopCompressor,
      recovery,
      { maxTurns: 1, rateLimitRetries: 2 },
    )) events.push(event);

    expect(calls).toBe(3);
    expect(events.filter(event => event.type === 'retrying')).toEqual([
      { type: 'retrying', reason: 'rate_limit', attempt: 1, maxAttempts: 2, delayMs: 0 },
      { type: 'retrying', reason: 'rate_limit', attempt: 2, maxAttempts: 2, delayMs: 0 },
    ]);
    expect(events.filter(event => event.type === 'token').map(event => event.text).join('')).toBe('Recovered');
    expect(events.at(-1)).toEqual({ type: 'end_turn' });
  });

  it('supports cancellable unlimited rate-limit recovery for interactive sessions', async () => {
    let calls = 0;
    const provider: Provider = {
      name: 'limited',
      async *stream() {
        calls++;
        if (calls < 4) {
          throw Object.assign(new Error('429 Too Many Requests'), { status: 429, retryAfterMs: 0 });
        }
        yield { type: 'content_block_start', content_block: { type: 'text', text: '' } } as StreamChunk;
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Done' } } as StreamChunk;
        yield { type: 'content_block_stop' } as StreamChunk;
      },
    };
    const events: any[] = [];
    for await (const event of createEngine(
      [{ role: 'user', content: 'continue' }], provider, explicitRegistry(), noopContext, noopHooks,
      noopCompressor, noopErrorRecovery, { maxTurns: 1, rateLimitRetries: -1 },
    )) events.push(event);

    expect(calls).toBe(4);
    expect(events.filter(event => event.type === 'retrying')).toHaveLength(3);
    expect(events.find(event => event.type === 'retrying')?.maxAttempts).toBeNull();
    expect(events.at(-1)).toEqual({ type: 'end_turn' });
  });

  it('does not bypass the finite retry budget through generic API recovery', async () => {
    let calls = 0;
    let genericRecoveryCalls = 0;
    const provider: Provider = {
      name: 'limited',
      async *stream() {
        calls++;
        throw Object.assign(new Error('429 Too Many Requests'), { status: 429, retryAfterMs: 0 });
      },
    };
    const events: any[] = [];
    for await (const event of createEngine(
      [{ role: 'user', content: 'run in CI' }], provider, explicitRegistry(), noopContext, noopHooks,
      noopCompressor,
      {
        executeWithRetry: async <T>(fn: () => Promise<T>) => fn(),
        handleApiError: async () => { genericRecoveryCalls++; return true; },
      },
      { maxTurns: 1, rateLimitRetries: 2 },
    )) events.push(event);

    expect(calls).toBe(3);
    expect(genericRecoveryCalls).toBe(0);
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: expect.stringContaining('after 2 retries'),
    });
  });
});
