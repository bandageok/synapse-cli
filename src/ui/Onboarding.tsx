// src/ui/Onboarding.tsx
// Synapse Onboarding v3 — 对标 Claude Code 首次启动流程
// 步骤: Welcome → Provider/Key → Theme → Security → Terminal
// 特点: 自动检测已有配置, 多步对话框, 安全提示, 主题选择
import React, { useState, useCallback, useEffect } from 'react';
import { render, Text, Box, useInput, useApp, useStdin } from 'ink';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// --- 常量 ---

interface ProviderEntry {
  id: string;
  name: string;
  baseUrl: string;
  envKey: string;
  models: string[];
  desc: string;
}

const PROVIDERS: ProviderEntry[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    envKey: 'ANTHROPIC_API_KEY',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-35-20241022', 'claude-opus-4-20250514'],
    desc: '官方 Claude API',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    models: ['anthropic/claude-sonnet-4', 'google/gemini-2.5-pro-preview', 'openai/gpt-4o', 'minimax/minimax-m2.7'],
    desc: '多模型聚合路由',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    envKey: 'MINIMAX_API_KEY',
    models: ['MiniMax-M2.7'],
    desc: '国产大模型 (Anthropic 兼容)',
  },
  {
    id: 'custom',
    name: '自定义',
    baseUrl: '',
    envKey: 'CUSTOM_API_KEY',
    models: [],
    desc: '代理 / 本地部署',
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

type Step = 'welcome' | 'provider' | 'model' | 'apikey' | 'customUrl' | 'theme' | 'security' | 'done';

interface Config {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  theme: 'dark' | 'light';
}

// --- 工具函数 ---

function getEnvVar(name: string, dataDir: string): string | undefined {
  return process.env[name] || parseEnvFile(join(dataDir, '.env'))[name];
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
  return join(process.env.CCLAW_DATA_DIR || join(homedir(), '.cclaw'), '.cclaw.json');
}

function checkExistingConfig(): Config | null {
  try {
    const p = getCfgPath();
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf-8')) as Config;
  } catch { return null; }
}

function writeUtf8(path: string, content: string) {
  writeFileSync(path, Buffer.from(content, 'utf-8'));
}

function saveConfig(cfg: Config) {
  const dataDir = process.env.CCLAW_DATA_DIR || join(homedir(), '.cclaw');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  // .cclaw.json
  writeUtf8(join(dataDir, '.cclaw.json'), JSON.stringify({
    model: cfg.model,
    provider: cfg.provider,
    ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}),
    hasCompletedOnboarding: true,
  }, null, 2));

  // .env
  const envKey = cfg.provider === 'minimax' ? 'ANTHROPIC_API_KEY'
    : cfg.provider === 'custom' ? 'CUSTOM_API_KEY'
    : cfg.provider === 'openrouter' ? 'OPENROUTER_API_KEY'
    : 'ANTHROPIC_API_KEY';
  let env = `${envKey}=${cfg.apiKey}\n`;
  if (cfg.baseUrl && cfg.provider !== 'anthropic' && cfg.provider !== 'openrouter') {
    env += `API_BASE_URL=${cfg.baseUrl}\n`;
  }
  writeUtf8(join(dataDir, '.env'), env);

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
    React.createElement(Text, { bold: true, color: 'cyan' as const }, '  ⚡ Synapse v0.2.0'),
    React.createElement(Text, { dimColor: true }, '    Claude Code × OpenClaw  开源 CLI Agent 框架'),
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
        `  ${i === cursor ? '▸' : ' '} [${i + 1}] ${p.name.padEnd(12)} ${p.desc}${p.models.length > 0 ? ` (${p.models.length} 个模型)` : ''}`
      )
    ),
    React.createElement(Text, null, ''),
    React.createElement(Text, { color: 'gray' as const }, '  ↑↓ 选择  ·  Enter 确认  ·  Esc 退出'),
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
    React.createElement(Text, { color: 'gray' as const }, '  ↑↓ 选择  ·  Enter 确认  ·  Esc 退出'),
  );
}

function ApiKeyStep({ input, provider, baseUrl, onInput }: { input: string; provider: string; baseUrl?: string; onInput: (v: string) => void }) {
  const p = PROVIDERS.find(pr => pr.id === provider);
  return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' as const }, `  🔑 输入 ${p?.name ?? provider} API Key`),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, `  ${p?.envKey ?? 'API_KEY'}=`),
    React.createElement(Box, null,
      React.createElement(Text, { color: 'yellow' as const }, `  ${input || ''}`),
      React.createElement(Text, { color: 'yellow' as const, bold: true }, '▋'),
    ),
    baseUrl ? React.createElement(Text, { dimColor: true }, `  端点: ${baseUrl}`) : null,
    React.createElement(Text, null, ''),
    React.createElement(Text, { color: 'gray' as const }, '  粘贴后按 Enter 确认  ·  Esc 退出'),
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
    React.createElement(Text, { color: 'gray' as const }, '  Enter 确认  ·  Esc 退出'),
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
  const dataDir = process.env.CCLAW_DATA_DIR || join(homedir(), '.cclaw');
  return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
    React.createElement(Text, { bold: true, color: 'green' as const }, '  🎉 配置完成！'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, `  提供商:     ${config.provider}`),
    React.createElement(Text, null, `  模型:       ${config.model}`),
    config.baseUrl ? React.createElement(Text, null, `  端点:       ${config.baseUrl}`) : null,
    React.createElement(Text, null, `  数据目录:   ${dataDir}`),
    React.createElement(Text, null, ''),
    React.createElement(Text, { color: 'gray' as const }, '  生成的文件:'),
    React.createElement(Text, { dimColor: true }, '    .cclaw.json      主配置'),
    React.createElement(Text, { dimColor: true }, '    .env             API Key'),
    React.createElement(Text, { dimColor: true }, '    SOUL.md          Agent 人格'),
    React.createElement(Text, null, ''),
    React.createElement(Text, { color: 'cyan' as const, bold: true }, '  synapse chat    ← 开始对话'),
    React.createElement(Text, null, ''),
    React.createElement(Text, { dimColor: true }, '  按 Enter 退出并启动 chat'),
  );
}

// --- 主组件 ---

function OnboardingApp({ onDone, existing }: { onDone: (cfg: Config | null) => void; existing: Config | null }) {
  const [step, setStep] = useState<Step>(existing ? 'welcome' : 'welcome');
  const [config, setConfig] = useState<Config>({
    provider: 'anthropic',
    baseUrl: '',
    model: PROVIDERS[0].models[0],
    apiKey: '',
    theme: 'dark',
  });
  const [input, setInput] = useState('');
  const [cursor, setCursor] = useState(0);
  const { exit } = useApp();

  const steps: Step[] = ['welcome', 'provider', 'model', 'apikey', 'customUrl', 'theme', 'security', 'done'];
  const stepLabels: Record<Step, string> = {
    welcome: '欢迎', provider: '提供商', model: '模型', apikey: 'API Key',
    customUrl: '端点', theme: '主题', security: '安全', done: '完成',
  };
  const activeSteps: Step[] = ['welcome', 'provider', 'model', 'apikey', 'customUrl', 'theme', 'security', 'done'];
  const currentIdx = activeSteps.indexOf(step);

  // Provider 过滤：如果有已有配置，跳过后续
  useInput((char, key) => {
    // 全局 q/Esc 退出
    if (char === 'q' && step !== 'done') { exit(); return; }

    // Welcome
    if (step === 'welcome') {
      if (existing && (char === 's' || key.return)) { onDone(existing); return; }
      if (key.return) setStep('provider');
      return;
    }

    // Provider 选择
    if (step === 'provider') {
      if (key.upArrow) setCursor(c => (c - 1 + PROVIDERS.length) % PROVIDERS.length);
      else if (key.downArrow) setCursor(c => (c + 1) % PROVIDERS.length);
      else if (key.return) {
        const p = PROVIDERS[cursor];
        setConfig(c => ({ ...c, provider: p.id, baseUrl: p.baseUrl, model: p.models[0] || '' }));
        setCursor(0);
        if (p.id === 'custom') setStep('customUrl');
        else if (p.models.length <= 1) setStep('apikey');
        else setStep('model');
      } else if (key.escape) { exit(); }
      return;
    }

    // Custom URL
    if (step === 'customUrl') {
      if (key.escape) { exit(); return; }
      if (key.return && input.trim()) {
        setConfig(c => ({ ...c, baseUrl: input.trim() }));
        setInput(''); setStep('apikey');
      } else if (key.backspace) setInput(v => v.slice(0, -1));
      else if (char && !key.ctrl && !key.meta) setInput(v => v + char);
      return;
    }

    // Model
    if (step === 'model') {
      if (key.escape) { exit(); return; }
      const models = PROVIDERS.find(p => p.id === config.provider)?.models || PROVIDERS[0].models;
      if (key.upArrow) setCursor(c => (c - 1 + models.length) % models.length);
      else if (key.downArrow) setCursor(c => (c + 1) % models.length);
      else if (key.return) {
        setConfig(c => ({ ...c, model: models[cursor] }));
        setCursor(0); setStep('apikey');
      }
      return;
    }

    // API Key
    if (step === 'apikey') {
      if (key.escape) { exit(); return; }
      if (key.return && input.trim()) {
        saveConfig({ ...config, apiKey: input.trim() });
        setConfig(c => ({ ...c, apiKey: input.trim() }));
        setInput('');
        setStep('security');
      } else if (key.backspace) setInput(v => v.slice(0, -1));
      else if (char && !key.ctrl && !key.meta) setInput(v => v + char);
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
      case 'model': {
        const models = PROVIDERS.find(p => p.id === config.provider)?.models || [];
        return React.createElement(ModelStep, { cursor, models, onSelect: () => {} });
      }
      case 'apikey': return React.createElement(ApiKeyStep, { input, provider: config.provider, baseUrl: config.provider === 'custom' ? config.baseUrl : undefined, onInput: setInput });
      case 'security': return React.createElement(SecurityStep);
      case 'done': return React.createElement(DoneScreen, { config });
      default: return null;
    }
  };

  const stepIndicator = step !== 'welcome' && step !== 'done' ?
    React.createElement(StepIndicator, { current: currentIdx, total: activeSteps.filter(s => s !== 'welcome' && s !== 'done').length + 1, stepLabel: stepLabels[step] }) : null;

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
