// src/providers/factory.ts
import type { Provider } from './base.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenRouterProvider } from './openrouter.js';
import { resolveProviderRuntime } from './management.js';
import type { ProviderRuntime } from './management.js';
import { FallbackProvider } from './fallback.js';

export function createProvider(model?: string): Provider | null {
  const runtime = resolveProviderRuntime(model);
  if (!runtime?.apiKey) return null;

  const providers = [runtime.model, ...(runtime.fallbackModels ?? [])]
    .map((candidate, index) => createSingleProvider(runtime, candidate, index === 0));
  return providers.length === 1 ? providers[0] : new FallbackProvider(providers);
}

function createSingleProvider(runtime: ProviderRuntime, model: string, primary: boolean): Provider {
  if (runtime.protocol === 'openai') {
    return new OpenRouterProvider({
      apiKey: runtime.apiKey!,
      baseUrl: runtime.baseUrl,
      model,
      name: primary ? runtime.id : `${runtime.id}/${model}`,
      auth: runtime.auth,
    });
  }
  return new AnthropicProvider({
    apiKey: runtime.apiKey!,
    baseUrl: runtime.baseUrl,
    model,
    name: primary ? runtime.id : `${runtime.id}/${model}`,
    auth: runtime.auth,
  });
}
