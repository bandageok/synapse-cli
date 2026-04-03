// src/ui/Onboarding.tsx
// C.C.Claw Onboarding v2 — 开源产品级首次配置向导
// 对标 Claude Code + OpenClaw，新增：Provider 扩展、baseUrl 自定义、Key 测试跳过、进度条
import React, { useState, useCallback } from 'react';
import { render, Text, Box, useInput, useApp } from 'ink';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// --- 数据模型 ---

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
    models: ['anthropic/claude-sonnet-4', 'google/gemini-2.5-pro-preview', 'openai/gpt-4o', 'deepseek/deepseek-chat-v3-0324', 'minimax/minimax-m2.7'],
    desc: '多模型聚合路由',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    envKey: 'MINIMAX_API_KEY',
    models: ['MiniMax-M2.7'],
    desc: 'MiniMax 官方 Anthropic 兼容端点',
  },
  {
    id: 'custom',
    name: '自定义',
    baseUrl: '',
    envKey: 'CUSTOM_API_KEY',
    models: ['custom-model'],
    desc: '自定义 base URL（代理/本地模型）',
  },
];

interface OnboardingConfig {
  apiKey: string;
  provider: string;
  baseUrl: string;
  model: string;
  soulContent: string;
  allowedTools: string[];
  askTools: string[];
  deniedTools: string[];
  dataDir: string;
}

type Step = 'welcome' | 'provider' | 'customUrl' | 'apikey' | 'model' | 'soul' | 'tools' | 'confirm' | 'done';

const STEP_LABELS: Step[] = ['welcome', 'provider', 'customUrl', 'apikey', 'model', 'soul', 'tools', 'confirm', 'done'];

const TOOL_LIST = [
  { name: 'Bash', desc: 'Shell 命令', perm: 'ask' as const },
  { name: 'PowerShell', desc: 'PowerShell 命令', perm: 'ask' as const },
  { name: 'FileRead', desc: '读取文件', perm: 'allow' as const },
  { name: 'FileEdit', desc: '编辑文件', perm: 'ask' as const },
  { name: 'FileWrite', desc: '写入文件', perm: 'ask' as const },
  { name: 'Glob', desc: '文件搜索', perm: 'allow' as const },
  { name: 'Grep', desc: '内容搜索', perm: 'allow' as const },
  { name: 'WebSearch', desc: '网络搜索', perm: 'allow' as const },
  { name: 'WebFetch', desc: '网页抓取', perm: 'allow' as const },
  { name: 'Task', desc: '子代理', perm: 'allow' as const },
  { name: 'GitStatus', desc: 'Git 状态', perm: 'allow' as const },
  { name: 'GitDiff', desc: 'Git 差异', perm: 'allow' as const },
  { name: 'GitCommit', desc: 'Git 提交', perm: 'ask' as const },
  { name: 'TodoWrite', desc: '任务管理', perm: 'allow' as const },
  { name: 'Notebook', desc: '笔记管理', perm: 'allow' as const },
  { name: 'Skill', desc: '技能加载', perm: 'allow' as const },
  { name: 'TTS', desc: '文字转语音', perm: 'allow' as const },
  { name: 'Image', desc: '图片读取', perm: 'allow' as const },
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

// --- 主组件 ---

function getExistingConfig(): Partial<OnboardingConfig> | null {
  try {
    const dataDir = process.env.CCLAW_DATA_DIR || join(homedir(), '.cclaw');
    const cfgPath = join(dataDir, '.cclaw.json');
    if (existsSync(cfgPath)) {
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
      return { ...cfg, dataDir };
    }
  } catch { /* ignore */ }
  return null;
}

export function launchOnboarding() {
  function OnboardingApp() {
    const existing = getExistingConfig();
    const [step, setStep] = useState<Step>(existing ? 'welcome' : 'welcome');
    const [config, setConfig] = useState<OnboardingConfig>({
      apiKey: '',
      provider: 'anthropic',
      baseUrl: PROVIDERS[0].baseUrl,
      model: PROVIDERS[0].models[0],
      soulContent: SOUL_TEMPLATE,
      allowedTools: TOOL_LIST.filter(t => t.perm === 'allow').map(t => t.name),
      askTools: TOOL_LIST.filter(t => t.perm === 'ask').map(t => t.name),
      deniedTools: [],
      dataDir: process.env.CCLAW_DATA_DIR || join(homedir(), '.cclaw'),
    });
    const [input, setInput] = useState('');
    const [cursor, setCursor] = useState(0);
    const [toolCursor, setToolCursor] = useState(0);
    const { exit } = useApp();

    // 如果有已有配置，提示跳过或修改
    const hasExisting = !!existing;

    const progressIndex = STEP_LABELS.indexOf(step);
    const progressSteps: Step[] = ['welcome', 'provider', 'customUrl', 'apikey', 'model', 'soul', 'tools', 'confirm'];
    const currentProgress = progressSteps.indexOf(step as Step);

    // --- 保存 ---
    const saveConfig = useCallback(() => {
      const dataDir = config.dataDir;
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

      // .env 文件（提示用户设置环境变量）
      const envFile = join(dataDir, '.env');
      const envLine = `${config.provider === 'minimax' ? 'ANTHROPIC_API_KEY' : (config.provider === 'custom' ? 'CUSTOM_API_KEY' : (config.provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'ANTHROPIC_API_KEY'))}=${config.apiKey}\n`;
      if (config.baseUrl && config.provider !== 'anthropic' && config.provider !== 'openrouter') {
        writeFileSync(envFile, envLine + `API_BASE_URL=${config.baseUrl}\n`);
      } else {
        writeFileSync(envFile, envLine);
      }

      // SOUL.md
      writeFileSync(join(dataDir, 'SOUL.md'), config.soulContent);

      // 权限配置
      writeFileSync(join(dataDir, 'permissions.json'), JSON.stringify({
        allowedTools: config.allowedTools,
        askTools: config.askTools,
        deniedTools: config.deniedTools,
      }, null, 2));

      // 模型配置
      writeFileSync(join(dataDir, '.cclaw.json'), JSON.stringify({
        model: config.model,
        provider: config.provider,
        ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      }, null, 2));

      // 必要目录
      for (const dir of ['memory', 'sessions', 'logs', '.learnings']) {
        const p = join(dataDir, dir);
        if (!existsSync(p)) mkdirSync(p, { recursive: true });
      }
    }, [config]);

    // --- 输入处理 ---
    useInput((char, key) => {
      // 全局: q 退出
      if (char === 'q' && step !== 'done') { exit(); return; }

      // Welcome
      if (step === 'welcome') {
        if (hasExisting && (char === 's' || key.return)) {
          setConfig(c => ({ ...c, ...existing }));
          setStep('done');
        } else if (key.return) {
          setStep('provider');
        }
        return;
      }

      // Provider 选择
      if (step === 'provider') {
        if (key.upArrow) setCursor(c => (c - 1 + PROVIDERS.length) % PROVIDERS.length);
        else if (key.downArrow) setCursor(c => (c + 1) % PROVIDERS.length);
        else if (key.return) {
          const p = PROVIDERS[cursor];
          if (p.id === 'custom') {
            setConfig(c => ({ ...c, provider: 'custom', baseUrl: '', model: '' }));
            setStep('customUrl');
          } else {
            setConfig(c => ({ ...c, provider: p.id, baseUrl: p.baseUrl, model: p.models[0] }));
            setStep('apikey');
          }
        }
        return;
      }

      // Custom URL 输入
      if (step === 'customUrl') {
        if (key.return && input.trim()) {
          setConfig(c => ({ ...c, baseUrl: input.trim(), model: 'custom-model' }));
          setInput('');
          setStep('apikey');
        } else if (key.backspace) setInput(v => v.slice(0, -1));
        else if (char && !key.ctrl && !key.meta) setInput(v => v + char);
        return;
      }

      // API Key 输入
      if (step === 'apikey') {
        if (key.return && input.trim()) {
          setConfig(c => ({ ...c, apiKey: input.trim() }));
          setInput('');
          const p = PROVIDERS.find(pr => pr.id === config.provider);
          if (p && p.models.length <= 1) {
            setConfig(c => ({ ...c, model: p.models[0] }));
            setStep('soul');
          } else {
            setStep('model');
          }
        } else if (key.backspace) setInput(v => v.slice(0, -1));
        else if (char && !key.ctrl && !key.meta) setInput(v => v + char);
        return;
      }

      // 模型选择
      if (step === 'model') {
        const models = PROVIDERS.find(p => p.id === config.provider)?.models ?? PROVIDERS[0].models;
        if (key.upArrow) setCursor(c => (c - 1 + models.length) % models.length);
        else if (key.downArrow) setCursor(c => (c + 1) % models.length);
        else if (key.return) {
          setConfig(c => ({ ...c, model: models[cursor] }));
          setCursor(0);
          setStep('soul');
        }
        return;
      }

      // SOUL.md
      if (step === 'soul') {
        if (char === '1') setStep('tools');
        else if (char === '2') { setInput(''); setStep('tools'); }
        return;
      }

      // 工具权限
      if (step === 'tools') {
        if (key.upArrow) setToolCursor(c => (c - 1 + TOOL_LIST.length) % TOOL_LIST.length);
        else if (key.downArrow) setToolCursor(c => (c + 1) % TOOL_LIST.length);
        else if (char === ' ') {
          const tool = TOOL_LIST[toolCursor];
          setConfig(c => {
            const inAllowed = c.allowedTools.includes(tool.name);
            const inAsk = c.askTools.includes(tool.name);
            const inDenied = c.deniedTools.includes(tool.name);
            if (inAllowed) return { ...c, allowedTools: c.allowedTools.filter(t => t !== tool.name), askTools: [...c.askTools, tool.name] };
            if (inAsk) return { ...c, askTools: c.askTools.filter(t => t !== tool.name), deniedTools: [...c.deniedTools, tool.name] };
            if (inDenied) return { ...c, deniedTools: c.deniedTools.filter(t => t !== tool.name), allowedTools: [...c.allowedTools, tool.name] };
            return c;
          });
        }
        else if (key.return) setStep('confirm');
        return;
      }

      // 确认
      if (step === 'confirm') {
        if (char === 'y' || char === 'Y') { saveConfig(); setStep('done'); }
        else if (char === 'n' || char === 'N') { setStep('welcome'); }
        return;
      }

      // 完成
      if (step === 'done') {
        if (key.return) exit();
        return;
      }
    });

    // --- 渲染 ---
    const progressBar = (idx: number, total: number) => {
      const filled = Math.round((idx / total) * 12);
      const empty = 12 - filled;
      return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${idx}/${total}`;
    };

    const header = (title: string, subtitle: string) => {
      return React.createElement(Text, null,
        React.createElement(Text, { bold: true, color: 'cyan' as const }, ` ⚡ C.C.Claw v0.2.0 `),
        React.createElement(Text, { dimColor: true }, `${progressBar(currentProgress, progressSteps.length)} `),
        React.createElement(Text, { color: 'white' as const, bold: true }, `${title} — ${subtitle}`),
      );
    };

    const renderStep = () => {
      switch (step) {
        case 'welcome':
          return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
            React.createElement(Text, { bold: true, color: 'cyan' as const }, '⚡  C.C.Claw v0.2.0'),
            React.createElement(Text, { dimColor: true }, '   Claude Code × OpenClaw 开源 CLI Agent 框架'),
            React.createElement(Text, null, ''),
            hasExisting
              ? React.createElement(React.Fragment, null,
                  React.createElement(Text, { color: 'yellow' as const }, '  ⚠ 检测到已有配置'),
                  React.createElement(Text, null, `  模型: ${existing?.model ?? 'unknown'}`),
                  React.createElement(Text, null, `  提供商: ${existing?.provider ?? 'unknown'}`),
                  React.createElement(Text, null, ''),
                  React.createElement(Text, null, '  [Enter] 跳过（使用已有配置）'),
                  React.createElement(Text, null, '  [s] 强制重新配置'),
                )
              : React.createElement(React.Fragment, null,
                  React.createElement(Text, null, '  首次配置向导将引导你完成：'),
                  React.createElement(Text, null, '    ✅  API 提供商 & Key 配置'),
                  React.createElement(Text, null, '    ✅  模型选择（含自定义端点）'),
                  React.createElement(Text, null, '    ✅  Agent 人格 (SOUL.md)'),
                  React.createElement(Text, null, '    ✅  工具权限管理'),
                  React.createElement(Text, null, ''),
                  React.createElement(Text, { color: 'gray' as const }, '  按 Enter 开始配置，q 退出'),
                ),
          );

        case 'provider': {
          return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
            header('📡', '选择 API 提供商'),
            React.createElement(Text, null, ''),
            ...PROVIDERS.map((p, i) =>
              React.createElement(Text, { key: p.id, color: i === cursor ? 'cyan' as const : 'gray' as const, bold: i === cursor },
                `  ${i === cursor ? '▸ ' : '  '}[${i + 1}] ${p.name.padEnd(12)} ${p.desc}${p.models.length > 0 ? ` (${p.models.length} 模型)` : ''}`
              )
            ),
            React.createElement(Text, null, ''),
            React.createElement(Text, { color: 'gray' as const }, '  ↑↓ 选择，Enter 确认，q 退出'),
          );
        }

        case 'customUrl':
          return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
            header('🔗', '自定义 API 端点'),
            React.createElement(Text, null, ''),
            React.createElement(Text, null, '  请输入自定义 base URL：'),
            React.createElement(Text, null, '  例: https://api.minimaxi.com/anthropic'),
            React.createElement(Text, null, ''),
            React.createElement(Text, null, `  ${'→'.padEnd(4)}${input}${'▋'}`),
            React.createElement(Text, null, ''),
            React.createElement(Text, { color: 'gray' as const }, '  输入后按 Enter 确认，q 退出'),
          );

        case 'apikey': {
          const p = PROVIDERS.find(pr => pr.id === config.provider);
          return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
            header('🔑', `输入 ${p?.name ?? ''} API Key`),
            React.createElement(Text, null, ''),
            React.createElement(Text, null, `  ${p?.envKey ?? 'API_KEY'}=`),
            React.createElement(Text, { color: 'yellow' as const }, `  ${'▋' + input.padEnd(40)}${'█'}`),
            React.createElement(Text, null, ''),
            React.createElement(Text, { color: 'gray' as const }, '  粘贴后按 Enter 确认，q 退出'),
          );
        }

        case 'model': {
          const models = PROVIDERS.find(p => p.id === config.provider)?.models ?? PROVIDERS[0].models;
          return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
            header('🤖', '选择默认模型'),
            React.createElement(Text, null, ''),
            ...models.map((m, i) =>
              React.createElement(Text, { key: m, color: i === cursor ? 'cyan' as const : 'gray' as const, bold: i === cursor },
                `  ${i === cursor ? '▸ ' : '  '}${m}`
              )
            ),
            React.createElement(Text, null, ''),
            React.createElement(Text, { color: 'gray' as const }, '  ↑↓ 选择，Enter 确认，q 退出'),
          );
        }

        case 'soul':
          return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
            header('🧠', 'Agent 人格 (SOUL.md)'),
            React.createElement(Text, null, ''),
            React.createElement(Text, null, '  [1] 使用默认模板'),
            React.createElement(Text, null, '  [2] 稍后自定义'),
            React.createElement(Text, null, ''),
            React.createElement(Text, { dimColor: true }, '  默认模板包含：'),
            React.createElement(Text, { dimColor: true }, '    • 核心准则：开口即行动，论先行'),
            React.createElement(Text, { dimColor: true }, '    • 行为铁律：未调用工具=未执行'),
            React.createElement(Text, { dimColor: true }, '    • 说话方式：简洁如匕首'),
            React.createElement(Text, null, ''),
            React.createElement(Text, { color: 'gray' as const }, '  输入 1 或 2 选择，q 退出'),
          );

        case 'tools': {
          return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
            header('🔧', '工具权限管理'),
            React.createElement(Text, null, ''),
            React.createElement(Text, { dimColor: true }, '  ↑↓ 移动  |  Space 切换  |  Enter 确认'),
            React.createElement(Text, null, ''),
            ...TOOL_LIST.map((tool, i) => {
              const perm = config.allowedTools.includes(tool.name) ? 'allow'
                : config.deniedTools.includes(tool.name) ? 'deny'
                : 'ask';
              const icon = perm === 'allow' ? '✅' : perm === 'deny' ? '🚫' : '❓';
              const label = perm === 'allow' ? 'allow' : perm === 'deny' ? 'deny' : 'ask  ';
              const color = perm === 'allow' ? 'green' as const : perm === 'deny' ? 'red' as const : 'yellow' as const;
              return React.createElement(Text, { key: tool.name, color: i === toolCursor ? 'cyan' as const : 'gray' as const, bold: i === toolCursor },
                `  ${i === toolCursor ? '▸ ' : '  '}${tool.name.padEnd(14)} ${tool.desc.padEnd(12)} `,
                React.createElement(Text, { color }, `${icon} ${label}`)
              );
            }),
          );
        }

        case 'confirm': {
          const p = PROVIDERS.find(pr => pr.id === config.provider);
          const masked = config.apiKey.length > 12
            ? `${config.apiKey.slice(0, 6)}...${config.apiKey.slice(-4)}`
            : config.apiKey;
          return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
            header('✅', '确认配置'),
            React.createElement(Text, null, ''),
            React.createElement(Text, null, `  📡 提供商:     ${p?.name ?? config.provider}`),
            config.baseUrl && config.provider === 'custom' ? React.createElement(Text, null, `  🔗 端点:       ${config.baseUrl}`) : null,
            React.createElement(Text, null, `  🤖 模型:       ${config.model}`),
            React.createElement(Text, null, `  🔑 API Key:    ${masked}`),
            React.createElement(Text, null, `  📁 数据目录:   ${config.dataDir}`),
            React.createElement(Text, { color: 'green' as const }, `  ✅ 允许工具:   ${config.allowedTools.length} 个`),
            React.createElement(Text, { color: 'yellow' as const }, `  ❓ 询问工具:   ${config.askTools.length} 个`),
            React.createElement(Text, { color: 'red' as const }, `  🚫 拒绝工具:   ${config.deniedTools.length} 个`),
            React.createElement(Text, null, ''),
            React.createElement(Text, { color: 'yellow' as const, bold: true }, '  [Y] 保存  [n] 重配  [q] 退出'),
          );
        }

        case 'done':
          return React.createElement(Box, { flexDirection: 'column' as const, padding: 1 },
            React.createElement(Text, { bold: true, color: 'green' as const }, '🎉  配置完成！'),
            React.createElement(Text, null, ''),
            React.createElement(Text, null, `  配置已保存到:  ${config.dataDir}`),
            React.createElement(Text, null, ''),
            React.createElement(Text, { color: 'gray' as const }, '  文件清单:'),
            React.createElement(Text, null, `    .cclaw.json      主配置（模型/提供商）`),
            config.baseUrl ? React.createElement(Text, null, `    .env               API Key + base URL`) : React.createElement(Text, null, `    .env               API Key`),
            React.createElement(Text, null, `    SOUL.md            Agent 人格定义`),
            React.createElement(Text, null, `    permissions.json   具权限配置`),
            React.createElement(Text, null, ''),
            React.createElement(Text, { color: 'cyan' as const }, '  启动命令:  cclaw chat'),
            React.createElement(Text, null, ''),
            React.createElement(Text, { dimColor: true }, '  按 Enter 退出'),
          );
      }
    };

    return React.createElement(Box, { flexDirection: 'column' as const, width: '100%' },
      React.createElement(Box, { flexDirection: 'column' as const }, renderStep()),
    );
  }

  const { waitUntilExit } = render(React.createElement(OnboardingApp));
  return waitUntilExit();
}
