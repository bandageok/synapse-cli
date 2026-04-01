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
    // Claude Code: contextWindow - 20_000 (reserved for summary output)
    const effectiveWindow = config.contextWindow - 20_000;
    // Claude Code: AUTOCOMPACT_BUFFER_TOKENS = 13_000
    this.autoCompactThreshold = effectiveWindow - 13_000;
    // Claude Code: WARNING_THRESHOLD_BUFFER_TOKENS = 20_000
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

    // Level 1: autoCompact — approaching limit
    if (tokenUsage >= this.autoCompactThreshold) {
      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        return { compressed: false }; // circuit breaker
      }
      return this.autoCompact(messages);
    }

    // Level 2: apiMicrocompact — handled by Provider layer
    // Level 3: reactiveCompact — handled by ErrorRecovery
    // Level 4: snip — fallback after autoCompact failure

    return { compressed: false };
  }

  private async autoCompact(messages: Message[]): Promise<CompressionResult> {
    try {
      const stripped = Compressor.stripImages(messages);
      const tokensBefore = this.estimateTokens(stripped);

      const summary = this.buildSummary(stripped);

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
        block => (block as any).type !== 'image'
      );
      return { ...msg, content: filtered };
    });
  }

  estimateTokens(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += msg.content.length / 4;
      } else {
        for (const block of msg.content) {
          if (block.type === 'text') total += block.text.length / 4;
          else if (block.type === 'tool_use') total += JSON.stringify(block.input).length / 4;
          else if (block.type === 'tool_result') total += block.content.length / 4;
        }
      }
    }
    return Math.round(total);
  }

  private buildSummary(messages: Message[]): string {
    const recent = messages.slice(-10);
    return recent.map(m => {
      const role = m.role;
      const content = typeof m.content === 'string'
        ? m.content.slice(0, 200)
        : m.content
            .filter(b => b.type === 'text')
            .map(b => (b as any).text)
            .join(' ')
            .slice(0, 200);
      return `${role}: ${content}`;
    }).join('\n');
  }
}
