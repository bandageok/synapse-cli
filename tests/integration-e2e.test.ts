import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createEngine } from '../src/core/Engine.js';
import { ToolRegistry } from '../src/core/ToolRegistry.js';
import { ContextBuilder } from '../src/core/Context.js';
import { Compressor } from '../src/core/Compressor.js';
import { HookSystem } from '../src/core/HookSystem.js';
import { ErrorRecovery } from '../src/core/ErrorRecovery.js';
import { DynamicReminder } from '../src/soul/DynamicReminder.js';
import { BashTool } from '../src/tools/BashTool.js';
import { FileReadTool } from '../src/tools/FileReadTool.js';
import { FileWriteTool } from '../src/tools/FileWriteTool.js';
import { GlobTool } from '../src/tools/GlobTool.js';
import { TodoWriteTool } from '../src/tools/TodoWriteTool.js';
import { OpenRouterProvider } from '../src/providers/openrouter.js';
import type { Message, EngineEvent } from '../src/core/types.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';

const API_KEY = process.env.OPENROUTER_API_KEY ?? '';

describe('E2E: Full Engine + MiMo V2 Pro', () => {
  let provider: OpenRouterProvider;
  let tools: ToolRegistry;
  let context: ContextBuilder;
  let compressor: Compressor;
  let hooks: HookSystem;
  let errorRecovery: ErrorRecovery;
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cclaw-e2e-'));
    context = new ContextBuilder({ dataDir: tempDir, cwd: tempDir });
    if (!API_KEY) return;
    provider = new OpenRouterProvider({ apiKey: API_KEY, model: 'xiaomi/mimo-v2-pro' });
    tools = new ToolRegistry();
    tools.register(BashTool);
    tools.register(FileReadTool);
    tools.register(FileWriteTool);
    tools.register(GlobTool);
    tools.register(TodoWriteTool);
    compressor = new Compressor({ contextWindow: 100_000, model: 'xiaomi/mimo-v2-pro' });
    hooks = new HookSystem();
    errorRecovery = new ErrorRecovery();
  });

  afterAll(() => {
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it('simple text conversation', async () => {
    if (!API_KEY) return;
    const messages: Message[] = [{ role: 'user', content: 'Say "hello world" and nothing else.' }];
    const events: EngineEvent[] = [];
    for await (const event of createEngine(messages, provider, tools, context, hooks, compressor, errorRecovery)) {
      events.push(event);
    }
    const tokens = events.filter(e => e.type === 'token');
    expect(tokens.length).toBeGreaterThan(0);
    const fullText = tokens.map(t => t.text).join('');
    expect(fullText.toLowerCase()).toContain('hello');
    expect(events[events.length - 1].type).toBe('end_turn');
  }, 60_000);

  it('tool use: Bash echo', async () => {
    if (!API_KEY) return;
    const messages: Message[] = [{ role: 'user', content: 'Use the Bash tool to run: echo "test123". Report the output.' }];
    const events: EngineEvent[] = [];
    for await (const event of createEngine(messages, provider, tools, context, hooks, compressor, errorRecovery)) {
      events.push(event);
    }
    const toolUse = events.find(e => e.type === 'tool_use');
    expect(toolUse).toBeDefined();
    expect(toolUse!.tool).toBe('Bash');
    const toolResult = events.find(e => e.type === 'tool_result');
    expect(toolResult).toBeDefined();
    expect(toolResult!.output).toContain('test123');
  }, 60_000);

  it('tool use: FileWrite + FileRead', async () => {
    if (!API_KEY) return;
    const testFile = join(tempDir, 'e2e-test.txt');
    const messages: Message[] = [{ role: 'user', content: `Use FileWrite to create a file at ${testFile} with content "e2e test content". Then use FileRead to read it back.` }];
    const events: EngineEvent[] = [];
    for await (const event of createEngine(messages, provider, tools, context, hooks, compressor, errorRecovery)) {
      events.push(event);
    }
    expect(events.some(e => e.type === 'tool_use')).toBe(true);
    expect(existsSync(testFile)).toBe(true);
  }, 60_000);

  it('hook blocks tool execution', async () => {
    if (!API_KEY) return;
    const blockingHooks = new HookSystem({
      hooks: [{ event: 'preToolUse', tool: 'Bash', handler: async () => ({ blocked: true, reason: 'Blocked by test' }) }],
    });
    const messages: Message[] = [{ role: 'user', content: 'Run: echo "blocked" using Bash tool' }];
    const events: EngineEvent[] = [];
    for await (const event of createEngine(messages, provider, tools, context, blockingHooks, compressor, errorRecovery)) {
      events.push(event);
    }
    const toolResults = events.filter(e => e.type === 'tool_result');
    expect(toolResults).toHaveLength(0);
  }, 60_000);

  it('multi-turn: tool use then text response', async () => {
    if (!API_KEY) return;
    const messages: Message[] = [{ role: 'user', content: 'Use Bash to run "echo hello", then tell me what the output was.' }];
    const events: EngineEvent[] = [];
    for await (const event of createEngine(messages, provider, tools, context, hooks, compressor, errorRecovery)) {
      events.push(event);
    }
    expect(events.some(e => e.type === 'tool_use')).toBe(true);
    expect(events.some(e => e.type === 'tool_result')).toBe(true);
    expect(events.some(e => e.type === 'token')).toBe(true);
  }, 60_000);

  it('context builder produces 7 layers (v7: skills layer added)', async () => {
    const layers = await context.build(1);
    expect(layers).toHaveLength(7);
    expect(layers[0]).toContain('Synapse');
    expect(layers[3]).toContain('Memory System');
  });

  it('dynamic reminder fires on bash error', () => {
    const dr = new DynamicReminder();
    const reminder = dr.getReminder(1, { id: '1', name: 'Bash', input: {} }, { output: 'fail', isError: true });
    expect(reminder).toContain('root cause');
  });
});
