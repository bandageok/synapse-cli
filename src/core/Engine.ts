// src/core/Engine.ts
import type {
  Message, ContentBlock, ToolUseBlock, ToolResult,
  Provider, EngineEvent, StreamChunk,
} from './types.js';
import type { ToolRegistry } from './ToolRegistry.js';

export interface ContextBuilder { build(turnCount: number): Promise<string[]> }
export interface HookSystem {
  preToolUse(toolUse: { id: string; name: string; input: Record<string, unknown> }): Promise<{ blocked: boolean; reason?: string }>;
  postToolUse(toolUse: { id: string; name: string; input: Record<string, unknown> }, result: ToolResult): Promise<void>;
}
export interface Compressor { checkAndCompress(messages: Message[]): Promise<{ compressed: boolean; stats?: { tokensBefore: number; tokensAfter: number } }> }
export interface ErrorRecovery {
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
