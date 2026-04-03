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

function getEnvVar(name: string, dataDir: string): string | undefined {
  return process.env[name] || parseEnvFile(join(dataDir, '.env'))[name];
}

export function createProvider(model?: string): Provider | null {
  // 1. 读取 .cclaw.json 获取提供商和 baseUrl
  const dataDir = process.env.CCLAW_DATA_DIR || join(homedir(), '.cclaw');
  const cfgPath = join(dataDir, '.cclaw.json');
  let cfg: { provider?: string; baseUrl?: string; model?: string } = {};
  if (existsSync(cfgPath)) {
    try { cfg = JSON.parse(readFileSync(cfgPath, 'utf-8')); } catch {}
  }

  const envBaseUrl = getEnvVar('API_BASE_URL', dataDir);
  const baseUrl = envBaseUrl || cfg.baseUrl;

  // 2. MiniMax provider（复用 Anthropic SDK，自定义端点）
  if (cfg.provider === 'minimax') {
    const key = getEnvVar('ANTHROPIC_API_KEY', dataDir) || getEnvVar('MINIMAX_API_KEY', dataDir);
    if (key) {
      return new AnthropicProvider({
        apiKey: key,
        baseUrl: baseUrl || 'https://api.minimaxi.com/anthropic',
        model: model || cfg.model || 'MiniMax-M2.7',
      });
    }
  }

  // 3. 自定义提供商（代理/本地部署）
  if (cfg.provider === 'custom' && baseUrl) {
    const key = getEnvVar('CUSTOM_API_KEY', dataDir) || getEnvVar('ANTHROPIC_API_KEY', dataDir);
    if (key) {
      return new AnthropicProvider({
        apiKey: key,
        baseUrl,
        model: model || cfg.model || 'custom-model',
      });
    }
  }

  // 4. Anthropic
  const anthropicKey = getEnvVar('ANTHROPIC_API_KEY', dataDir);
  if (anthropicKey) {
    return new AnthropicProvider({ apiKey: anthropicKey, baseUrl, model });
  }

  // 5. OpenRouter
  const openrouterKey = getEnvVar('OPENROUTER_API_KEY', dataDir);
  if (openrouterKey) {
    return new OpenRouterProvider({ apiKey: openrouterKey, model });
  }

  return null;
}
