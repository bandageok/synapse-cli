import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { homedir } from 'os';
import { basename, dirname, join } from 'path';

export type ProviderProtocol = 'openai' | 'anthropic';
export type ProviderAuth = 'bearer' | 'x-api-key';

export interface ProviderPreset {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  auth: ProviderAuth;
  baseUrl: string;
  defaultModel: string;
  envKeys: string[];
}

export interface SynapseConfig extends Record<string, unknown> {
  provider?: string;
  providerName?: string;
  protocol?: ProviderProtocol;
  auth?: ProviderAuth;
  apiKeyEnv?: string;
  model?: string;
  baseUrl?: string;
  hasCompletedOnboarding?: boolean;
}

export interface ProviderRuntime {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  auth: ProviderAuth;
  apiKey?: string;
  keySource: 'environment' | 'file' | 'none';
  keyName: string;
  model: string;
  baseUrl: string;
  preset: boolean;
}

export interface ProviderListEntry extends Omit<ProviderRuntime, 'apiKey'> {
  active: boolean;
  configured: boolean;
}

export interface ProviderTestResult {
  provider: string;
  protocol: ProviderProtocol;
  model: string;
  endpoint: string;
  latencyMs: number;
  ok: true;
}

// Presets are convenience data only. Any provider name and compatible BaseURL can be configured.
export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'anthropic', name: 'Anthropic', protocol: 'anthropic', auth: 'x-api-key',
    baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-4-20250514',
    envKeys: ['ANTHROPIC_API_KEY'],
  },
  {
    id: 'openai', name: 'OpenAI', protocol: 'openai', auth: 'bearer',
    baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4.1',
    envKeys: ['OPENAI_API_KEY'],
  },
  {
    id: 'openrouter', name: 'OpenRouter', protocol: 'openai', auth: 'bearer',
    baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'anthropic/claude-sonnet-4',
    envKeys: ['OPENROUTER_API_KEY'],
  },
  {
    id: 'deepseek', name: 'DeepSeek', protocol: 'openai', auth: 'bearer',
    baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat',
    envKeys: ['DEEPSEEK_API_KEY'],
  },
  {
    id: 'google', name: 'Google Gemini', protocol: 'openai', auth: 'bearer',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', defaultModel: 'gemini-2.5-flash',
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  },
  {
    id: 'groq', name: 'Groq', protocol: 'openai', auth: 'bearer',
    baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile',
    envKeys: ['GROQ_API_KEY'],
  },
  {
    id: 'mistral', name: 'Mistral AI', protocol: 'openai', auth: 'bearer',
    baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-small-latest',
    envKeys: ['MISTRAL_API_KEY'],
  },
  {
    id: 'xai', name: 'xAI', protocol: 'openai', auth: 'bearer',
    baseUrl: 'https://api.x.ai/v1', defaultModel: 'grok-3-mini',
    envKeys: ['XAI_API_KEY'],
  },
  {
    id: 'together', name: 'Together AI', protocol: 'openai', auth: 'bearer',
    baseUrl: 'https://api.together.xyz/v1', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    envKeys: ['TOGETHER_API_KEY'],
  },
  {
    id: 'moonshot', name: 'Moonshot AI', protocol: 'openai', auth: 'bearer',
    baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k',
    envKeys: ['MOONSHOT_API_KEY'],
  },
  {
    id: 'siliconflow', name: 'SiliconFlow', protocol: 'openai', auth: 'bearer',
    baseUrl: 'https://api.siliconflow.cn/v1', defaultModel: 'deepseek-ai/DeepSeek-V3',
    envKeys: ['SILICONFLOW_API_KEY'],
  },
  {
    id: 'minimax', name: 'MiniMax', protocol: 'anthropic', auth: 'bearer',
    baseUrl: 'https://api.minimaxi.com/anthropic', defaultModel: 'MiniMax-M2.7',
    envKeys: ['MINIMAX_API_KEY'],
  },
] as const;

export function getSynapseDataDir(): string {
  return process.env.SYNAPSE_DATA_DIR || join(homedir(), '.synapse');
}

export function readSynapseConfig(dataDir = getSynapseDataDir()): SynapseConfig {
  const configPath = join(dataDir, '.synapse.json');
  if (!existsSync(configPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('configuration root must be a JSON object');
    }
    return parsed as SynapseConfig;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${configPath}: ${message}`);
  }
}

export function parseEnvFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(path)) return env;
  for (const rawLine of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, '');
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function presetFor(id: string | undefined): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find(preset => preset.id.toLowerCase() === id?.toLowerCase());
}

function validProtocol(value: unknown): value is ProviderProtocol {
  return value === 'openai' || value === 'anthropic';
}

function validAuth(value: unknown): value is ProviderAuth {
  return value === 'bearer' || value === 'x-api-key';
}

function normalizeUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid provider URL: ${trimmed}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Provider URL must use http or https: ${trimmed}`);
  }
  return trimmed.replace(/\/+$/, '');
}

function keyFor(
  names: string[],
  dataDir: string,
): { value?: string; source: ProviderRuntime['keySource']; name: string } {
  const fileEnv = parseEnvFile(join(dataDir, '.env'));
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return { value, source: 'environment', name };
  }
  for (const name of names) {
    const value = fileEnv[name]?.trim();
    if (value) return { value, source: 'file', name };
  }
  return { source: 'none', name: names[0] };
}

function runtimeFromConfig(config: SynapseConfig, dataDir: string): ProviderRuntime | null {
  let providerId = typeof config.provider === 'string' ? config.provider.trim() : '';
  if (!providerId) return null;
  const legacyMiniMax = providerId === 'custom'
    && typeof config.baseUrl === 'string'
    && config.baseUrl.includes('minimaxi.com');
  if (legacyMiniMax) providerId = 'minimax';
  const preset = presetFor(providerId);
  const protocol = validProtocol(config.protocol)
    ? config.protocol
    : preset?.protocol ?? (typeof config.baseUrl === 'string' ? 'anthropic' : undefined);
  const auth = validAuth(config.auth) ? config.auth : preset?.auth ?? (protocol === 'anthropic' ? 'x-api-key' : 'bearer');
  const baseUrl = normalizeUrl(typeof config.baseUrl === 'string' ? config.baseUrl : preset?.baseUrl);
  const model = typeof config.model === 'string' && config.model.trim()
    ? config.model.trim()
    : preset?.defaultModel;
  if (!protocol || !baseUrl || !model) return null;
  const configuredEnv = typeof config.apiKeyEnv === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(config.apiKeyEnv)
    ? config.apiKeyEnv
    : undefined;
  const keyNames = [...new Set([
    ...(configuredEnv ? [configuredEnv] : []),
    ...(preset?.envKeys ?? []),
    'SYNAPSE_API_KEY',
    ...(providerId === 'minimax' ? ['ANTHROPIC_API_KEY'] : []),
  ])];
  const key = keyFor(keyNames, dataDir);
  return {
    id: providerId,
    name: typeof config.providerName === 'string' && config.providerName.trim()
      ? config.providerName.trim()
      : preset?.name ?? providerId,
    protocol,
    auth,
    apiKey: key.value,
    keySource: key.source,
    keyName: key.name,
    model,
    baseUrl,
    preset: Boolean(preset),
  };
}

function runtimeFromPreset(preset: ProviderPreset, dataDir: string): ProviderRuntime {
  const key = keyFor(preset.envKeys, dataDir);
  return {
    id: preset.id,
    name: preset.name,
    protocol: preset.protocol,
    auth: preset.auth,
    apiKey: key.value,
    keySource: key.source,
    keyName: key.name,
    model: preset.defaultModel,
    baseUrl: preset.baseUrl,
    preset: true,
  };
}

export function resolveProviderRuntime(
  modelOverride?: string,
  dataDir = getSynapseDataDir(),
): ProviderRuntime | null {
  const config = readSynapseConfig(dataDir);
  const configured = runtimeFromConfig(config, dataDir);
  if (configured) {
    if (modelOverride?.trim()) configured.model = modelOverride.trim();
    return configured;
  }

  for (const preset of PROVIDER_PRESETS) {
    const runtime = runtimeFromPreset(preset, dataDir);
    if (runtime.apiKey) {
      if (modelOverride?.trim()) runtime.model = modelOverride.trim();
      return runtime;
    }
  }
  return null;
}

export function listProviders(dataDir = getSynapseDataDir()): ProviderListEntry[] {
  const active = resolveProviderRuntime(undefined, dataDir);
  const config = readSynapseConfig(dataDir);
  const entries = PROVIDER_PRESETS.map(preset => {
    const runtime = config.provider?.toLowerCase() === preset.id
      ? runtimeFromConfig(config, dataDir) ?? runtimeFromPreset(preset, dataDir)
      : runtimeFromPreset(preset, dataDir);
    const { apiKey, ...publicRuntime } = runtime;
    return {
      ...publicRuntime,
      active: active?.id.toLowerCase() === preset.id,
      configured: Boolean(apiKey),
    };
  });
  if (active && !presetFor(active.id)) {
    const { apiKey, ...publicRuntime } = active;
    entries.unshift({ ...publicRuntime, active: true, configured: Boolean(apiKey) });
  }
  return entries;
}

function atomicWrite(path: string, content: string): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const temporary = join(dir, `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(temporary, content, { encoding: 'utf-8', mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function updateEnvValue(path: string, key: string, value: string): void {
  if (/\r|\n/.test(value)) throw new Error('API key must not contain newlines.');
  const lines = existsSync(path) ? readFileSync(path, 'utf-8').split(/\r?\n/) : [];
  let replaced = false;
  const updated = lines
    .filter((line, index) => index < lines.length - 1 || line.length > 0)
    .map(line => {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (match?.[1] !== key) return line;
      if (replaced) return null;
      replaced = true;
      return `${key}=${value}`;
    })
    .filter((line): line is string => line !== null);
  if (!replaced) updated.push(`${key}=${value}`);
  atomicWrite(path, updated.join('\n') + '\n');
}

export function setProvider(
  provider: string,
  options: {
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    apiKeyEnv?: string;
    protocol?: string;
    auth?: string;
    dataDir?: string;
  } = {},
): ProviderRuntime {
  const providerId = provider.trim();
  if (!providerId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(providerId)) {
    throw new Error('Provider name must use letters, numbers, dot, underscore, or hyphen.');
  }
  const dataDir = options.dataDir || getSynapseDataDir();
  const preset = presetFor(providerId);
  const current = readSynapseConfig(dataDir);
  const sameProvider = current.provider?.toLowerCase() === providerId.toLowerCase();
  const protocol = options.protocol ?? (sameProvider ? current.protocol : undefined) ?? preset?.protocol ?? 'openai';
  if (!validProtocol(protocol)) throw new Error('Protocol must be openai or anthropic.');
  const auth = options.auth ?? (sameProvider ? current.auth : undefined) ?? preset?.auth ?? (protocol === 'anthropic' ? 'x-api-key' : 'bearer');
  if (!validAuth(auth)) throw new Error('Auth must be bearer or x-api-key.');
  const baseUrl = normalizeUrl(
    options.baseUrl
    || (sameProvider && typeof current.baseUrl === 'string' ? current.baseUrl : undefined)
    || preset?.baseUrl,
  );
  if (!baseUrl) throw new Error('A custom provider requires --base-url <url>.');
  const model = options.model?.trim()
    || (sameProvider && typeof current.model === 'string' ? current.model.trim() : '')
    || preset?.defaultModel;
  if (!model) throw new Error('A custom provider requires --model <model>.');
  const apiKeyEnv = options.apiKeyEnv?.trim()
    || (sameProvider && typeof current.apiKeyEnv === 'string' ? current.apiKeyEnv : '')
    || preset?.envKeys[0]
    || 'SYNAPSE_API_KEY';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) {
    throw new Error('API key environment variable must be a valid environment variable name.');
  }

  const next: SynapseConfig = {
    ...current,
    provider: preset?.id ?? providerId,
    providerName: preset?.name ?? providerId,
    protocol,
    auth,
    apiKeyEnv,
    model,
    baseUrl,
    hasCompletedOnboarding: true,
  };
  atomicWrite(join(dataDir, '.synapse.json'), JSON.stringify(next, null, 2) + '\n');
  if (options.apiKey !== undefined) {
    const apiKey = options.apiKey.trim();
    if (!apiKey) throw new Error('API key must not be empty.');
    updateEnvValue(join(dataDir, '.env'), apiKeyEnv, apiKey);
  }
  return resolveProviderRuntime(undefined, dataDir)!;
}

export async function testProvider(
  options: { provider?: string; timeoutMs?: number; dataDir?: string } = {},
): Promise<ProviderTestResult> {
  const dataDir = options.dataDir || getSynapseDataDir();
  const config = readSynapseConfig(dataDir);
  const active = runtimeFromConfig(config, dataDir);
  const requestedPreset = options.provider ? presetFor(options.provider) : undefined;
  const runtime = options.provider
    ? active?.id.toLowerCase() === options.provider.toLowerCase()
      ? active
      : requestedPreset ? runtimeFromPreset(requestedPreset, dataDir) : null
    : active ?? resolveProviderRuntime(undefined, dataDir);
  if (!runtime) {
    throw new Error(options.provider
      ? `Provider "${options.provider}" is not a preset or the active custom provider.`
      : 'No provider is configured. Run `synapse provider set <provider>` first.');
  }
  if (!runtime.apiKey) {
    throw new Error(`${runtime.name} is missing ${runtime.keyName}. Use --api-key or set it in the environment.`);
  }
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
    throw new Error('Timeout must be an integer between 100 and 120000 milliseconds.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  const endpoint = `${runtime.baseUrl}${runtime.protocol === 'openai' ? '/chat/completions' : '/v1/messages'}`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (runtime.auth === 'bearer') headers.authorization = `Bearer ${runtime.apiKey}`;
  else {
    headers['x-api-key'] = runtime.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  }
  const body = runtime.protocol === 'openai'
    ? { model: runtime.model, max_tokens: 1, stream: false, messages: [{ role: 'user', content: 'Reply OK' }] }
    : { model: runtime.model, max_tokens: 1, messages: [{ role: 'user', content: 'Reply OK' }] };

  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal,
    });
    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 500);
      throw new Error(`${runtime.name} test failed: HTTP ${response.status}${detail ? ` - ${detail}` : ''}`);
    }
    return {
      provider: runtime.id,
      protocol: runtime.protocol,
      model: runtime.model,
      endpoint,
      latencyMs: Date.now() - startedAt,
      ok: true,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${runtime.name} test timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
