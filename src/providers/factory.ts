// src/providers/factory.ts
import type { Provider } from '../core/types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenRouterProvider } from './openrouter.js';

export function createProvider(model?: string): Provider | null {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (anthropicKey) {
    return new AnthropicProvider({ apiKey: anthropicKey, model });
  }

  if (openrouterKey) {
    return new OpenRouterProvider({ apiKey: openrouterKey, model });
  }

  return null;
}
