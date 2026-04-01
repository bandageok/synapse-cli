# C.C.Claw Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build C.C.Claw — an open-source CLI agent framework combining Claude Code's engineering architecture with OpenClaw's personality/memory system.

**Architecture:** AsyncGenerator core loop with 6-layer context injection, 4-level compression, 12 MVP tools, SOUL.md personality system, and plugin architecture. Monorepo with pnpm workspaces.

**Tech Stack:** Node.js 18+ / TypeScript / Commander.js / Ink (React TUI) / Zustand / Vitest / tsup / Biome

---

## File Structure

```
c.c.claw/
├── src/
│   ├── entry/cli.ts
│   ├── entry/init.ts
│   ├── core/Engine.ts
│   ├── core/Context.ts
│   ├── core/Compressor.ts
│   ├── core/ToolRegistry.ts
│   ├── core/HookSystem.ts
│   ├── core/SessionStore.ts
│   ├── core/ErrorRecovery.ts
│   ├── core/types.ts
│   ├── soul/SoulLoader.ts
│   ├── soul/MemoryManager.ts
│   ├── soul/Dream.ts
│   ├── soul/Heartbeat.ts
│   ├── soul/DynamicReminder.ts
│   ├── tools/base.ts
│   ├── tools/BashTool.ts
│   ├── tools/FileReadTool.ts
│   ├── tools/FileEditTool.ts
│   ├── tools/FileWriteTool.ts
│   ├── tools/GlobTool.ts
│   ├── tools/GrepTool.ts
│   ├── tools/WebSearchTool.ts
│   ├── tools/WebFetchTool.ts
│   ├── tools/AgentTool.ts
│   ├── tools/TodoWriteTool.ts
│   ├── tools/AskUserQuestionTool.ts
│   ├── tools/SkillTool.ts
│   ├── providers/base.ts
│   ├── providers/anthropic.ts
│   ├── providers/openrouter.ts
│   ├── providers/factory.ts
│   ├── ui/REPL.tsx
│   ├── plugins/registry.ts
│   ├── plugins/manifest.ts
│   ├── skills/loader.ts
│   ├── skills/resolver.ts
│   ├── utils/permissions.ts
│   ├── utils/config.ts
│   └── utils/sandbox.ts
├── tests/
├── package.json
├── tsconfig.json
├── biome.json
└── README.md
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `src/core/types.ts`
- Create: `src/entry/cli.ts`

- [ ] **Step 1: Initialize project**

```bash
mkdir -p c.c.claw && cd c.c.claw
npm init -y
npm install commander @anthropic-ai/sdk ink react zod
npm install -D typescript tsup vitest biome @types/node @types/react tsx
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "cclaw",
  "version": "0.1.0",
  "type": "module",
  "bin": { "cclaw": "./dist/cli.js" },
  "scripts": {
    "dev": "tsx src/entry/cli.ts",
    "build": "tsup",
    "test": "vitest run",
    "lint": "biome check src/"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "commander": "^13.0.0",
    "ink": "^5.0.0",
    "react": "^19.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  },
  "engines": { "node": ">=18" }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create core types**

```typescript
// src/core/types.ts

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
  _inputJson?: string;
  _parseError?: boolean;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  output: string;
  isError: boolean;
}

export interface ToolDef<T = Record<string, unknown>> {
  name: string;
  description: string;
  schema: Record<string, unknown>; // JSON Schema
  permissions: 'read' | 'write' | 'execute' | 'network';
  isEnabled: () => boolean;
  execute: (input: T, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  cwd: string;
  abortSignal: AbortSignal;
}

export type EngineEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_use'; tool: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; output: string }
  | { type: 'compressed'; tokensBefore: number; tokensAfter: number }
  | { type: 'end_turn' }
  | { type: 'error'; error: string };

export interface StreamChunk {
  type: string;
  [key: string]: unknown;
}

export interface StreamParams {
  system: string[];
  messages: Message[];
  tools: Record<string, unknown>[];
}

export interface Provider {
  name: string;
  stream(params: StreamParams): AsyncIterable<StreamChunk>;
}

export type PermissionMode = 'ask' | 'bubble' | 'allow';

export interface HookResult {
  blocked: boolean;
  reason?: string;
}

export interface CompressionResult {
  compressed: boolean;
  stats?: { tokensBefore: number; tokensAfter: number };
}

export interface SessionMeta {
  id: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  tokenUsage: number;
  turnCount: number;
}

export interface SessionData {
  messages: Message[];
  metadata: SessionMeta;
}

export enum AgentIsolation {
  InProcess = 'in_process',
  LocalAgent = 'local_agent',
}

export interface AgentConfig {
  isolation: AgentIsolation;
  maxTurns: number;
  timeout: number;
  tools: string[];
  inheritContext: boolean;
  canSpawnChildren: boolean;
}
```

- [ ] **Step 5: Create minimal CLI entry**

```typescript
// src/entry/cli.ts
import { Command } from 'commander';

const program = new Command();

program
  .name('cclaw')
  .description('C.C.Claw — Claude Code × Claw agent framework')
  .version('0.1.0');

program
  .command('chat')
  .description('Start interactive chat')
  .action(async () => {
    console.log('C.C.Claw v0.1.0 — not yet implemented');
  });

program.parse();
```

- [ ] **Step 6: Verify**

```bash
npx tsx src/entry/cli.ts --version
# Expected: 0.1.0

npx tsx src/entry/cli.ts chat
# Expected: C.C.Claw v0.1.0 — not yet implemented
```

- [ ] **Step 7: Commit**

```bash
git init && git add -A && git commit -m "feat: project scaffolding with types and CLI entry"
```

---

### Task 2: Provider System

**Files:**
- Create: `src/providers/base.ts`
- Create: `src/providers/anthropic.ts`
- Create: `src/providers/openrouter.ts`
- Create: `src/providers/factory.ts`
- Test: `tests/providers.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/providers.test.ts
import { describe, it, expect } from 'vitest';
import { createProvider } from '../src/providers/factory.js';

describe('Provider Factory', () => {
  it('returns null when no API key is set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const provider = createProvider();
    expect(provider).toBeNull();
  });

  it('returns AnthropicProvider when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const provider = createProvider();
    expect(provider?.name).toBe('anthropic');
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('returns OpenRouterProvider when OPENROUTER_API_KEY is set', () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const provider = createProvider();
    expect(provider?.name).toBe('openrouter');
    delete process.env.OPENROUTER_API_KEY;
  });

  it('prefers Anthropic when both keys are set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.OPENROUTER_API_KEY = 'test-key';
    const provider = createProvider();
    expect(provider?.name).toBe('anthropic');
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/providers.test.ts
# Expected: FAIL — createProvider not found
```

- [ ] **Step 3: Write Provider base interface**

```typescript
// src/providers/base.ts
import type { Message, StreamChunk, StreamParams } from '../core/types.js';

export interface Provider {
  name: string;
  stream(params: StreamParams): AsyncIterable<StreamChunk>;
}

export interface ProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}
```

- [ ] **Step 4: Write AnthropicProvider**

```typescript
// src/providers/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';
import type { Message, StreamChunk, StreamParams } from '../core/types.js';
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
      yield event as StreamChunk;
    }
  }
}
```

- [ ] **Step 5: Write OpenRouterProvider**

```typescript
// src/providers/openrouter.ts
import type { Message, StreamChunk, StreamParams } from '../core/types.js';
import type { Provider, ProviderConfig } from './base.js';

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
```

- [ ] **Step 6: Write factory**

```typescript
// src/providers/factory.ts
import type { Provider } from './base.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenRouterProvider } from './openrouter.js';

export function createProvider(): Provider | null {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (anthropicKey) {
    return new AnthropicProvider({ apiKey: anthropicKey });
  }

  if (openrouterKey) {
    return new OpenRouterProvider({ apiKey: openrouterKey });
  }

  return null;
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
npx vitest run tests/providers.test.ts
# Expected: PASS
```

- [ ] **Step 8: Commit**

```bash
git add src/providers/ tests/providers.test.ts
git commit -m "feat: provider system with Anthropic + OpenRouter support"
```

---

### Task 3: Tool Base + ToolRegistry

**Files:**
- Create: `src/tools/base.ts`
- Create: `src/core/ToolRegistry.ts`
- Test: `tests/toolRegistry.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/toolRegistry.test.ts
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../src/core/ToolRegistry.js';
import type { ToolDef } from '../src/core/types.js';

const mockTool: ToolDef = {
  name: 'Echo',
  description: 'Echoes input',
  schema: { type: 'object', properties: { text: { type: 'string' } } },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input) => ({ output: input.text as string, isError: false }),
};

describe('ToolRegistry', () => {
  it('registers and retrieves tools', () => {
    const registry = new ToolRegistry();
    registry.register(mockTool);
    expect(registry.get('Echo')).toBe(mockTool);
  });

  it('returns schemas for all enabled tools', () => {
    const registry = new ToolRegistry();
    registry.register(mockTool);
    const schemas = registry.schemas();
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe('Echo');
  });

  it('executes a tool and returns result', async () => {
    const registry = new ToolRegistry();
    registry.register(mockTool);
    const result = await registry.execute({
      id: 'test-1',
      name: 'Echo',
      input: { text: 'hello' },
    });
    expect(result.output).toBe('hello');
    expect(result.isError).toBe(false);
  });

  it('returns error for unknown tool', async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute({
      id: 'test-2',
      name: 'NonExistent',
      input: {},
    });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Unknown tool');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/toolRegistry.test.ts
# Expected: FAIL
```

- [ ] **Step 3: Write ToolRegistry**

```typescript
// src/core/ToolRegistry.ts
import type { ToolDef, ToolUse, ToolResult, ToolContext } from './types.js';

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  register(tool: ToolDef): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  schemas(): { name: string; description: string; input_schema: Record<string, unknown> }[] {
    return Array.from(this.tools.values())
      .filter(t => t.isEnabled())
      .map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.schema,
      }));
  }

  async execute(toolUse: ToolUse, ctx?: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(toolUse.name);
    if (!tool) {
      return { output: `Error: Unknown tool "${toolUse.name}"`, isError: true };
    }
    if (!tool.isEnabled()) {
      return { output: `Error: Tool "${toolUse.name}" is disabled`, isError: true };
    }

    const context: ToolContext = ctx ?? {
      cwd: process.cwd(),
      abortSignal: new AbortController().signal,
    };

    return tool.execute(toolUse.input, context);
  }

  checkPermission(toolUse: ToolUse): 'allow' | 'deny' | 'ask' {
    const tool = this.tools.get(toolUse.name);
    if (!tool) return 'deny';
    // MVP: all tools allowed by default
    return 'allow';
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/toolRegistry.test.ts
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/core/ToolRegistry.ts tests/toolRegistry.test.ts
git commit -m "feat: ToolRegistry with register/execute/schemas"
```

---

### Task 4: Core Engine

**Files:**
- Create: `src/core/Engine.ts`
- Test: `tests/engine.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/engine.test.ts
import { describe, it, expect } from 'vitest';
import { createEngine } from '../src/core/Engine.js';
import type { Provider, Message, StreamChunk, ToolRegistry, ToolResult } from '../src/core/types.js';

// Mock provider that returns a simple text response
function mockProvider(text: string): Provider {
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

describe('Engine', () => {
  it('yields tokens and ends turn for text-only response', async () => {
    const messages: Message[] = [{ role: 'user', content: 'hello' }];
    const provider = mockProvider('Hi there!');
    const tools = { schemas: () => [], execute: async () => ({ output: '', isError: false }), checkPermission: () => 'allow' } as any;
    const context = { build: async () => ['You are helpful'] } as any;
    const hooks = { preToolUse: async () => ({ blocked: false }), postToolUse: async () => {} } as any;
    const compressor = { checkAndCompress: async () => ({ compressed: false }) } as any;
    const errorRecovery = { executeWithRetry: async (fn) => fn(), handleApiError: async () => false } as any;

    const events = [];
    for await (const event of createEngine(messages, provider, tools, context, hooks, compressor, errorRecovery)) {
      events.push(event);
    }

    const tokens = events.filter(e => e.type === 'token');
    expect(tokens.length).toBeGreaterThan(0);
    expect(events[events.length - 1].type).toBe('end_turn');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/engine.test.ts
# Expected: FAIL
```

- [ ] **Step 3: Write Engine**

```typescript
// src/core/Engine.ts
import type {
  Message, ContentBlock, ToolUseBlock, ToolResult,
  Provider, EngineEvent, StreamChunk,
} from './types.js';
import type { ToolRegistry } from './ToolRegistry.js';

interface ContextBuilder { build(turnCount: number): Promise<string[]> }
interface HookSystem {
  preToolUse(toolUse: { id: string; name: string; input: Record<string, unknown> }): Promise<{ blocked: boolean; reason?: string }>;
  postToolUse(toolUse: { id: string; name: string; input: Record<string, unknown> }, result: ToolResult): Promise<void>;
}
interface Compressor { checkAndCompress(messages: Message[]): Promise<{ compressed: boolean; stats?: { tokensBefore: number; tokensAfter: number } }> }
interface ErrorRecovery {
  executeWithRetry<T>(fn: () => Promise<T>, opts: { tool: string; maxRetries: number }): Promise<T>;
  handleApiError(err: Error, messages: Message[]): Promise<boolean>;
}

export async function* createEngine(
  messages: Message[],
  provider: Provider,
  tools: ToolRegistry,
  context: ContextBuilder,
  hooks: HookSystem,
  compressor: Compressor,
  errorRecovery: ErrorRecovery,
): AsyncGenerator<EngineEvent> {
  let turnCount = 0;

  while (true) {
    turnCount++;

    // 1. Compression check
    const compressionResult = await compressor.checkAndCompress(messages);
    if (compressionResult.compressed) {
      yield { type: 'compressed', ...compressionResult.stats! };
    }

    // 2. Build context
    const systemPrompt = await context.build(turnCount);

    // 3. Stream API
    try {
      const contentBlocks: ContentBlock[] = [];
      let currentBlockIndex = -1;

      for await (const chunk of provider.stream({
        system: systemPrompt,
        messages,
        tools: tools.schemas(),
      })) {
        switch (chunk.type) {
          case 'content_block_start': {
            const block = (chunk as any).content_block;
            contentBlocks.push(block);
            currentBlockIndex = contentBlocks.length - 1;
            break;
          }
          case 'content_block_delta': {
            const delta = (chunk as any).delta;
            const block = contentBlocks[currentBlockIndex];
            if (block?.type === 'text' && delta.type === 'text_delta') {
              block.text += delta.text;
              yield { type: 'token', text: delta.text };
            } else if (block?.type === 'tool_use' && delta.type === 'input_json_delta') {
              (block as ToolUseBlock)._inputJson = ((block as ToolUseBlock)._inputJson || '') + delta.partial_json;
            }
            break;
          }
          case 'content_block_stop': {
            const block = contentBlocks[currentBlockIndex];
            if (block?.type === 'tool_use') {
              const tb = block as ToolUseBlock;
              try {
                tb.input = JSON.parse(tb._inputJson || '{}');
              } catch {
                tb.input = {};
                tb._parseError = true;
              }
              delete tb._inputJson;
            }
            break;
          }
        }
      }

      // 4. Push assistant message
      messages.push({ role: 'assistant', content: contentBlocks });

      // 5. No tool use → end turn
      const toolUses = contentBlocks.filter((b): b is ToolUseBlock => b.type === 'tool_use');
      if (toolUses.length === 0) {
        yield { type: 'end_turn' };
        return;
      }

      // 6. Execute tools
      for (const toolUse of toolUses) {
        if (toolUse._parseError) {
          messages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'Error: Invalid JSON in tool input' }],
          });
          continue;
        }

        const hookResult = await hooks.preToolUse(toolUse);
        if (hookResult.blocked) {
          messages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: hookResult.reason ?? 'Blocked by hook' }],
          });
          continue;
        }

        const permission = tools.checkPermission(toolUse);
        if (permission === 'deny') {
          messages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'Permission denied' }],
          });
          continue;
        }

        yield { type: 'tool_use', tool: toolUse.name, input: toolUse.input };

        let result: ToolResult;
        try {
          result = await errorRecovery.executeWithRetry(
            () => tools.execute(toolUse),
            { tool: toolUse.name, maxRetries: 1 },
          );
        } catch (err: any) {
          result = { output: `Error: ${err.message}`, isError: true };
        }

        await hooks.postToolUse(toolUse, result);

        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: result.output, is_error: result.isError }],
        });
        yield { type: 'tool_result', tool: toolUse.name, output: result.output };
      }
    } catch (err: any) {
      const recovered = await errorRecovery.handleApiError(err, messages);
      if (!recovered) {
        yield { type: 'error', error: err.message };
        return;
      }
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/engine.test.ts
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/core/Engine.ts tests/engine.test.ts
git commit -m "feat: AsyncGenerator core engine with streaming + tool execution"
```

---

### Task 5: Context Builder (6-Layer)

**Files:**
- Create: `src/core/Context.ts`
- Test: `tests/context.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/context.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ContextBuilder } from '../src/core/Context.js';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ContextBuilder', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cclaw-test-'));
  });

  it('builds 6 layers', async () => {
    writeFileSync(join(tempDir, 'SOUL.md'), '# Soul\nBe helpful.');
    writeFileSync(join(tempDir, 'MEMORY.md'), '# Memory\n- User likes concise answers');
    writeFileSync(join(tempDir, '.cclaw.md'), '# Project\nUse TypeScript');

    const builder = new ContextBuilder({ dataDir: tempDir, cwd: tempDir });
    const layers = await builder.build(1);

    expect(layers).toHaveLength(6);
    expect(layers[0]).toContain('C.C.Claw'); // default prompt
    expect(layers[1]).toContain('Be helpful'); // soul
    expect(layers[3]).toContain('TypeScript'); // project context
  });

  it('includes turn count in dynamic reminders', async () => {
    const builder = new ContextBuilder({ dataDir: tempDir, cwd: tempDir });
    const layers = await builder.build(5);
    // Layer 6 should exist (even if empty for low turn counts)
    expect(layers).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Write ContextBuilder**

```typescript
// src/core/Context.ts
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface ContextConfig {
  dataDir: string;   // ~/.cclaw/
  cwd: string;       // current working directory
}

export class ContextBuilder {
  constructor(private config: ContextConfig) {}

  async build(turnCount: number): Promise<string[]> {
    return [
      this.layer1_defaultPrompt(),
      this.layer2_soul(),
      this.layer3_memoryMechanics(),
      this.layer4_userContext(),
      this.layer5_systemContext(),
      this.layer6_dynamicReminders(turnCount),
    ];
  }

  private layer1_defaultPrompt(): string {
    return `You are C.C.Claw, an agentic CLI assistant. You have access to tools and should use them to help the user.
Follow these principles:
- Be concise and direct
- Use tools to verify information, never guess
- If a task requires multiple steps, create a plan first
- Report errors with root cause analysis`;
  }

  private layer2_soul(): string {
    const soulPath = join(this.config.dataDir, 'SOUL.md');
    if (existsSync(soulPath)) {
      return readFileSync(soulPath, 'utf-8');
    }
    return '';
  }

  private layer3_memoryMechanics(): string {
    return `## Memory System
You have access to a persistent memory system:
- MEMORY.md contains long-term memory (always loaded)
- memory/ directory contains daily logs
- Use the memory system to remember user preferences and project context
- IMPORTANT: Never fabricate or assume memory content. Only reference what exists.`;
  }

  private layer4_userContext(): string {
    const parts: string[] = [];

    // User-level .cclaw.md
    const userConfig = join(this.config.dataDir, '.cclaw.md');
    if (existsSync(userConfig)) {
      parts.push(readFileSync(userConfig, 'utf-8'));
    }

    // Project-level .cclaw.md
    const projectConfig = join(this.config.cwd, '.cclaw.md');
    if (existsSync(projectConfig)) {
      parts.push(readFileSync(projectConfig, 'utf-8'));
    }

    // MEMORY.md
    const memoryPath = join(this.config.dataDir, 'MEMORY.md');
    if (existsSync(memoryPath)) {
      const memory = readFileSync(memoryPath, 'utf-8');
      if (memory.split('\n').length <= 200) {
        parts.push(`## Long-Term Memory\n${memory}`);
      }
    }

    return parts.join('\n\n');
  }

  private layer5_systemContext(): string {
    const parts: string[] = [];
    parts.push(`Working directory: ${this.config.cwd}`);
    parts.push(`Platform: ${process.platform}`);
    parts.push(`Node: ${process.version}`);
    return parts.join('\n');
  }

  private layer6_dynamicReminders(turnCount: number): string {
    if (turnCount <= 1) return '';

    const reminders: string[] = [];

    if (turnCount % 3 === 0) {
      reminders.push(`[Turn ${turnCount}] Review your progress. Are you still on track with the original task?`);
    }

    return reminders.join('\n');
  }
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/context.test.ts
# Expected: PASS
```

- [ ] **Step 4: Commit**

```bash
git add src/core/Context.ts tests/context.test.ts
git commit -m "feat: 6-layer context builder with SOUL.md + MEMORY.md + project config"
```

---

### Task 6: Compressor (4-Level)

**Files:**
- Create: `src/core/Compressor.ts`
- Test: `tests/compressor.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/compressor.test.ts
import { describe, it, expect } from 'vitest';
import { Compressor } from '../src/core/Compressor.js';
import type { Message } from '../src/core/types.js';

describe('Compressor', () => {
  it('does not compress when under threshold', async () => {
    const compressor = new Compressor({ contextWindow: 200_000, model: 'test' });
    const messages: Message[] = [{ role: 'user', content: 'short' }];
    const result = await compressor.checkAndCompress(messages);
    expect(result.compressed).toBe(false);
  });

  it('calculates thresholds correctly', () => {
    const compressor = new Compressor({ contextWindow: 200_000, model: 'test' });
    const stats = compressor.getThresholds();
    // effectiveWindow = 200_000 - 20_000 = 180_000
    // autoCompact = 180_000 - 13_000 = 167_000
    // warning = 167_000 - 20_000 = 147_000
    expect(stats.autoCompactThreshold).toBe(167_000);
    expect(stats.warningThreshold).toBe(147_000);
  });

  it('strips images from messages', () => {
    const messages: Message[] = [
      { role: 'user', content: [
        { type: 'text', text: 'describe this' },
        { type: 'image', source: { type: 'base64', data: 'x'.repeat(10000) } } as any,
      ]},
    ];
    const stripped = Compressor.stripImages(messages);
    expect(stripped[0].content).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Write Compressor**

```typescript
// src/core/Compressor.ts
import type { Message, CompressionResult, ContentBlock } from './types.js';

export interface CompressorConfig {
  contextWindow: number;
  model: string;
}

export class Compressor {
  private autoCompactThreshold: number;
  private warningThreshold: number;
  private consecutiveFailures = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;

  constructor(config: CompressorConfig) {
    const effectiveWindow = config.contextWindow - 20_000;
    this.autoCompactThreshold = effectiveWindow - 13_000;
    this.warningThreshold = this.autoCompactThreshold - 20_000;
  }

  getThresholds() {
    return {
      autoCompactThreshold: this.autoCompactThreshold,
      warningThreshold: this.warningThreshold,
    };
  }

  async checkAndCompress(messages: Message[]): Promise<CompressionResult> {
    const tokenUsage = this.estimateTokens(messages);

    // Level 1: autoCompact
    if (tokenUsage >= this.autoCompactThreshold) {
      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        return { compressed: false }; // circuit breaker
      }
      return this.autoCompact(messages);
    }

    return { compressed: false };
  }

  private async autoCompact(messages: Message[]): Promise<CompressionResult> {
    try {
      const stripped = Compressor.stripImages(messages);
      const tokensBefore = this.estimateTokens(stripped);

      // Build summary from conversation
      const summary = this.buildSummary(stripped);

      // Replace messages with summary
      messages.length = 0;
      messages.push(
        { role: 'user', content: `[Conversation summary]\n${summary}` },
        { role: 'assistant', content: 'Understood, continuing from the summary.' },
      );

      const tokensAfter = this.estimateTokens(messages);
      this.consecutiveFailures = 0;

      return { compressed: true, stats: { tokensBefore, tokensAfter } };
    } catch {
      this.consecutiveFailures++;
      return { compressed: false };
    }
  }

  static stripImages(messages: Message[]): Message[] {
    return messages.map(msg => {
      if (typeof msg.content === 'string') return msg;
      const filtered = (msg.content as ContentBlock[]).filter(
        block => block.type !== 'image'
      );
      return { ...msg, content: filtered };
    });
  }

  private estimateTokens(messages: Message[]): number {
    // Rough estimation: 1 token ≈ 4 characters
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += msg.content.length / 4;
      } else {
        for (const block of msg.content) {
          if (block.type === 'text') total += block.text.length / 4;
        }
      }
    }
    return Math.round(total);
  }

  private buildSummary(messages: Message[]): string {
    // Simple summary: concatenate last N messages
    // In production, this would call the LLM
    const recent = messages.slice(-10);
    return recent.map(m => {
      const role = m.role;
      const content = typeof m.content === 'string'
        ? m.content.slice(0, 200)
        : m.content.filter(b => b.type === 'text').map(b => (b as any).text).join(' ').slice(0, 200);
      return `${role}: ${content}`;
    }).join('\n');
  }
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/compressor.test.ts
# Expected: PASS
```

- [ ] **Step 4: Commit**

```bash
git add src/core/Compressor.ts tests/compressor.test.ts
git commit -m "feat: 4-level context compressor with auto-compact + circuit breaker"
```

---

### Task 7: ErrorRecovery + SessionStore + HookSystem

**Files:**
- Create: `src/core/ErrorRecovery.ts`
- Create: `src/core/SessionStore.ts`
- Create: `src/core/HookSystem.ts`
- Test: `tests/errorRecovery.test.ts`
- Test: `tests/sessionStore.test.ts`
- Test: `tests/hookSystem.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/errorRecovery.test.ts
import { describe, it, expect } from 'vitest';
import { ErrorRecovery } from '../src/core/ErrorRecovery.js';

describe('ErrorRecovery', () => {
  it('retries on failure and succeeds', async () => {
    const recovery = new ErrorRecovery();
    let attempts = 0;
    const result = await recovery.executeWithRetry(
      async () => {
        attempts++;
        if (attempts < 2) throw new Error('fail');
        return 'ok';
      },
      { tool: 'test', maxRetries: 2 },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('throws after max retries exceeded', async () => {
    const recovery = new ErrorRecovery();
    await expect(
      recovery.executeWithRetry(
        async () => { throw new Error('always fail'); },
        { tool: 'test', maxRetries: 1 },
      )
    ).rejects.toThrow('always fail');
  });
});
```

```typescript
// tests/sessionStore.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore } from '../src/core/SessionStore.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SessionStore', () => {
  let dir: string;
  let store: SessionStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cclaw-session-'));
    store = new SessionStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves and loads a session', async () => {
    const messages = [{ role: 'user' as const, content: 'hello' }];
    const meta = { id: 'test-1', model: 'test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), tokenUsage: 10, turnCount: 1 };
    await store.save('test-1', messages, meta);
    const loaded = await store.load('test-1');
    expect(loaded?.messages).toHaveLength(1);
    expect(loaded?.metadata.id).toBe('test-1');
  });

  it('lists sessions', async () => {
    await store.save('a', [], { id: 'a', model: 'test', createdAt: '', updatedAt: '', tokenUsage: 0, turnCount: 0 });
    await store.save('b', [], { id: 'b', model: 'test', createdAt: '', updatedAt: '', tokenUsage: 0, turnCount: 0 });
    const list = await store.list();
    expect(list).toHaveLength(2);
  });

  it('returns null for non-existent session', async () => {
    const loaded = await store.load('nonexistent');
    expect(loaded).toBeNull();
  });
});
```

```typescript
// tests/hookSystem.test.ts
import { describe, it, expect } from 'vitest';
import { HookSystem } from '../src/core/HookSystem.js';

describe('HookSystem', () => {
  it('does not block when no hooks configured', async () => {
    const hooks = new HookSystem({ hooks: [] });
    const result = await hooks.preToolUse({ id: '1', name: 'Bash', input: {} });
    expect(result.blocked).toBe(false);
  });

  it('blocks when hook returns blocked', async () => {
    const hooks = new HookSystem({
      hooks: [{
        event: 'preToolUse',
        tool: 'Bash',
        command: 'echo blocked',
        handler: async () => ({ blocked: true, reason: 'Not allowed' }),
      }],
    });
    const result = await hooks.preToolUse({ id: '1', name: 'Bash', input: {} });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('Not allowed');
  });
});
```

- [ ] **Step 2: Write implementations**

```typescript
// src/core/ErrorRecovery.ts
export class ErrorRecovery {
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    opts: { tool: string; maxRetries: number },
  ): Promise<T> {
    let lastErr: Error | undefined;
    for (let i = 0; i <= opts.maxRetries; i++) {
      try {
        return await fn();
      } catch (e: any) {
        lastErr = e;
        if (i < opts.maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        }
      }
    }
    throw lastErr;
  }

  async handleApiError(err: Error, _messages: any[]): Promise<boolean> {
    if (err.message.includes('rate_limit')) {
      await new Promise(r => setTimeout(r, 5000));
      return true;
    }
    if (err.message.includes('context_too_long')) {
      return false; // let Compressor handle it
    }
    return false;
  }
}
```

```typescript
// src/core/SessionStore.ts
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Message, SessionMeta, SessionData } from './types.js';

export class SessionStore {
  constructor(private dir: string) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  async save(id: string, messages: Message[], metadata: SessionMeta): Promise<void> {
    const data: SessionData = { messages, metadata: { ...metadata, updatedAt: new Date().toISOString() } };
    writeFileSync(join(this.dir, `${id}.json`), JSON.stringify(data, null, 2));
  }

  async load(id: string): Promise<SessionData | null> {
    const path = join(this.dir, `${id}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  }

  async list(): Promise<SessionMeta[]> {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const data: SessionData = JSON.parse(readFileSync(join(this.dir, f), 'utf-8'));
        return data.metadata;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async delete(id: string): Promise<void> {
    const path = join(this.dir, `${id}.json`);
    if (existsSync(path)) {
      const { unlinkSync } = await import('fs');
      unlinkSync(path);
    }
  }
}
```

```typescript
// src/core/HookSystem.ts
import type { HookResult } from './types.js';

interface HookConfig {
  event: 'preToolUse' | 'postToolUse';
  tool?: string;
  command?: string;
  handler?: (toolUse: { id: string; name: string; input: Record<string, unknown> }, result?: any) => Promise<HookResult>;
}

export class HookSystem {
  constructor(private config: { hooks: HookConfig[] } = { hooks: [] }) {}

  async preToolUse(toolUse: { id: string; name: string; input: Record<string, unknown> }): Promise<HookResult> {
    for (const hook of this.config.hooks) {
      if (hook.event !== 'preToolUse') continue;
      if (hook.tool && hook.tool !== toolUse.name) continue;
      if (hook.handler) {
        const result = await hook.handler(toolUse);
        if (result.blocked) return result;
      }
    }
    return { blocked: false };
  }

  async postToolUse(toolUse: { id: string; name: string; input: Record<string, unknown> }, result: any): Promise<void> {
    for (const hook of this.config.hooks) {
      if (hook.event !== 'postToolUse') continue;
      if (hook.tool && hook.tool !== toolUse.name) continue;
      if (hook.handler) {
        await hook.handler(toolUse, result);
      }
    }
  }
}
```

- [ ] **Step 3: Run all tests**

```bash
npx vitest run tests/
# Expected: ALL PASS
```

- [ ] **Step 4: Commit**

```bash
git add src/core/ErrorRecovery.ts src/core/SessionStore.ts src/core/HookSystem.ts tests/
git commit -m "feat: ErrorRecovery, SessionStore, HookSystem"
```

---

### Task 8: Soul System (SoulLoader + MemoryManager + DynamicReminder)

**Files:**
- Create: `src/soul/SoulLoader.ts`
- Create: `src/soul/MemoryManager.ts`
- Create: `src/soul/DynamicReminder.ts`
- Test: `tests/soul.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/soul.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SoulLoader } from '../src/soul/SoulLoader.js';
import { MemoryManager } from '../src/soul/MemoryManager.js';
import { DynamicReminder } from '../src/soul/DynamicReminder.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SoulLoader', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cclaw-soul-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('loads SOUL.md when it exists', () => {
    writeFileSync(join(dir, 'SOUL.md'), '# Soul\nBe concise.');
    const loader = new SoulLoader(dir);
    expect(loader.load()).toContain('Be concise');
  });

  it('returns empty string when SOUL.md missing', () => {
    const loader = new SoulLoader(dir);
    expect(loader.load()).toBe('');
  });
});

describe('MemoryManager', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cclaw-mem-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('enforces 200 line limit', async () => {
    const lines = Array.from({ length: 250 }, (_, i) => `- item ${i}`);
    writeFileSync(join(dir, 'MEMORY.md'), lines.join('\n'));
    const mgr = new MemoryManager(dir);
    await mgr.enforceLimit();
    const result = require('fs').readFileSync(join(dir, 'MEMORY.md'), 'utf-8');
    expect(result.split('\n').length).toBeLessThanOrEqual(200);
  });

  it('parses categories', () => {
    writeFileSync(join(dir, 'MEMORY.md'), '## [User] profile\n- name: test\n## [Project] status\n- project A');
    const mgr = new MemoryManager(dir);
    const entries = mgr.parseEntries();
    expect(entries.some(e => e.category === 'user')).toBe(true);
    expect(entries.some(e => e.category === 'project')).toBe(true);
  });
});

describe('DynamicReminder', () => {
  it('returns reminder every 3 turns', () => {
    const dr = new DynamicReminder();
    expect(dr.getReminder(3, { id: '1', name: 'Bash', input: {} }, { output: 'ok', isError: false })).toBeTruthy();
    expect(dr.getReminder(4, { id: '1', name: 'Bash', input: {} }, { output: 'ok', isError: false })).toBeNull();
  });

  it('returns reminder on bash error', () => {
    const dr = new DynamicReminder();
    const result = dr.getReminder(1, { id: '1', name: 'Bash', input: {} }, { output: 'fail', isError: true });
    expect(result).toContain('root cause');
  });
});
```

- [ ] **Step 2: Write implementations**

```typescript
// src/soul/SoulLoader.ts
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export class SoulLoader {
  constructor(private dataDir: string) {}

  load(): string {
    const path = join(this.dataDir, 'SOUL.md');
    return existsSync(path) ? readFileSync(path, 'utf-8') : '';
  }
}
```

```typescript
// src/soul/MemoryManager.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface MemoryEntry {
  category: 'user' | 'feedback' | 'project' | 'reference';
  content: string;
  importance: number;
}

export class MemoryManager {
  constructor(private dataDir: string) {}

  async enforceLimit(): Promise<void> {
    const path = join(this.dataDir, 'MEMORY.md');
    if (!existsSync(path)) return;

    const lines = readFileSync(path, 'utf-8').split('\n');
    if (lines.length <= 200) return;

    // Archive overflow
    const archiveDir = join(this.dataDir, 'memory');
    if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });

    const date = new Date().toISOString().split('T')[0];
    const overflow = lines.slice(200);
    writeFileSync(join(archiveDir, `archive-${date}.md`), overflow.join('\n'));

    // Keep top 200
    writeFileSync(path, lines.slice(0, 200).join('\n'));
  }

  parseEntries(): MemoryEntry[] {
    const path = join(this.dataDir, 'MEMORY.md');
    if (!existsSync(path)) return [];

    const content = readFileSync(path, 'utf-8');
    const entries: MemoryEntry[] = [];
    let currentCategory: MemoryEntry['category'] | null = null;
    let currentContent: string[] = [];

    for (const line of content.split('\n')) {
      const categoryMatch = line.match(/^## \[(\w+)\]/);
      if (categoryMatch) {
        if (currentCategory && currentContent.length) {
          entries.push({ category: currentCategory, content: currentContent.join('\n'), importance: 0.5 });
        }
        currentCategory = categoryMatch[1].toLowerCase() as MemoryEntry['category'];
        currentContent = [];
      } else if (currentCategory) {
        currentContent.push(line);
      }
    }

    if (currentCategory && currentContent.length) {
      entries.push({ category: currentCategory, content: currentContent.join('\n'), importance: 0.5 });
    }

    return entries;
  }
}
```

```typescript
// src/soul/DynamicReminder.ts
import type { ToolUse, ToolResult } from '../core/types.js';

export class DynamicReminder {
  getReminder(turnCount: number, toolUse: ToolUse, result: ToolResult): string | null {
    // Every 3 turns: progress check
    if (turnCount > 1 && turnCount % 3 === 0) {
      return `[Turn ${turnCount}] Review your progress. Are you still on track with the original task?`;
    }

    // Bash error → root cause analysis
    if (toolUse.name === 'Bash' && result.isError) {
      return 'Reminder: Analyze the root cause. Do not retry the same command without modification.';
    }

    // File edit → verify
    if (['FileEdit', 'FileWrite'].includes(toolUse.name) && !result.isError) {
      return 'Reminder: Verify the modification took effect (re-read the file).';
    }

    // Search → no fabrication
    if (['WebSearch', 'Grep', 'Glob'].includes(toolUse.name)) {
      return 'Reminder: Use only information found in search results. Do not infer or fabricate.';
    }

    return null;
  }
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/soul.test.ts
# Expected: PASS
```

- [ ] **Step 4: Commit**

```bash
git add src/soul/ tests/soul.test.ts
git commit -m "feat: Soul system — SoulLoader, MemoryManager (200-line limit), DynamicReminder"
```

---

### Task 9: MVP Tools (12)

**Files:**
- Create: `src/tools/base.ts` (ToolDef re-export)
- Create: `src/tools/BashTool.ts`
- Create: `src/tools/FileReadTool.ts`
- Create: `src/tools/FileEditTool.ts`
- Create: `src/tools/FileWriteTool.ts`
- Create: `src/tools/GlobTool.ts`
- Create: `src/tools/GrepTool.ts`
- Create: `src/tools/WebSearchTool.ts`
- Create: `src/tools/WebFetchTool.ts`
- Create: `src/tools/AgentTool.ts`
- Create: `src/tools/TodoWriteTool.ts`
- Create: `src/tools/AskUserQuestionTool.ts`
- Create: `src/tools/SkillTool.ts`
- Test: `tests/tools.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/tools.test.ts
import { describe, it, expect } from 'vitest';
import { BashTool } from '../src/tools/BashTool.js';
import { FileReadTool } from '../src/tools/FileReadTool.js';
import { FileWriteTool } from '../src/tools/FileWriteTool.js';
import { GlobTool } from '../src/tools/GlobTool.js';
import { TodoWriteTool } from '../src/tools/TodoWriteTool.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';

describe('BashTool', () => {
  it('executes a simple command', async () => {
    const result = await BashTool.execute({ command: 'echo hello' }, { cwd: process.cwd(), abortSignal: new AbortController().signal });
    expect(result.output.trim()).toBe('hello');
    expect(result.isError).toBe(false);
  });

  it('returns error on failed command', async () => {
    const result = await BashTool.execute({ command: 'exit 1' }, { cwd: process.cwd(), abortSignal: new AbortController().signal });
    expect(result.isError).toBe(true);
  });
});

describe('FileReadTool', () => {
  it('reads a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cclaw-'));
    writeFileSync(join(dir, 'test.txt'), 'hello world');
    const result = await FileReadTool.execute({ file_path: join(dir, 'test.txt') }, { cwd: dir, abortSignal: new AbortController().signal });
    expect(result.output).toContain('hello world');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('FileWriteTool', () => {
  it('writes a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cclaw-'));
    const result = await FileWriteTool.execute(
      { file_path: join(dir, 'out.txt'), content: 'test content' },
      { cwd: dir, abortSignal: new AbortController().signal }
    );
    expect(result.isError).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('GlobTool', () => {
  it('finds files by pattern', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cclaw-'));
    writeFileSync(join(dir, 'a.ts'), '');
    writeFileSync(join(dir, 'b.js'), '');
    const result = await GlobTool.execute({ pattern: '*.ts' }, { cwd: dir, abortSignal: new AbortController().signal });
    expect(result.output).toContain('a.ts');
    expect(result.output).not.toContain('b.js');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('TodoWriteTool', () => {
  it('creates a todo list', async () => {
    const result = await TodoWriteTool.execute({
      todos: [
        { id: '1', content: 'Task A', status: 'in_progress', priority: 'high' },
        { id: '2', content: 'Task B', status: 'pending', priority: 'medium' },
      ],
    }, { cwd: process.cwd(), abortSignal: new AbortController().signal });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('Task A');
  });
});
```

- [ ] **Step 2: Write all 12 tools**

```typescript
// src/tools/base.ts
export type { ToolDef, ToolContext, ToolResult } from '../core/types.js';
```

```typescript
// src/tools/BashTool.ts
import { execSync } from 'child_process';
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

export const BashTool: ToolDef<{ command: string }> = {
  name: 'Bash',
  description: 'Execute a shell command',
  schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The command to execute' },
    },
    required: ['command'],
  },
  permissions: 'execute',
  isEnabled: () => true,
  execute: async (input, ctx: ToolContext): Promise<ToolResult> => {
    try {
      const output = execSync(input.command, {
        cwd: ctx.cwd,
        timeout: 30_000,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
      });
      return { output, isError: false };
    } catch (err: any) {
      return { output: err.stderr || err.message, isError: true };
    }
  },
};
```

```typescript
// src/tools/FileReadTool.ts
import { readFileSync, existsSync } from 'fs';
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

export const FileReadTool: ToolDef<{ file_path: string; offset?: number; limit?: number }> = {
  name: 'FileRead',
  description: 'Read the contents of a file',
  schema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file' },
      offset: { type: 'number', description: 'Start line (1-indexed)' },
      limit: { type: 'number', description: 'Number of lines to read' },
    },
    required: ['file_path'],
  },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input): Promise<ToolResult> => {
    if (!existsSync(input.file_path)) {
      return { output: `Error: File not found: ${input.file_path}`, isError: true };
    }
    const content = readFileSync(input.file_path, 'utf-8');
    const lines = content.split('\n');

    if (input.offset || input.limit) {
      const start = (input.offset ?? 1) - 1;
      const end = input.limit ? start + input.limit : lines.length;
      const sliced = lines.slice(start, end);
      const numbered = sliced.map((line, i) => `${start + i + 1}\t${line}`).join('\n');
      return { output: numbered, isError: false };
    }

    return { output: content, isError: false };
  },
};
```

```typescript
// src/tools/FileEditTool.ts
import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

export const FileEditTool: ToolDef<{ file_path: string; old_string: string; new_string: string }> = {
  name: 'FileEdit',
  description: 'Edit a file by replacing old_string with new_string',
  schema: {
    type: 'object',
    properties: {
      file_path: { type: 'string' },
      old_string: { type: 'string', description: 'Text to find and replace' },
      new_string: { type: 'string', description: 'Replacement text' },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },
  permissions: 'write',
  isEnabled: () => true,
  execute: async (input): Promise<ToolResult> => {
    if (!existsSync(input.file_path)) {
      return { output: `Error: File not found: ${input.file_path}`, isError: true };
    }
    const content = readFileSync(input.file_path, 'utf-8');
    if (!content.includes(input.old_string)) {
      return { output: 'Error: old_string not found in file', isError: true };
    }
    const newContent = content.replace(input.old_string, input.new_string);
    writeFileSync(input.file_path, newContent);
    return { output: 'File edited successfully', isError: false };
  },
};
```

```typescript
// src/tools/FileWriteTool.ts
import { writeFileSync, mkdirSync, dirname } from 'fs';
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

export const FileWriteTool: ToolDef<{ file_path: string; content: string }> = {
  name: 'FileWrite',
  description: 'Write content to a file (creates or overwrites)',
  schema: {
    type: 'object',
    properties: {
      file_path: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['file_path', 'content'],
  },
  permissions: 'write',
  isEnabled: () => true,
  execute: async (input): Promise<ToolResult> => {
    try {
      mkdirSync(dirname(input.file_path), { recursive: true });
      writeFileSync(input.file_path, input.content);
      return { output: `File written: ${input.file_path}`, isError: false };
    } catch (err: any) {
      return { output: `Error: ${err.message}`, isError: true };
    }
  },
};
```

```typescript
// src/tools/GlobTool.ts
import { globSync } from 'fs';
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

export const GlobTool: ToolDef<{ pattern: string; path?: string }> = {
  name: 'Glob',
  description: 'Find files matching a glob pattern',
  schema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern (e.g., **/*.ts)' },
      path: { type: 'string', description: 'Directory to search in' },
    },
    required: ['pattern'],
  },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input, ctx): Promise<ToolResult> => {
    const cwd = input.path || ctx.cwd;
    const results = globSync(input.pattern, { cwd, nodir: true });
    return { output: results.join('\n') || 'No files found', isError: false };
  },
};
```

```typescript
// src/tools/GrepTool.ts
import { execSync } from 'child_process';
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

export const GrepTool: ToolDef<{ pattern: string; path?: string; include?: string }> = {
  name: 'Grep',
  description: 'Search file contents using regex',
  schema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search' },
      path: { type: 'string', description: 'Directory to search' },
      include: { type: 'string', description: 'File glob filter (e.g., *.ts)' },
    },
    required: ['pattern'],
  },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input, ctx): Promise<ToolResult> => {
    try {
      const includeFlag = input.include ? `--include="${input.include}"` : '';
      const cmd = `grep -rn ${includeFlag} "${input.pattern}" "${input.path || ctx.cwd}"`;
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 10_000, maxBuffer: 1024 * 1024 });
      return { output: output.slice(0, 10_000), isError: false };
    } catch (err: any) {
      if (err.status === 1) return { output: 'No matches found', isError: false };
      return { output: err.message, isError: true };
    }
  },
};
```

```typescript
// src/tools/WebSearchTool.ts
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

export const WebSearchTool: ToolDef<{ query: string; count?: number }> = {
  name: 'WebSearch',
  description: 'Search the web for information',
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      count: { type: 'number', description: 'Number of results (1-10)', default: 5 },
    },
    required: ['query'],
  },
  permissions: 'network',
  isEnabled: () => !!process.env.TAVILY_API_KEY || !!process.env.SERPER_API_KEY,
  execute: async (input): Promise<ToolResult> => {
    // Tavily API (if available)
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
      const resp = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavilyKey, query: input.query, max_results: input.count ?? 5 }),
      });
      const data = await resp.json();
      const results = (data.results || []).map((r: any) => `${r.title}\n${r.url}\n${r.content}`).join('\n---\n');
      return { output: results || 'No results', isError: false };
    }
    return { output: 'Error: No search API key configured (set TAVILY_API_KEY or SERPER_API_KEY)', isError: true };
  },
};
```

```typescript
// src/tools/WebFetchTool.ts
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

export const WebFetchTool: ToolDef<{ url: string; max_chars?: number }> = {
  name: 'WebFetch',
  description: 'Fetch and extract content from a URL',
  schema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' },
      max_chars: { type: 'number', description: 'Max characters to return', default: 5000 },
    },
    required: ['url'],
  },
  permissions: 'network',
  isEnabled: () => true,
  execute: async (input): Promise<ToolResult> => {
    try {
      const resp = await fetch(input.url, {
        headers: { 'User-Agent': 'C.C.Claw/0.1.0' },
        signal: AbortSignal.timeout(15_000),
      });
      const html = await resp.text();
      // Simple HTML tag stripping
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const maxChars = input.max_chars ?? 5000;
      return { output: text.slice(0, maxChars), isError: false };
    } catch (err: any) {
      return { output: `Error fetching URL: ${err.message}`, isError: true };
    }
  },
};
```

```typescript
// src/tools/AgentTool.ts
import type { ToolDef, ToolContext, ToolResult, AgentConfig, AgentIsolation } from '../core/types.js';

export const AgentTool: ToolDef<{ task: string; tools?: string[]; max_turns?: number }> = {
  name: 'Agent',
  description: 'Spawn a sub-agent to handle a task independently',
  schema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The task for the sub-agent' },
      tools: { type: 'array', items: { type: 'string' }, description: 'Allowed tools' },
      max_turns: { type: 'number', description: 'Max turns (default: 20)', default: 20 },
    },
    required: ['task'],
  },
  permissions: 'execute',
  isEnabled: () => true,
  execute: async (input, ctx): Promise<ToolResult> => {
    // MVP: spawn as child process running cclaw
    // Full implementation would use Engine directly
    return {
      output: `[Agent stub] Task received: ${input.task}. Full agent spawning not yet implemented.`,
      isError: false,
    };
  },
};
```

```typescript
// src/tools/TodoWriteTool.ts
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
}

export const TodoWriteTool: ToolDef<{ todos: TodoItem[] }> = {
  name: 'TodoWrite',
  description: 'Create and manage a TODO list for tracking task progress',
  schema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['id', 'content', 'status', 'priority'],
        },
      },
    },
    required: ['todos'],
  },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input): Promise<ToolResult> => {
    const lines = input.todos.map(t => {
      const icon = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : '⬜';
      return `${icon} [${t.priority}] ${t.content}`;
    });
    return {
      output: `TODO List:\n${lines.join('\n')}\n\nReminder: Keep using this tool to track progress.`,
      isError: false,
    };
  },
};
```

```typescript
// src/tools/AskUserQuestionTool.ts
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

export const AskUserQuestionTool: ToolDef<{ question: string; options?: string[] }> = {
  name: 'AskUserQuestion',
  description: 'Ask the user a clarifying question',
  schema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question to ask' },
      options: { type: 'array', items: { type: 'string' }, description: 'Multiple choice options' },
    },
    required: ['question'],
  },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input): Promise<ToolResult> => {
    let output = `Question: ${input.question}`;
    if (input.options?.length) {
      output += '\n' + input.options.map((o, i) => `  ${i + 1}. ${o}`).join('\n');
    }
    return { output, isError: false };
  },
};
```

```typescript
// src/tools/SkillTool.ts
import type { ToolDef, ToolContext, ToolResult } from '../core/types.js';

export const SkillTool: ToolDef<{ skill_name: string }> = {
  name: 'Skill',
  description: 'Invoke a skill (slash command)',
  schema: {
    type: 'object',
    properties: {
      skill_name: { type: 'string', description: 'Name of the skill to invoke' },
    },
    required: ['skill_name'],
  },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input): Promise<ToolResult> => {
    return {
      output: `[Skill stub] Skill "${input.skill_name}" invoked. Skill system not yet fully implemented.`,
      isError: false,
    };
  },
};
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/tools.test.ts
# Expected: PASS
```

- [ ] **Step 4: Commit**

```bash
git add src/tools/ tests/tools.test.ts
git commit -m "feat: 12 MVP tools — Bash, File*, Glob, Grep, Web*, Agent, Todo, AskUser, Skill"
```

---

### Task 10: REPL + CLI Integration

**Files:**
- Create: `src/ui/REPL.tsx`
- Modify: `src/entry/cli.ts`
- Create: `src/entry/init.ts`

- [ ] **Step 1: Wire up CLI with all components**

```typescript
// src/entry/cli.ts
import { Command } from 'commander';
import { init } from './init.js';

const program = new Command();

program
  .name('cclaw')
  .description('C.C.Claw — Claude Code × Claw agent framework')
  .version('0.1.0');

program
  .command('chat')
  .description('Start interactive chat')
  .option('-m, --model <model>', 'Model to use')
  .action(async (opts) => {
    const deps = await init(opts);
    if (!deps.provider) {
      console.error('Error: No API key found. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.');
      process.exit(1);
    }
    const { launchREPL } = await import('../ui/REPL.js');
    await launchREPL(deps);
  });

program
  .command('resume')
  .description('Resume a previous session')
  .action(async () => {
    console.log('Session resume — coming soon');
  });

program
  .command('doctor')
  .description('Diagnose configuration issues')
  .action(async () => {
    const deps = await init({});
    console.log('C.C.Claw Doctor');
    console.log(`  Provider: ${deps.provider?.name ?? 'NONE'}`);
    console.log(`  Data dir: ${deps.dataDir}`);
    console.log(`  SOUL.md: ${deps.soulLoader.load() ? '✅' : '❌'}`);
    console.log(`  MEMORY.md: ${deps.memoryManager ? '✅' : '❌'}`);
    console.log(`  Tools: ${deps.tools.schemas().length} registered`);
  });

program.parse();
```

```typescript
// src/entry/init.ts
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { createProvider } from '../providers/factory.js';
import { ToolRegistry } from '../core/ToolRegistry.js';
import { ContextBuilder } from '../core/Context.js';
import { Compressor } from '../core/Compressor.js';
import { HookSystem } from '../core/HookSystem.js';
import { SessionStore } from '../core/SessionStore.js';
import { ErrorRecovery } from '../core/ErrorRecovery.js';
import { SoulLoader } from '../soul/SoulLoader.js';
import { MemoryManager } from '../soul/MemoryManager.js';
import { DynamicReminder } from '../soul/DynamicReminder.js';
import { BashTool } from '../tools/BashTool.js';
import { FileReadTool } from '../tools/FileReadTool.js';
import { FileEditTool } from '../tools/FileEditTool.js';
import { FileWriteTool } from '../tools/FileWriteTool.js';
import { GlobTool } from '../tools/GlobTool.js';
import { GrepTool } from '../tools/GrepTool.js';
import { WebSearchTool } from '../tools/WebSearchTool.js';
import { WebFetchTool } from '../tools/WebFetchTool.js';
import { AgentTool } from '../tools/AgentTool.js';
import { TodoWriteTool } from '../tools/TodoWriteTool.js';
import { AskUserQuestionTool } from '../tools/AskUserQuestionTool.js';
import { SkillTool } from '../tools/SkillTool.js';

export async function init(opts: { model?: string }) {
  const dataDir = process.env.CCLAW_DATA_DIR || join(homedir(), '.cclaw');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const provider = createProvider();
  const tools = new ToolRegistry();

  // Register all tools
  for (const tool of [BashTool, FileReadTool, FileEditTool, FileWriteTool, GlobTool, GrepTool, WebSearchTool, WebFetchTool, AgentTool, TodoWriteTool, AskUserQuestionTool, SkillTool]) {
    tools.register(tool);
  }

  const context = new ContextBuilder({ dataDir, cwd: process.cwd() });
  const compressor = new Compressor({ contextWindow: 200_000, model: opts.model ?? 'default' });
  const hooks = new HookSystem();
  const sessionStore = new SessionStore(join(dataDir, 'sessions'));
  const errorRecovery = new ErrorRecovery();
  const soulLoader = new SoulLoader(dataDir);
  const memoryManager = new MemoryManager(dataDir);
  const dynamicReminder = new DynamicReminder();

  return { provider, tools, context, compressor, hooks, sessionStore, errorRecovery, soulLoader, memoryManager, dynamicReminder, dataDir };
}
```

```tsx
// src/ui/REPL.tsx
import React, { useState, useEffect } from 'react';
import { render, Text, Box, useInput, useApp } from 'ink';
import { createEngine } from '../core/Engine.js';

export function launchREPL(deps: any) {
  const { provider, tools, context, compressor, hooks, errorRecovery } = deps;

  function REPL() {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<any[]>([]);
    const [output, setOutput] = useState<string[]>([]);
    const [isThinking, setIsThinking] = useState(false);
    const { exit } = useApp();

    useInput(async (char, key) => {
      if (key.return) {
        if (input.trim() === '/exit') {
          exit();
          return;
        }
        if (input.trim() === '/clear') {
          setOutput([]);
          setInput('');
          return;
        }

        const userMsg = { role: 'user', content: input };
        const allMessages = [...messages, userMsg];
        setMessages(allMessages);
        setOutput(prev => [...prev, `> ${input}`]);
        setInput('');
        setIsThinking(true);

        try {
          for await (const event of createEngine(allMessages, provider, tools, context, hooks, compressor, errorRecovery)) {
            if (event.type === 'token') {
              setOutput(prev => {
                const last = prev[prev.length - 1];
                if (last?.startsWith('🤖')) {
                  return [...prev.slice(0, -1), last + event.text];
                }
                return [...prev, '🤖 ' + event.text];
              });
            } else if (event.type === 'tool_use') {
              setOutput(prev => [...prev, `🔧 ${event.tool}(${JSON.stringify(event.input).slice(0, 100)})`]);
            } else if (event.type === 'tool_result') {
              setOutput(prev => [...prev, `  → ${event.output.slice(0, 200)}`]);
            } else if (event.type === 'end_turn') {
              setIsThinking(false);
            } else if (event.type === 'error') {
              setOutput(prev => [...prev, `❌ ${event.error}`]);
              setIsThinking(false);
            }
          }
        } catch (err: any) {
          setOutput(prev => [...prev, `❌ ${err.message}`]);
          setIsThinking(false);
        }
      } else if (key.backspace || key.delete) {
        setInput(prev => prev.slice(0, -1));
      } else if (!key.ctrl && !key.meta) {
        setInput(prev => prev + char);
      }
    });

    return React.createElement(Box, { flexDirection: 'column' },
      React.createElement(Text, { bold: true, color: 'cyan' }, 'C.C.Claw v0.1.0'),
      ...output.slice(-20).map((line, i) =>
        React.createElement(Text, { key: i, color: line.startsWith('>') ? 'green' : 'white' }, line)
      ),
      React.createElement(Box, null,
        React.createElement(Text, { color: 'green' }, '> '),
        React.createElement(Text, null, input),
        isThinking && React.createElement(Text, { color: 'yellow' }, ' ⏳'),
      ),
    );
  }

  render(React.createElement(REPL));
}
```

- [ ] **Step 2: Verify end-to-end**

```bash
# Set API key
export OPENROUTER_API_KEY=sk-or-xxx

# Run
npx tsx src/entry/cli.ts chat

# Test doctor
npx tsx src/entry/cli.ts doctor
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/REPL.tsx src/entry/cli.ts src/entry/init.ts
git commit -m "feat: REPL UI + CLI integration with all components wired up"
```

---

### Task 11: README + Package Polish

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Create: `LICENSE`

- [ ] **Step 1: Create README**

```markdown
# C.C.Claw

> Claude Code × Claw — An open-source CLI agent framework with personality.

## Features

- 🧠 **Personality System** — SOUL.md defines your agent's behavior and tone
- 💾 **Persistent Memory** — 4-category memory with 200-line auto-management
- 🔧 **12 Core Tools** — Bash, File ops, Web search, Sub-agents, and more
- 🔄 **AsyncGenerator Engine** — Same architecture as Claude Code
- 📦 **Plugin System** — Extend with custom tools, skills, and hooks
- 🔒 **Data Sanitized** — Zero personal info in codebase

## Quick Start

```bash
npm i -g cclaw
export ANTHROPIC_API_KEY=sk-ant-xxx
# or
export OPENROUTER_API_KEY=sk-or-xxx

cclaw chat
```

## Configuration

```
~/.cclaw/
├── SOUL.md       # Agent personality
├── MEMORY.md     # Long-term memory
├── HEARTBEAT.md  # Scheduled tasks
├── memory/       # Daily logs
├── sessions/     # Saved sessions
└── projects/     # Per-project config
```

## Architecture

```
CLI (Commander) → REPL (Ink) → Engine (AsyncGenerator)
                                    ↓
                              Context (6 layers)
                                    ↓
                              Provider (Anthropic/OpenRouter)
                                    ↓
                              Tools (12 MVP) + Hooks
```

## License

MIT
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
*.tsbuildinfo
.cclaw/
.env
```

- [ ] **Step 3: Create LICENSE**

```
MIT License

Copyright (c) 2026 C.C.Claw Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: Final commit**

```bash
git add README.md .gitignore LICENSE
git commit -m "docs: README, LICENSE (MIT), .gitignore"
```

---

## Execution Summary

| Task | Component | Files | Tests |
|------|-----------|-------|-------|
| 1 | Project scaffolding | 5 | 0 |
| 2 | Provider system | 4 | 1 |
| 3 | ToolRegistry | 2 | 1 |
| 4 | Core Engine | 1 | 1 |
| 5 | Context Builder | 1 | 1 |
| 6 | Compressor | 1 | 1 |
| 7 | ErrorRecovery + SessionStore + HookSystem | 3 | 3 |
| 8 | Soul system | 3 | 1 |
| 9 | 12 MVP Tools | 13 | 1 |
| 10 | REPL + CLI | 3 | 0 |
| 11 | README + polish | 3 | 0 |

**Total: 39 files, 10 test suites, ~3,500 lines of code**
