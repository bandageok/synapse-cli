// src/providers/factory.ts
import type { Provider } from './base.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenRouterProvider } from './openrouter.js';
import { resolveProviderRuntime } from './management.js';

export function createProvider(model?: string): Provider | null {
  const runtime = resolveProviderRuntime(model);
  if (!runtime?.apiKey) return null;

  if (runtime.protocol === 'openai') {
    return new OpenRouterProvider({
      apiKey: runtime.apiKey,
      baseUrl: runtime.baseUrl,
      model: runtime.model,
      name: runtime.id,
      auth: runtime.auth,
    });
  }
  return new AnthropicProvider({
    apiKey: runtime.apiKey,
    baseUrl: runtime.baseUrl,
    model: runtime.model,
    name: runtime.id,
    auth: runtime.auth,
  });
}
