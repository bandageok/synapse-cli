import { encodingForModel } from 'js-tiktoken';
import type { Message, Provider, StreamParams } from './types.js';

export interface TokenCount {
  tokens: number;
  method: 'provider' | 'exact' | 'estimated';
  model: string;
}

export class TokenCounter {
  constructor(private readonly model: string, private readonly provider?: Provider) {}

  async count(messages: Message[], system: string[] = [], tools: Record<string, unknown>[] = [], signal?: AbortSignal): Promise<TokenCount> {
    const params: StreamParams = { messages, system, tools, signal };
    if (this.provider?.countTokens) {
      try {
        const tokens = await this.provider.countTokens(params);
        if (Number.isInteger(tokens) && tokens >= 0) return { tokens, method: 'provider', model: this.model };
      } catch {
        // Fall through to a local tokenizer or conservative estimate.
      }
    }
    if (isKnownOpenAIModel(this.model)) {
      try {
        const encoding = encodingForModel(this.model as Parameters<typeof encodingForModel>[0]);
        let total = 3;
        for (const message of messages) total += 3 + encoding.encode(messageText(message)).length;
        total += encoding.encode(system.join('\n')).length + encoding.encode(JSON.stringify(tools)).length;
        return { tokens: total, method: 'exact', model: this.model };
      } catch {
        // Unknown aliases remain explicitly estimated.
      }
    }
    return { tokens: estimateMessages(messages, system, tools), method: 'estimated', model: this.model };
  }

  estimate(messages: Message[], system: string[] = [], tools: Record<string, unknown>[] = []): number {
    return estimateMessages(messages, system, tools);
  }
}

export function messageText(message: Message): string {
  if (typeof message.content === 'string') return `${message.role}:${message.content}`;
  return `${message.role}:${message.content.map(block => {
    if (block.type === 'text') return block.text;
    if (block.type === 'tool_use') return `${block.id}:${block.name}:${JSON.stringify(block.input)}`;
    if (block.type === 'tool_result') return `${block.tool_use_id}:${block.content}`;
    return `[image:${block.source.media_type}]`;
  }).join('\n')}`;
}

function isKnownOpenAIModel(model: string): boolean {
  return /^(gpt-(?:3\.5|4|4o|4\.1|5)|o[134](?:-|$)|text-embedding-3)/i.test(model);
}

function estimateMessages(messages: Message[], system: string[], tools: Record<string, unknown>[]): number {
  const text = [...system, ...messages.map(messageText), JSON.stringify(tools)].join('\n');
  let cjk = 0;
  let other = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if ((code >= 0x3400 && code <= 0x9fff) || (code >= 0x3040 && code <= 0x30ff) || (code >= 0xac00 && code <= 0xd7af)) cjk++;
    else other++;
  }
  return Math.ceil(cjk / 1.3 + other / 3.5 + messages.length * 4);
}
