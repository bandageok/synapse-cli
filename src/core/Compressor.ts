// src/core/Compressor.ts
// 4级压缩策略 → 7级压缩策略（对标 Claude Code）
import type { Message, CompressionResult, Provider } from './types.js';
import { isTextBlock, isStreamChunkDelta, isTextDelta } from './types.js';

export interface CompressorConfig {
  contextWindow: number;
  model: string;
  provider?: Provider;
}

/**
 * 7级压缩策略（对标 Claude Code）：
 * 0. idle — 无压力
 * 1. warning — 接近阈值，提示用户
 * 2. apiMicrocompact — LLM API 微压缩
 * 3. reactiveCompact — 工具调用后压缩
 * 4. autoCompact — 自动压缩
 * 5. aggressiveCompact — 激进压缩
 * 6. snip — 最后手段：截断旧消息
 *
 * v3 之前只有 4 级（warning, microcompact, autoCompact, reactiveCompact）
 * 新增：aggressiveCompact + snip（对标 Claude Code 的 7 级防御）
 */
export class Compressor {
  private autoCompactThreshold: number;
  private aggressiveCompactThreshold: number;
  private snipThreshold: number;
  private consecutiveFailures = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private provider?: Provider;

  constructor(config: CompressorConfig) {
    // Claude Code: contextWindow - 20_000 (reserved for summary output)
    const effectiveWindow = config.contextWindow - 20_000;
    this.autoCompactThreshold = effectiveWindow - 13_000;
    this.aggressiveCompactThreshold = effectiveWindow - 5_000;
    this.snipThreshold = effectiveWindow - 1_000;
    this.provider = config.provider;
  }

  getThresholds() {
    return {
      autoCompactThreshold: this.autoCompactThreshold,
      aggressiveCompactThreshold: this.aggressiveCompactThreshold,
      snipThreshold: this.snipThreshold,
    };
  }

  async checkAndCompress(messages: Message[]): Promise<CompressionResult> {
    const tokenUsage = this.estimateTokens(messages);

    if (tokenUsage >= this.snipThreshold) {
      // Level 6: SNIP — 最后手段：截断旧消息
      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        return { compressed: false };
      }
      return this.snipOldMessages(messages);
    }

    if (tokenUsage >= this.aggressiveCompactThreshold) {
      // Level 5: AGGRESSIVE — 激进压缩：保留最近 10 轮对话
      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        return { compressed: false };
      }
      return this.aggressiveCompact(messages);
    }

    if (tokenUsage >= this.autoCompactThreshold) {
      // Level 4: AUTO — 自动压缩
      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        return { compressed: false };
      }
      return this.autoCompact(messages);
    }

    return { compressed: false };
  }

  private async autoCompact(messages: Message[]): Promise<CompressionResult> {
    try {
      const stripped = Compressor.stripImages(messages);
      const tokensBefore = this.estimateTokens(stripped);

      let summary: string;
      if (this.provider) {
        summary = await this.buildLlmSummary(stripped);
      } else {
        summary = this.buildSummary(stripped);
      }

      messages.length = 0;
      messages.push(
        { role: 'user', content: `[Conversation summary]\n${summary}` },
        { role: 'assistant', content: 'Understood, continuing from summary.' },
      );

      const tokensAfter = this.estimateTokens(messages);
      this.consecutiveFailures = 0;
      return { compressed: true, stats: { tokensBefore, tokensAfter } };
    } catch {
      this.consecutiveFailures++;
      return { compressed: false };
    }
  }

  private async aggressiveCompact(messages: Message[]): Promise<CompressionResult> {
    try {
      const stripped = Compressor.stripImages(messages);
      const tokensBefore = this.estimateTokens(stripped);

      // 保留最近 20 条消息
      const recent = stripped.slice(-20);
      let summary: string;
      const older = stripped.slice(0, -20);
      if (older.length > 0 && this.provider) {
        summary = await this.buildLlmSummary(older);
      } else {
        summary = this.buildSummary(older);
      }

      messages.length = 0;
      messages.push(
        { role: 'user', content: `[Conversation history summary]\n${summary}` },
        { role: 'assistant', content: 'Understood, continuing from the summary.' },
        ...recent,
      );

      const tokensAfter = this.estimateTokens(messages);
      this.consecutiveFailures = 0;
      return { compressed: true, stats: { tokensBefore, tokensAfter } };
    } catch {
      this.consecutiveFailures++;
      return { compressed: false };
    }
  }

  private snipOldMessages(messages: Message[]): Promise<CompressionResult> {
    try {
      const tokensBefore = this.estimateTokens(messages);
      const stripped = Compressor.stripImages(messages);

      // 保留最近 5 条消息
      const recent = stripped.slice(-5);

      messages.length = 0;
      messages.push(...recent);

      const tokensAfter = this.estimateTokens(messages);
      this.consecutiveFailures = 0;
      return Promise.resolve({ compressed: true, stats: { tokensBefore, tokensAfter } });
    } catch {
      this.consecutiveFailures++;
      return Promise.resolve({ compressed: false });
    }
  }

  static stripImages(messages: Message[]): Message[] {
    return messages.map(msg => {
      if (typeof msg.content === 'string') return msg;
      const filtered = msg.content.filter(
        block => block.type !== 'image'
      );
      return { ...msg, content: filtered };
    });
  }

  estimateTokens(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += this.estimateTextTokens(msg.content);
      } else {
        for (const block of msg.content) {
          if (block.type === 'text') total += this.estimateTextTokens(block.text);
          else if (block.type === 'tool_use') total += this.estimateTextTokens(JSON.stringify(block.input));
          else if (block.type === 'tool_result') total += this.estimateTextTokens(block.content);
        }
      }
    }
    return Math.round(total);
  }

  private estimateTextTokens(text: string): number {
    let cjkCount = 0;
    let otherCount = 0;
    for (const char of text) {
      const code = char.charCodeAt(0);
      if (
        (code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0x3040 && code <= 0x309F) ||
        (code >= 0x30A0 && code <= 0x30FF) ||
        (code >= 0xAC00 && code <= 0xD7AF)
      ) {
        cjkCount++;
      } else {
        otherCount++;
      }
    }
    return cjkCount / 1.5 + otherCount / 4;
  }

  private buildSummary(messages: Message[]): string {
    const recent = messages.slice(-10);
    return recent.map(m => {
      const content = typeof m.content === 'string'
        ? m.content.slice(0, 200)
        : m.content
            .filter(block => isTextBlock(block))
            .map(b => b.text)
            .join(' ')
            .slice(0, 200);
      return `${m.role}: ${content}`;
    }).join('\n');
  }

  private async buildLlmSummary(messages: Message[]): Promise<string> {
    const transcript = messages.map(m => {
      const content = typeof m.content === 'string'
        ? m.content.slice(0, 500)
        : m.content
            .filter(block => isTextBlock(block))
            .map(b => b.text)
            .join(' ')
            .slice(0, 500);
      return `${m.role}: ${content}`;
    }).join('\n');

    try {
      const chunks: string[] = [];
      for await (const chunk of this.provider!.stream({
        system: ['Summarize this conversation in under 300 words. Focus on: topics discussed, decisions made, tasks completed, and remaining work.'],
        messages: [{ role: 'user', content: `Summarize:\n\n${transcript}` }],
        tools: [],
      })) {
        if (isStreamChunkDelta(chunk) && isTextDelta(chunk.delta)) {
          chunks.push(chunk.delta.text);
        }
      }
      const summary = chunks.join('').trim();
      return summary || this.buildSummary(messages);
    } catch {
      return this.buildSummary(messages);
    }
  }
}
