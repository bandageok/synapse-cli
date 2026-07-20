import type { CompressionQuality, CompressionResult, Message, Provider } from './types.js';
import { isStreamChunkDelta, isTextBlock, isTextDelta } from './types.js';
import { messageText, TokenCounter, type TokenCount } from './TokenCounter.js';

export interface CompressorConfig {
  contextWindow: number;
  model: string;
  provider?: Provider;
  qualityFloor?: number;
}

export interface CompressionAccounting {
  system?: string[];
  tools?: Record<string, unknown>[];
}

export class Compressor {
  private autoCompactThreshold: number;
  private aggressiveCompactThreshold: number;
  private snipThreshold: number;
  private consecutiveFailures = 0;
  private readonly maxConsecutiveFailures = 3;
  private readonly provider?: Provider;
  private readonly tokenCounter: TokenCounter;
  private readonly qualityFloor: number;

  constructor(config: CompressorConfig) {
    const effectiveWindow = config.contextWindow - 20_000;
    this.autoCompactThreshold = effectiveWindow - 13_000;
    this.aggressiveCompactThreshold = effectiveWindow - 5_000;
    this.snipThreshold = effectiveWindow - 1_000;
    this.provider = config.provider;
    this.tokenCounter = new TokenCounter(config.model, config.provider);
    this.qualityFloor = config.qualityFloor ?? 0.72;
  }

  getThresholds() {
    return {
      autoCompactThreshold: this.autoCompactThreshold,
      aggressiveCompactThreshold: this.aggressiveCompactThreshold,
      snipThreshold: this.snipThreshold,
    };
  }

  async checkAndCompress(messages: Message[], signal?: AbortSignal, accounting: CompressionAccounting = {}): Promise<CompressionResult> {
    const approximate = this.tokenCounter.estimate(messages, accounting.system ?? [], accounting.tools ?? []);
    const firstThreshold = Math.min(this.autoCompactThreshold, this.aggressiveCompactThreshold, this.snipThreshold);
    if (approximate < firstThreshold * 0.75) return { compressed: false };
    const count = await this.tokenCounter.count(messages, accounting.system ?? [], accounting.tools ?? [], signal);
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) return { compressed: false };
    if (count.tokens >= this.snipThreshold) return this.snipOldMessages(messages, count, signal, accounting);
    if (count.tokens >= this.aggressiveCompactThreshold) return this.aggressiveCompact(messages, count, signal, accounting);
    if (count.tokens >= this.autoCompactThreshold) return this.autoCompact(messages, count, signal, accounting);
    return { compressed: false };
  }

  estimateTokens(messages: Message[]): number {
    let total = 0;
    for (const message of messages) {
      if (typeof message.content === 'string') total += this.estimateTextTokens(message.content);
      else for (const block of message.content) {
        if (block.type === 'text') total += this.estimateTextTokens(block.text);
        else if (block.type === 'tool_use') total += this.estimateTextTokens(`${block.id}${block.name}${JSON.stringify(block.input)}`);
        else if (block.type === 'tool_result') total += this.estimateTextTokens(`${block.tool_use_id}${block.content}`);
      }
    }
    return Math.round(total);
  }

  static stripImages(messages: Message[]): Message[] {
    return messages.map(message => typeof message.content === 'string'
      ? { ...message }
      : { ...message, content: message.content.filter(block => block.type !== 'image') });
  }

  private async autoCompact(messages: Message[], before: TokenCount, signal?: AbortSignal, accounting: CompressionAccounting = {}): Promise<CompressionResult> {
    try {
      const source = Compressor.stripImages(messages);
      const summary = this.provider ? await this.buildLlmSummary(source, signal) : this.buildSummary(source);
      const candidate: Message[] = [
        { role: 'user', content: `[Conversation summary]\n${summary}` },
        { role: 'assistant', content: 'Understood, continuing from summary.' },
      ];
      return this.commitCandidate(messages, source, candidate, before, signal, accounting);
    } catch {
      this.consecutiveFailures++;
      return { compressed: false };
    }
  }

  private async aggressiveCompact(messages: Message[], before: TokenCount, signal?: AbortSignal, accounting: CompressionAccounting = {}): Promise<CompressionResult> {
    try {
      const source = Compressor.stripImages(messages);
      const recent = coherentTail(source, 20);
      const older = source.slice(0, source.length - recent.length);
      const summary = older.length > 0 && this.provider ? await this.buildLlmSummary(older, signal) : this.buildSummary(older);
      const candidate: Message[] = [
        { role: 'user', content: `[Conversation history summary]\n${summary}` },
        { role: 'assistant', content: 'Understood, continuing from the summary.' },
        ...recent,
      ];
      return this.commitCandidate(messages, source, candidate, before, signal, accounting);
    } catch {
      this.consecutiveFailures++;
      return { compressed: false };
    }
  }

  private async snipOldMessages(messages: Message[], before: TokenCount, signal?: AbortSignal, accounting: CompressionAccounting = {}): Promise<CompressionResult> {
    try {
      const source = Compressor.stripImages(messages);
      const candidate = coherentTail(source, 5);
      return this.commitCandidate(messages, source, candidate, before, signal, accounting);
    } catch {
      this.consecutiveFailures++;
      return { compressed: false };
    }
  }

  private async commitCandidate(messages: Message[], source: Message[], candidate: Message[], before: TokenCount, signal?: AbortSignal, accounting: CompressionAccounting = {}): Promise<CompressionResult> {
    const quality = evaluateCompressionQuality(source, candidate);
    if (quality.score < this.qualityFloor || quality.toolCallIntegrity < 1) {
      this.consecutiveFailures++;
      return { compressed: false };
    }
    const after = await this.tokenCounter.count(candidate, accounting.system ?? [], accounting.tools ?? [], signal);
    if (after.tokens >= before.tokens) {
      this.consecutiveFailures++;
      return { compressed: false };
    }
    messages.splice(0, messages.length, ...candidate);
    this.consecutiveFailures = 0;
    return {
      compressed: true,
      stats: {
        tokensBefore: before.tokens,
        tokensAfter: after.tokens,
        tokenMethod: before.method,
        reductionRatio: 1 - after.tokens / Math.max(1, before.tokens),
        quality,
      },
    };
  }

  private estimateTextTokens(text: string): number {
    let cjk = 0;
    let other = 0;
    for (const char of text) {
      const code = char.codePointAt(0) ?? 0;
      if ((code >= 0x3400 && code <= 0x9fff) || (code >= 0x3040 && code <= 0x30ff) || (code >= 0xac00 && code <= 0xd7af)) cjk++;
      else other++;
    }
    return cjk / 1.5 + other / 4;
  }

  private buildSummary(messages: Message[]): string {
    return messages.slice(-10).map(message => `${message.role}: ${messageText(message).slice(0, 500)}`).join('\n');
  }

  private async buildLlmSummary(messages: Message[], signal?: AbortSignal): Promise<string> {
    const transcript = messages.map(message => messageText(message).slice(0, 2_000)).join('\n');
    const chunks: string[] = [];
    try {
      for await (const chunk of this.provider!.stream({
        system: ['Produce a factual continuation summary. Preserve exact paths, URLs, identifiers, decisions, constraints, failures, and remaining work.'],
        messages: [{ role: 'user', content: `Summarize this transcript:\n\n${transcript}` }],
        tools: [],
        signal,
      })) {
        if (isStreamChunkDelta(chunk) && isTextDelta(chunk.delta)) chunks.push(chunk.delta.text);
      }
      return chunks.join('').trim() || this.buildSummary(messages);
    } catch {
      return this.buildSummary(messages);
    }
  }
}

export function evaluateCompressionQuality(before: Message[], after: Message[]): CompressionQuality {
  const beforeText = before.map(messageText).join('\n');
  const afterText = after.map(messageText).join('\n');
  const facts = extractProtectedFacts(beforeText);
  const retainedFacts = facts.filter(fact => afterText.includes(fact)).length;
  const protectedFactRetention = facts.length === 0 ? 1 : retainedFacts / facts.length;
  const recent = before.slice(-Math.min(5, before.length)).map(message => signature(messageText(message)));
  const recentMessageRetention = recent.length === 0 ? 1 : recent.filter(item => afterText.includes(item)).length / recent.length;
  const toolCallIntegrity = calculateToolIntegrity(after);
  const score = protectedFactRetention * 0.55 + recentMessageRetention * 0.25 + toolCallIntegrity * 0.2;
  return { score, protectedFactRetention, recentMessageRetention, toolCallIntegrity };
}

function extractProtectedFacts(text: string): string[] {
  const patterns = [
    /https?:\/\/[^\s"'<>]+/g,
    /(?:[A-Za-z]:\\|\/)[^\s"'<>]{2,}/g,
    /\b(?:[A-Fa-f0-9]{12,}|[A-Za-z_][A-Za-z0-9_.-]*\d[A-Za-z0-9_.-]{5,})\b/g,
  ];
  const constraints = text.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length >= 8 && line.length <= 500)
    .filter(line => /\b(?:must|never|required|forbid(?:den)?|approval|do not|cannot)\b|必须|禁止|不得|不能|审批/i.test(line))
    .slice(0, 100);
  return [...new Set([...patterns.flatMap(pattern => text.match(pattern) ?? []), ...constraints])];
}

function calculateToolIntegrity(messages: Message[]): number {
  const uses = new Set<string>();
  let results = 0;
  let valid = 0;
  for (const message of messages) {
    if (typeof message.content === 'string') continue;
    for (const block of message.content) {
      if (block.type === 'tool_use') uses.add(block.id);
      if (block.type === 'tool_result') {
        results++;
        if (uses.has(block.tool_use_id)) valid++;
      }
    }
  }
  return results === 0 ? 1 : valid / results;
}

function coherentTail(messages: Message[], minimum: number): Message[] {
  let start = Math.max(0, messages.length - minimum);
  const first = messages[start];
  if (first && typeof first.content !== 'string' && first.content.some(block => block.type === 'tool_result')) {
    const ids = new Set(first.content.filter(block => block.type === 'tool_result').map(block => block.tool_use_id));
    while (start > 0) {
      start--;
      const candidate = messages[start];
      if (typeof candidate.content !== 'string' && candidate.content.some(block => block.type === 'tool_use' && ids.has(block.id))) break;
    }
  }
  return messages.slice(start);
}

function signature(value: string): string {
  return value.replace(/\s+/g, ' ').slice(0, 120);
}
