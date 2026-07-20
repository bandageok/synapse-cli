import type { Provider } from './base.js';
import type { StreamChunk, StreamParams } from '../core/types.js';

export class FallbackProvider implements Provider {
  readonly name: string;

  constructor(private readonly providers: Provider[]) {
    if (providers.length < 2) throw new Error('FallbackProvider requires at least two providers.');
    this.name = providers[0].name;
  }

  async *stream(params: StreamParams): AsyncIterable<StreamChunk> {
    const failures: string[] = [];
    for (const [index, provider] of this.providers.entries()) {
      let emitted = false;
      try {
        for await (const chunk of provider.stream(params)) {
          emitted = true;
          yield chunk;
        }
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${provider.name}: ${message}`);
        const isLast = index === this.providers.length - 1;
        if (emitted || isLast || !isFallbackEligible(message)) {
          throw new Error(`Provider chain failed: ${failures.join(' | ')}`);
        }
      }
    }
  }

  async countTokens(params: StreamParams): Promise<number> {
    const provider = this.providers.find(item => item.countTokens);
    if (!provider?.countTokens) throw new Error('No provider in the fallback chain supports token counting.');
    return provider.countTokens(params);
  }
}

function isFallbackEligible(message: string): boolean {
  const normalized = message.toLowerCase();
  if (/\b(400|401|403)\b/.test(normalized)) return false;
  if (normalized.includes('unauthorized') || normalized.includes('forbidden') || normalized.includes('invalid_request')) return false;
  return true;
}
