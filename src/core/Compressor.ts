// src/core/Compressor.ts
import type { Message, CompressionResult, ContentBlock } from './types.js';

export interface CompressorConfig {
  contextWindow: number;
  model: string;
  provider?: any;  // 可选 Provider 用于 LLM 摘要
}

export class Compressor {
  private autoCompactThreshold: number;
  private warningThreshold: number;
  private consecutiveFailures = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private provider: any;

  constructor(config: CompressorConfig) {
    // Claude Code: contextWindow - 20_000 (reserved for summary output)
    const effectiveWindow = config.contextWindow - 20_000;
    // Claude Code: AUTOCOMPACT_BUFFER_TOKENS = 13_000
    this.autoCompactThreshold = effectiveWindow - 13_000;
    // Claude Code: WARNING_THRESHOLD_BUFFER_TOKENS = 20_000
    this.warningThreshold = this.autoCompactThreshold - 20_000;
    this.provider = config.provider;
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

      // 优先使用 LLM 摘要，回退到截断
      let summary: string;
      if (this.provider) {
        summary = await this.buildLlmSummary(stripped);
      } else {
        summary = this.buildSummary(stripped);
      }

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

  /**
   * 估算 token 数
   * 使用 cl100k_base 近似公式：
   * - 英文：~4 chars/token
   * - 中文：~1.5 chars/token
   * - 混合：加权平均
   */
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

  /**
   * 精确估算文本 token 数
   * 中文字符：~1.5 chars/token
   * 英文/数字/符号：~4 chars/token
   */
  private estimateTextTokens(text: string): number {
    let cjkCount = 0;
    let otherCount = 0;

    for (const char of text) {
      const code = char.charCodeAt(0);
      // CJK 统一汉字 + 日文假名 + 韩文
      if (
        (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
        (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Extension A
        (code >= 0x3040 && code <= 0x309F) ||   // Hiragana
        (code >= 0x30A0 && code <= 0x30FF) ||   // Katakana
        (code >= 0xAC00 && code <= 0xD7AF)      // Hangul
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

  /**
   * 使用 LLM 生成对话摘要
   */
  private async buildLlmSummary(messages: Message[]): Promise<string> {
    const transcript = messages.map(m => {
      const role = m.role;
      const content = typeof m.content === 'string'
        ? m.content.slice(0, 500)
        : m.content
            .filter(b => b.type === 'text')
            .map(b => (b as any).text)
            .join(' ')
            .slice(0, 500);
      return `${role}: ${content}`;
    }).join('\n');

    try {
      const chunks: string[] = [];
      for await (const chunk of this.provider.stream({
        system: ['You are a conversation summarizer. Summarize the key points, decisions, and context from this conversation in under 500 words. Focus on: what was discussed, what was decided, what was accomplished, and what remains to be done.'],
        messages: [{ role: 'user', content: `Summarize this conversation:\n\n${transcript}` }],
        tools: [],
      })) {
        if (chunk.type === 'content_block_delta') {
          const delta = (chunk as any).delta;
          if (delta?.type === 'text_delta') {
            chunks.push(delta.text);
          }
        }
      }
      const summary = chunks.join('').trim();
      return summary || this.buildSummary(messages);
    } catch {
      return this.buildSummary(messages);
    }
  }
}
