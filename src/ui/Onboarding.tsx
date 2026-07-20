// src/ui/Onboarding.tsx
// Synapse onboarding for provider, model, and credential setup.
// 步骤: Welcome → Provider/Key → Theme → Security → Terminal
// 特点: 自动检测已有配置, 多步对话框, 安全提示, 主题选择
import React, { useState, useCallback, useEffect } from 'react';
import { render, Text, Box, useInput, useApp, useStdin } from 'ink';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { VERSION } from '../version.js';
import {
  PROVIDER_PRESETS,
  probeProvider,
  setProvider,
  type ProviderAuth,
  type ProviderProtocol,
} from '../providers/management.js';

// --- 常量 ---

interface ProviderEntry {
  id: string;
  name: string;
  baseUrl: string;
  envKey: string;
  models: string[];
  protocol: ProviderProtocol;
  auth: ProviderAuth;
  desc: string;
}

const PROVIDERS: ProviderEntry[] = [
  ...PROVIDER_PRESETS.map(preset => ({
    id: preset.id,
    name: preset.name,
    baseUrl: preset.baseUrl,
    envKey: preset.envKeys[0],
    models: [preset.defaultModel],
    protocol: preset.protocol,
    auth: preset.auth,
    desc: `${preset.protocol === 'openai' ? 'OpenAI' : 'Anthropic'} compatible`,
  })),
  {
    id: 'custom',
    name: 'Custom BaseURL',
    baseUrl: '',
    envKey: 'SYNAPSE_API_KEY',
    models: [],
    protocol: 'openai',
    auth: 'bearer',
    desc: 'Any compatible gateway or local endpoint',
  },
];

const SECURITY_TIPS = [
  { icon: '🔒', title: 'Agent 会读写你的文件', detail: 'FileWrite/FileEdit 可以在你的磁盘上修改和创建文件' },
  { icon: '🌐', title: 'Agent 会发起网络请求', detail: 'WebSearch/WebFetch 会自动联网获取信息' },
  { icon: '⚡', title: 'Agent 会执行命令', detail: 'Bash/PowerShell 可以运行任意 shell 指令' },
  { icon: '🛡️', title: '默认 ask 模式（推荐）', detail: '写操作会先征求你的同意，你可以随时拒绝' },
  { icon: '📖', title: '警惕 prompt injection', detail: '不要将 Agent 暴露给不可信的输入源' },
];

const SOUL_TEMPLATE = `# SOUL.md

## 核心准则
- 开口即行动，禁止"好问题""我很乐意帮忙"
- 结论先行，逻辑支撑，废话滚蛋
- 先自己想办法，穷尽再开口

## 行为铁律
- 未调用工具 = 未执行
- 文件操作后必须验证修改生效
- 不确定时标注置信度（HIGH/MEDIUM/LOW）

## 说话方式
简洁如匕首。一句话说完不写第二句。禁止重复。
`;

// --- 状态 ---

type Step = 'welcome' | 'provider' | 'model' | 'apikey' | 'customUrl' | 'customProtocol' | 'test' | 'security' | 'done';

export interface Config {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  apiKeyEnv: string;
  protocol: ProviderProtocol;
  auth: ProviderAuth;
  theme: 'dark' | 'light';
}

// --- 工具函数 ---

function getEnvVar(name: string, dataDir: string): string | undefined {
  return process.env[name] || parseEnvFile(join(dataDir, '.env'))[name];
}

export function providerIndexFromKey(char: string, providerCount: number): number | null {
  if (!/^[0-9]$/.test(char)) return null;
  const number = char === '0' ? 10 : Number(char);
  const index = number - 1;
  return index >= 0 && index < providerCount ? index : null;
}

export function isReconfigureKey(char: string): boolean {
  return char === ' ' || char.toLowerCase() === 'r';
}

export function maskSecret(value: string): string {
  return value ? '*'.repeat(value.length) : '';
}

function parseEnvFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function getCfgPath(): string {
  return join(process.env.SYNAPSE_DATA_DIR || join(homedir(), '.synapse'), '.synapse.json');
}

function checkExistingConfig(): Config | null {
  try {
    const p = getCfgPath();
    if (!existsSync(p)) return null;
    const dataDir = join(p, '..');
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as Partial<Config>;
    const apiKeyEnv = parsed.apiKeyEnv || 'SYNAPSE_API_KEY';
    return {
      provider: parsed.provider || 'custom',
      baseUrl: parsed.baseUrl || '',
      model: parsed.model || '',
      apiKey: getEnvVar(apiKeyEnv, dataDir) || '',
      apiKeyEnv,
      protocol: parsed.protocol || 'openai',
      auth: parsed.auth || 'bearer',
      theme: parsed.theme || 'dark',
    };
  } catch { return null; }
}

function writeUtf8(path: string, content: string) {
  writeFileSync(path, Buffer.from(content, 'utf-8'));
}

function saveConfig(cfg: Config) {
  const dataDir = process.env.SYNAPSE_DATA_DIR || join(homedir(), '.synapse');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  setProvider(cfg.provider, {
    dataDir,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
    protocol: cfg.protocol,
    auth: cfg.auth,
    apiKeyEnv: cfg.apiKeyEnv,
    apiKey: cfg.apiKey,
  });

  // SOUL.md
  if (!existsSync(join(dataDir, 'SOUL.md'))) {
    writeUtf8(join(dataDir, 'SOUL.md'), SOUL_TEMPLATE);
  }

  // 目录
  for (const d of ['memory', 'sessions', 'logs', '.learnings']) {
    const dp = join(dataDir, d);
    if (!existsSync(dp)) mkdirSync(dp, { recursive: true });
  }
}

// --- 子组件 ---

function StepIndicator({ current, total, stepLabel }: { current: number; total: number; stepLabel: string }) {
  const filled = Math.round((current / total) * 10);
  return React.createElement(Box, { flexDirection: 'column' as const },
    React.createElement(Text, null, ''),
    React.createElement(Box, null,
      React.createElement(Text, { color: 'cyan' as const }, ` ${'█'.repeat(filled)}${'░'.repeat(10 - filled)} `),
      React.createElement(Text, { dimColor: true }, ` ${current + 1}/${total}  ${stepLabel}`),
    ),
  );
}

function WelcomeStep({ existing, onNext, onSkip }: { existing: Config | null; onNext: () => void; onSkip: () => void }) {
  return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' as const }, `  ⚡ Synapse v${VERSION}`),
    React.createElement(Text, { dimColor: true }, '    Multi-provider coding agent CLI'),
    React.createElement(Text, null, ''),
    existing
      ? React.createElement(React.Fragment, null,
          React.createElement(Text, { color: 'yellow' as const }, '  ⚠ 检测到已有配置'),
          React.createElement(Text, null, `    提供商: ${existing.provider}  |  模型: ${existing.model}`),
          React.createElement(Text, null, ''),
          React.createElement(Text, null, '  [Enter] 跳过，直接使用已有配置'),
          React.createElement(Text, null, '  [Space] 重新配置'),
        )
      : React.createElement(React.Fragment, null,
          React.createElement(Text, null, '  首次配置将引导你完成：'),
          React.createElement(Text, null, '    ✅  API 提供商选择'),
          React.createElement(Text, null, '    ✅  模型选择 & Key 配置'),
          React.createElement(Text, null, '    ✅  安全须知'),
          React.createElement(Text, null, ''),
          React.createElement(Text, { color: 'gray' as const }, '  按 Enter 开始配置'),
        ),
  );
}

function ProviderStep({ cursor, providers, onSelect }: { cursor: number; providers: ProviderEntry[]; onSelect: (i: number) => void }) {
  return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' as const }, '  📡 选择 API 提供商'),
    React.createElement(Text, null, ''),
    ...providers.map((p, i) =>
      React.createElement(Text, { key: p.id, color: i === cursor ? 'cyan' as const : 'gray' as const, bold: i === cursor },
        `  ${i === cursor ? '▸' : ' '} [${i + 1}] ${p.name.padEnd(12)} ${p.desc}${p.models.length > 0 ? ` (default: ${p.models[0]})` : ''}`
      )
    ),
    React.createElement(Text, null, ''),
    React.createElement(Text, { color: 'gray' as const }, '  ↑↓ 或数字键选择  ·  Enter 确认  ·  Esc 返回'),
  );
}

function ModelStep({ cursor, models, onSelect }: { cursor: number; models: string[]; onSelect: (i: number) => void }) {
  return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' as const }, '  🤖 选择默认模型'),
    React.createElement(Text, null, ''),
    ...models.map((m, i) =>
      React.createElement(Text, { key: m, color: i === cursor ? 'cyan' as const : 'gray' as const, bold: i === cursor },
        `  ${i === cursor ? '▸ ' : '  '}${m}`
      )
    ),
    React.createElement(Text, null, ''),
    React.createElement(Text, { color: 'gray' as const }, '  ↑↓ 选择  ·  Enter 确认  ·  Esc 返回'),
  );
}

function ModelInputStep({ input, provider }: { input: string; provider: string }) {
  return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' as const }, '  🤖 设置模型 ID'),
    React.createElement(Text, null, ''),
    React.createElement(Text, { dimColor: true }, `  ${provider} 的模型 ID（可直接修改预填值）`),
    React.createElement(Box, null,
      React.createElement(Text, { color: 'gray' as const }, '  > '),
      React.createElement(Text, null, input),
      React.createElement(Text, { bold: true }, '▋'),
    ),
    React.createElement(Text, null, ''),
    React.createElement(Text, { color: 'gray' as const }, '  Enter 确认  ·  Ctrl+U 清空  ·  Esc 返回'),
  );
}

function ApiKeyStep({ input, provider, baseUrl }: { input: string; provider: string; baseUrl?: string }) {
  const p = PROVIDERS.find(pr => pr.id === provider);
  return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' as const }, `  🔑 输入 ${p?.name ?? provider} API Key`),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, `  ${p?.envKey ?? 'API_KEY'}=`),
    React.createElement(Box, null,
      React.createElement(Text, { color: 'yellow' as const }, `  ${maskSecret(input)}`),
      React.createElement(Text, { color: 'yellow' as const, bold: true }, '▋'),
    ),
    baseUrl ? React.createElement(Text, { dimColor: true }, `  端点: ${baseUrl}`) : null,
    React.createElement(Text, null, ''),
    React.createElement(Text, { color: 'gray' as const }, '  粘贴后按 Enter 测试  ·  Ctrl+U 清空  ·  Esc 返回'),
  );
}

function ConnectionTestStep({ status, error }: { status: 'testing' | 'passed' | 'failed'; error?: string }) {
  if (status === 'testing') {
    return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' as const }, '  🔌 测试 Provider 连通性'),
      React.createElement(Text, null, ''),
      React.createElement(Text, null, '  正在发送最小请求（最多 1 token）...'),
    );
  }
  if (status === 'passed') {
    return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
      React.createElement(Text, { bold: true, color: 'green' as const }, '  ✓ Provider 测试通过'),
      React.createElement(Text, null, ''),
      React.createElement(Text, null, '  Enter 继续安全确认'),
    );
  }
  return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
    React.createElement(Text, { bold: true, color: 'red' as const }, '  × Provider 测试失败'),
    React.createElement(Text, null, ''),
    React.createElement(Text, { color: 'red' as const }, `  ${error || 'Unknown provider error'}`),
    React.createElement(Text, null, ''),
    React.createElement(Text, { color: 'gray' as const }, '  R 重试  ·  S 仍然保存  ·  B 返回修改  ·  Esc 返回'),
  );
}

function CustomUrlStep({ input, onInput }: { input: string; onInput: (v: string) => void }) {
  return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' as const }, '  🔗 自定义 API 端点'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, '  请输入 base URL：'),
    React.createElement(Text, { dimColor: true }, '  例: https://api.minimaxi.com/anthropic'),
    React.createElement(Text, null, ''),
    React.createElement(Box, null,
      React.createElement(Text, { color: 'gray' as const }, '  →  '),
      React.createElement(Text, null, input || ''),
      React.createElement(Text, { bold: true }, '▋'),
    ),
    React.createElement(Text, null, ''),
    React.createElement(Text, { color: 'gray' as const }, '  Enter 确认  ·  Esc 返回'),
  );
}

function CustomProtocolStep({ cursor }: { cursor: number }) {
  const protocols = [
    { id: 'openai', label: 'OpenAI-compatible', detail: '/chat/completions + Bearer auth' },
    { id: 'anthropic', label: 'Anthropic-compatible', detail: '/v1/messages + x-api-key' },
  ];
  return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' as const }, '  Select endpoint protocol'),
    React.createElement(Text, null, ''),
    ...protocols.map((protocol, index) =>
      React.createElement(Text, {
        key: protocol.id,
        color: index === cursor ? 'cyan' as const : 'gray' as const,
        bold: index === cursor,
      }, `  ${index === cursor ? '>' : ' '} ${protocol.label.padEnd(22)} ${protocol.detail}`)
    ),
    React.createElement(Text, null, ''),
    React.createElement(Text, { color: 'gray' as const }, '  Up/Down or 1/2 select  |  Enter confirm  |  Esc back'),
  );
}

function CustomModelStep({ input }: { input: string }) {
  return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' as const }, '  Enter model id'),
    React.createElement(Text, null, ''),
    React.createElement(Text, { dimColor: true }, '  Use the exact model id accepted by your endpoint.'),
    React.createElement(Box, null,
      React.createElement(Text, { color: 'gray' as const }, '  > '),
      React.createElement(Text, null, input),
      React.createElement(Text, { bold: true }, '|'),
    ),
    React.createElement(Text, null, ''),
    React.createElement(Text, { color: 'gray' as const }, '  Enter confirm  |  Esc exit'),
  );
}

function SecurityStep(): React.ReactElement {
  return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' as const }, '  🛡️ 安全须知'),
    React.createElement(Text, null, ''),
    ...SECURITY_TIPS.map((tip, i) =>
      React.createElement(Box, { key: i, marginBottom: i < SECURITY_TIPS.length - 1 ? 0 : 0 },
        React.createElement(Text, null, `  ${tip.icon}  `),
        React.createElement(Text, { bold: true }, `${tip.title}`),
        React.createElement(Text, { dimColor: true }, ` — ${tip.detail}`),
      )
    ),
    React.createElement(Text, null, ''),
    React.createElement(Text, { bold: true, color: 'yellow' as const }, '  Agent 默认处于 ask 模式'),
    React.createElement(Text, null, '  写入操作会先征求你的同意，你可以随时拒绝'),
    React.createElement(Text, null, ''),
    React.createElement(Text, { color: 'gray' as const }, '  按 Enter 确认并继续'),
  );
}

function DoneScreen({ config }: { config: Config }): React.ReactElement {
  const dataDir = process.env.SYNAPSE_DATA_DIR || join(homedir(), '.synapse');
  return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
    React.createElement(Text, { bold: true, color: 'green' as const }, '  🎉 配置完成！'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, `  提供商:     ${config.provider}`),
    React.createElement(Text, null, `  模型:       ${config.model}`),
    config.baseUrl ? React.createElement(Text, null, `  端点:       ${config.baseUrl}`) : null,
    React.createElement(Text, null, `  数据目录:   ${dataDir}`),
    React.createElement(Text, null, ''),
    React.createElement(Text, { color: 'gray' as const }, '  生成的文件:'),
    React.createElement(Text, { dimColor: true }, '    .synapse.json      主配置'),
    React.createElement(Text, { dimColor: true }, '    .env             API Key'),
    React.createElement(Text, { dimColor: true }, '    SOUL.md          Agent 人格'),
    React.createElement(Text, null, ''),
    React.createElement(Text, { color: 'cyan' as const, bold: true }, '  synapse chat    ← 开始对话'),
    React.createElement(Text, null, ''),
    React.createElement(Text, { dimColor: true }, '  按 Enter 完成；随后运行 synapse chat'),
  );
}

// --- 主组件 ---

export function OnboardingApp({ onDone, existing }: { onDone: (cfg: Config | null) => void; existing: Config | null }) {
  const [step, setStep] = useState<Step>('welcome');
  const [config, setConfig] = useState<Config>({
    provider: existing?.provider || PROVIDERS[0].id,
    baseUrl: existing?.baseUrl || PROVIDERS[0].baseUrl,
    model: existing?.model || PROVIDERS[0].models[0],
    apiKey: existing?.apiKey || '',
    apiKeyEnv: existing?.apiKeyEnv || PROVIDERS[0].envKey,
    protocol: existing?.protocol || PROVIDERS[0].protocol,
    auth: existing?.auth || PROVIDERS[0].auth,
    theme: existing?.theme || 'dark',
  });
  const [input, setInput] = useState('');
  const [cursor, setCursor] = useState(0);
  const [testStatus, setTestStatus] = useState<'testing' | 'passed' | 'failed'>('testing');
  const [testError, setTestError] = useState('');
  const [testAttempt, setTestAttempt] = useState(0);
  const { exit } = useApp();

  const stepLabels: Record<Step, string> = {
    welcome: '欢迎', provider: '提供商', model: '模型', apikey: 'API Key',
    customUrl: '端点', customProtocol: '协议', test: '连接测试',
    security: '安全', done: '完成',
  };
  const activeSteps: Step[] = config.provider === 'custom'
    ? ['welcome', 'provider', 'customUrl', 'customProtocol', 'model', 'apikey', 'test', 'security', 'done']
    : ['welcome', 'provider', 'model', 'apikey', 'test', 'security', 'done'];
  const currentIdx = activeSteps.indexOf(step);

  const chooseProvider = (index: number) => {
    const p = PROVIDERS[index];
    if (!p) return;
    setCursor(0);
    setConfig(current => ({
      ...current,
      provider: p.id,
      baseUrl: p.baseUrl,
      model: p.models[0] || '',
      apiKey: '',
      apiKeyEnv: p.envKey,
      protocol: p.protocol,
      auth: p.auth,
    }));
    setInput(p.id === 'custom' ? '' : p.models[0] || '');
    setStep(p.id === 'custom' ? 'customUrl' : 'model');
  };

  const goBack = () => {
    if (step === 'welcome') { exit(); return; }
    if (step === 'provider') { setStep('welcome'); return; }
    if (step === 'customUrl') { setStep('provider'); return; }
    if (step === 'customProtocol') { setInput(config.baseUrl); setStep('customUrl'); return; }
    if (step === 'model') {
      setInput('');
      setStep(config.provider === 'custom' ? 'customProtocol' : 'provider');
      return;
    }
    if (step === 'apikey' || step === 'test') {
      setInput(config.model);
      setStep('model');
      return;
    }
    if (step === 'security') setStep('test');
  };

  useEffect(() => {
    if (step !== 'test') return;
    let active = true;
    setTestStatus('testing');
    setTestError('');
    const provider = PROVIDERS.find(item => item.id === config.provider);
    probeProvider({
      id: config.provider,
      name: provider?.name || config.provider,
      protocol: config.protocol,
      auth: config.auth,
      apiKey: config.apiKey,
      keySource: 'file',
      keyName: config.apiKeyEnv,
      model: config.model,
      baseUrl: config.baseUrl,
      preset: config.provider !== 'custom',
    }).then(() => {
      if (!active) return;
      saveConfig(config);
      setTestStatus('passed');
    }).catch(error => {
      if (!active) return;
      setTestStatus('failed');
      setTestError(error instanceof Error ? error.message : String(error));
    });
    return () => { active = false; };
  }, [step, testAttempt]);

  useInput((char, key) => {
    if (key.ctrl && char === 'c') { exit(); return; }
    if (key.escape) { goBack(); return; }

    // Welcome
    if (step === 'welcome') {
      if (existing && key.return) { onDone(existing); return; }
      if (existing && isReconfigureKey(char)) {
        setCursor(Math.max(0, PROVIDERS.findIndex(provider => provider.id === existing.provider)));
        setStep('provider');
        return;
      }
      if (key.return) setStep('provider');
      return;
    }

    // Provider 选择
    if (step === 'provider') {
      if (key.upArrow) setCursor(c => (c - 1 + PROVIDERS.length) % PROVIDERS.length);
      else if (key.downArrow) setCursor(c => (c + 1) % PROVIDERS.length);
      else if (key.return) chooseProvider(cursor);
      else {
        const directIndex = providerIndexFromKey(char, PROVIDERS.length);
        if (directIndex !== null) chooseProvider(directIndex);
      }
      return;
    }

    // Custom URL
    if (step === 'customUrl') {
      if (key.return && input.trim()) {
        setConfig(c => ({ ...c, baseUrl: input.trim() }));
        setInput(''); setCursor(0); setStep('customProtocol');
      } else if (key.backspace) setInput(v => v.slice(0, -1));
      else if (char && !key.ctrl && !key.meta) setInput(v => v + char);
      return;
    }

    if (step === 'customProtocol') {
      if (char === '1' || char === '2') setCursor(Number(char) - 1);
      else if (key.upArrow || key.downArrow) setCursor(value => value === 0 ? 1 : 0);
      else if (key.return) {
        const protocol: ProviderProtocol = cursor === 0 ? 'openai' : 'anthropic';
        setConfig(c => ({
          ...c,
          protocol,
          auth: protocol === 'openai' ? 'bearer' : 'x-api-key',
        }));
        setCursor(0); setInput(''); setStep('model');
      }
      return;
    }

    // Model
    if (step === 'model') {
      if (key.ctrl && char === 'u') setInput('');
      else if (key.return && input.trim()) {
        setConfig(c => ({ ...c, model: input.trim() }));
        setInput('');
        setStep('apikey');
      } else if (key.backspace) setInput(value => value.slice(0, -1));
      else if (char && !key.ctrl && !key.meta) setInput(value => value + char);
      return;
    }

    // API Key
    if (step === 'apikey') {
      if (key.ctrl && char === 'u') setInput('');
      else if (key.return && input.trim()) {
        setConfig(c => ({ ...c, apiKey: input.trim() }));
        setInput('');
        setStep('test');
      } else if (key.backspace) setInput(v => v.slice(0, -1));
      else if (char && !key.ctrl && !key.meta) setInput(v => v + char);
      return;
    }

    if (step === 'test') {
      if (testStatus === 'testing') return;
      if (testStatus === 'passed' && key.return) { setStep('security'); return; }
      if (testStatus === 'failed') {
        if (char.toLowerCase() === 'r') setTestAttempt(value => value + 1);
        else if (char.toLowerCase() === 's') { saveConfig(config); setStep('security'); }
        else if (char.toLowerCase() === 'b') { setInput(config.apiKey); setStep('apikey'); }
      }
      return;
    }

    // Security
    if (step === 'security') {
      if (key.return) setStep('done');
      return;
    }

    // Done
    if (step === 'done') {
      if (key.return) { onDone(config); }
      return;
    }
  });

  const renderStepContent = () => {
    switch (step) {
      case 'welcome': return React.createElement(WelcomeStep, { existing, onNext: () => setStep('provider'), onSkip: () => onDone(existing) });
      case 'provider': return React.createElement(ProviderStep, { cursor, providers: PROVIDERS, onSelect: () => {} });
      case 'customUrl': return React.createElement(CustomUrlStep, { input, onInput: setInput });
      case 'customProtocol': return React.createElement(CustomProtocolStep, { cursor });
      case 'model': return React.createElement(ModelInputStep, { input, provider: config.provider });
      case 'apikey': return React.createElement(ApiKeyStep, { input, provider: config.provider, baseUrl: config.baseUrl });
      case 'test': return React.createElement(ConnectionTestStep, { status: testStatus, error: testError });
      case 'security': return React.createElement(SecurityStep);
      case 'done': return React.createElement(DoneScreen, { config });
      default: return null;
    }
  };

  const stepIndicator = step !== 'welcome' && step !== 'done' ?
    React.createElement(StepIndicator, {
      current: Math.max(0, currentIdx - 1),
      total: activeSteps.length - 2,
      stepLabel: stepLabels[step],
    }) : null;

  return React.createElement(Box, { flexDirection: 'column' as const },
    stepIndicator,
    renderStepContent(),
  );
}

// --- 导出 ---

export async function launchOnboarding(): Promise<Config | null> {
  return new Promise((resolve) => {
    const existing = checkExistingConfig();
    function Root() {
      const { exit } = useApp();
      const handleDone = useCallback((cfg: Config | null) => {
        exit();
        resolve(cfg);
      }, []);

      return React.createElement(OnboardingApp, { onDone: handleDone, existing });
    }

    const { waitUntilExit } = render(React.createElement(Root), {
      exitOnCtrlC: false,
    });
    waitUntilExit().catch(() => resolve(null));
  });
}
