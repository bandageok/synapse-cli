// src/core/Engine.ts
import type {
  Message, ContentBlock, ToolUseBlock, ToolResult,
  Provider, EngineEvent,
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

export interface EngineOptions {
  onPermissionAsk?: (tool: string, input: Record<string, unknown>, toolUseId: string) => Promise<boolean>;
  watchdog?: { recordTurn: (turn: number, content: string, hasToolCall: boolean) => void; report: () => string };
  selfImprovement?: { logError: (tool: string, command: string, error: string) => void };
  logger?: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    audit?: (action: string, meta?: Record<string, unknown>) => void;
  };
}

export async function* createEngine(
  messages: Message[],
  provider: Provider,
  tools: ToolRegistry,
  context: ContextBuilder,
  hooks: HookSystem,
  compressor: Compressor,
  errorRecovery: ErrorRecovery,
  options?: EngineOptions,
): AsyncGenerator<EngineEvent> {
  let turnCount = 0;

  while (true) {
    turnCount++;
    options?.logger?.info(`Turn ${turnCount} started`);

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
            const block = chunk.content_block;
            contentBlocks.push(block);
            currentBlockIndex = contentBlocks.length - 1;
            break;
          }
          case 'content_block_delta': {
            const delta = chunk.delta;
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

      // 4.5 假执行检测（在 toolUses 定义之后）
      const textContent = contentBlocks
        .filter((b): b is any => b.type === 'text')
        .map(b => b.text)
        .join(' ');
      const hasToolUse = toolUses.length > 0;
      if (options?.watchdog) {
        options.watchdog.recordTurn(turnCount, textContent, hasToolUse);
        const report = options.watchdog.report();
        if (report) {
          yield { type: 'token', text: `\n${report}` };
        }
      }

      if (toolUses.length === 0) {
        yield { type: 'end_turn' };
        return;
      }

      // 6. Execute tools
      for (const toolUse of toolUses) {
        if (toolUse._parseError) {
          options?.logger?.audit?.('tool.input.invalid_json', {
            toolUseId: toolUse.id,
            tool: toolUse.name,
          });
          messages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'Error: Invalid JSON in tool input' }],
          });
          continue;
        }

        const hookResult = await hooks.preToolUse(toolUse);
        if (hookResult.blocked) {
          options?.logger?.audit?.('tool.blocked_by_hook', {
            toolUseId: toolUse.id,
            tool: toolUse.name,
            input: toolUse.input,
            reason: hookResult.reason ?? 'Blocked by hook',
          });
          messages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: hookResult.reason ?? 'Blocked by hook' }],
          });
          continue;
        }

        const permission = tools.checkPermission(toolUse);
        options?.logger?.audit?.('tool.permission_decision', {
          toolUseId: toolUse.id,
          tool: toolUse.name,
          input: toolUse.input,
          decision: permission,
        });
        if (permission === 'deny') {
          messages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'Permission denied' }],
          });
          continue;
        }

        if (permission === 'ask') {
          // yield permission_ask 事件，等待外部确认
          yield { type: 'permission_ask', tool: toolUse.name, input: toolUse.input, toolUseId: toolUse.id };

          // 如果提供了回调，使用回调确认
          if (options?.onPermissionAsk) {
            const allowed = await options.onPermissionAsk(toolUse.name, toolUse.input, toolUse.id);
            options?.logger?.audit?.('tool.user_permission_response', {
              toolUseId: toolUse.id,
              tool: toolUse.name,
              allowed,
            });
            if (!allowed) {
              messages.push({
                role: 'user',
                content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'Permission denied by user' }],
              });
              continue;
            }
          } else {
            // 无回调时默认拒绝（安全优先）
            options?.logger?.audit?.('tool.user_permission_response', {
              toolUseId: toolUse.id,
              tool: toolUse.name,
              allowed: false,
              reason: 'no handler',
            });
            messages.push({
              role: 'user',
              content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'Permission denied (no handler)' }],
            });
            continue;
          }
        }

        yield { type: 'tool_use', tool: toolUse.name, input: toolUse.input };
        options?.logger?.audit?.('tool.execution_started', {
          toolUseId: toolUse.id,
          tool: toolUse.name,
          input: toolUse.input,
        });

        let result: ToolResult;
        try {
          result = await errorRecovery.executeWithRetry(
            () => tools.execute(toolUse),
            { tool: toolUse.name, maxRetries: 1 },
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          result = { output: `Error: ${msg}`, isError: true };
          // 记录错误到 SelfImprovement
          if (options?.selfImprovement) {
            options.selfImprovement.logError(
              toolUse.name,
              JSON.stringify(toolUse.input).slice(0, 200),
              (err instanceof Error ? err.message : String(err)),
            );
          }
        }

        await hooks.postToolUse(toolUse, result);
        options?.logger?.audit?.('tool.execution_finished', {
          toolUseId: toolUse.id,
          tool: toolUse.name,
          isError: result.isError,
          outputPreview: result.output.slice(0, 500),
        });

        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: result.output, is_error: result.isError }],
        });
        yield { type: 'tool_result', tool: toolUse.name, output: result.output };
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const recovered = await errorRecovery.handleApiError(err instanceof Error ? err : new Error(errMsg), messages);
      if (!recovered) {
        options?.logger?.error(`Engine error: ${errMsg}`);
        yield { type: 'error', error: errMsg };
        return;
      }
    }
  }
}
