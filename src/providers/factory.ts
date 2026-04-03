// src/providers/factory.ts
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Provider } from './base.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenRouterProvider } from './openrouter.js';

/** Parse simple KEY=VALUE .env lines */
function parseEnvFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function getEnvVar(name: string, dataDir?: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!dataDir) return undefined;
  return parseEnvFile(join(dataDir, '.env'))[name];
}

/** Resolve model: args > config > provider default, skip empty strings */
function resolveModel(arg?: string, cfg?: string, fallback?: string): string | undefined {
  const v = arg || cfg || fallback;
  return v && v.trim() ? v.trim() : undefined;
}

export function createProvider(model?: string): Provider | null {
  const dataDir = process.env.CCLAW_DATA_DIR || join(homedir(), '.cclaw');
  const cfgPath = join(dataDir, '.cclaw.json');
  let cfg: { provider?: string; baseUrl?: string; model?: string } = {};
  if (existsSync(cfgPath)) {
    try { cfg = JSON.parse(readFileSync(cfgPath, 'utf-8')); } catch {}
  }

  const envBaseUrl = getEnvVar('API_BASE_URL', dataDir);
  const baseUrl = envBaseUrl || cfg.baseUrl;
  const effectiveModel = resolveModel(model, cfg.model);

  // 1. MiniMax provider
  if (cfg.provider === 'minimax' || baseUrl?.includes('minimaxi.com')) {
    const key = getEnvVar('ANTHROPIC_API_KEY', dataDir)
      || getEnvVar('MINIMAX_API_KEY', dataDir)
      || getEnvVar('CUSTOM_API_KEY', dataDir);
    if (key) {
      return new AnthropicProvider({
        apiKey: key,
        baseUrl: baseUrl || 'https://api.minimaxi.com/anthropic',
        model: effectiveModel || 'MiniMax-M2.7',
      });
    }
  }

  // 2. Custom provider (代理/本地部署)
  if (cfg.provider === 'custom' && baseUrl) {
    const key = getEnvVar('CUSTOM_API_KEY', dataDir)
      || getEnvVar('ANTHROPIC_API_KEY', dataDir);
    if (key) {
      return new AnthropicProvider({
        apiKey: key,
        baseUrl,
        model: effectiveModel || 'custom-model',
      });
    }
  }

  // 3. Anthropic
  const anthropicKey = getEnvVar('ANTHROPIC_API_KEY', dataDir);
  if (anthropicKey) {
    return new AnthropicProvider({ apiKey: anthropicKey, baseUrl, model: effectiveModel });
  }

  // 4. OpenRouter
  const openrouterKey = getEnvVar('OPENROUTER_API_KEY', dataDir);
  if (openrouterKey) {
    return new OpenRouterProvider({ apiKey: openrouterKey, model: effectiveModel });
  }

  return null;
}
