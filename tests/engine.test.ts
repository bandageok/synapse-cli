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

describe('Engine', () => {
  it('yields tokens and ends turn for text-only response', async () => {
    const messages: Message[] = [{ role: 'user', content: 'hello' }];
    const provider = mockTextProvider('Hi there!');
    const tools = new ToolRegistry();

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

    const tools = new ToolRegistry();
    tools.register(echoTool);

    const events: any[] = [];
    for await (const event of createEngine(messages, provider, tools, noopContext, noopHooks, noopCompressor, noopErrorRecovery)) {
      events.push(event);
    }

    const toolUse = events.find(e => e.type === 'tool_use');
    expect(toolUse).toBeDefined();
    expect(toolUse.tool).toBe('Echo');

    const toolResult = events.find(e => e.type === 'tool_result');
    expect(toolResult).toBeDefined();
    expect(toolResult.output).toContain('Echoed: hello');

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

    const tools = new ToolRegistry();
    tools.register(bashTool);

    const blockingHooks = {
      preToolUse: async () => ({ blocked: true, reason: 'Dangerous command blocked' }),
      postToolUse: async () => {},
    };

    const events: any[] = [];
    for await (const event of createEngine(messages, provider, tools, noopContext, blockingHooks, noopCompressor, noopErrorRecovery)) {
      events.push(event);
    }

    // Tool should be blocked, no tool_result from execution
    const toolResults = events.filter(e => e.type === 'tool_result');
    expect(toolResults).toHaveLength(0);
  });

  it('handles denied permission', async () => {
    const messages: Message[] = [{ role: 'user', content: 'do something' }];
    const provider = mockToolProvider('Secret', {}, 'Done!');

    const tools = new ToolRegistry();
    // Don't register the tool → checkPermission returns 'deny'

    const events: any[] = [];
    for await (const event of createEngine(messages, provider, tools, noopContext, noopHooks, noopCompressor, noopErrorRecovery)) {
      events.push(event);
    }

    const toolResults = events.filter(e => e.type === 'tool_result');
    expect(toolResults).toHaveLength(0);
  });

  it('handles tool execution error gracefully', async () => {
    const messages: Message[] = [{ role: 'user', content: 'fail' }];
    const provider = mockToolProvider('FailTool', {}, 'Recovered');

    const failTool: ToolDef = {
      name: 'FailTool',
      description: 'Always fails',
      schema: {},
      permissions: 'execute',
      isEnabled: () => true,
      execute: async () => { throw new Error('Tool exploded'); },
    };

    const tools = new ToolRegistry();
    tools.register(failTool);

    const events: any[] = [];
    for await (const event of createEngine(messages, provider, tools, noopContext, noopHooks, noopCompressor, noopErrorRecovery)) {
      events.push(event);
    }

    const toolResult = events.find(e => e.type === 'tool_result');
    expect(toolResult).toBeDefined();
    expect(toolResult.output).toContain('Tool exploded');
  });
});
