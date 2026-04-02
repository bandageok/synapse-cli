// src/ui/Onboarding.tsx
// C.C.Claw Onboarding UI — 对标 Claude Code 首次启动配置界面
// 支持 API Key、模型、SOUL.md、权限、MCP 等配置
import React, { useState, useCallback, useEffect } from 'react';
import { render, Text, Box, useInput, useApp } from 'ink';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface OnboardingConfig {
  apiKey: string;
  provider: 'anthropic' | 'openrouter';
  model: string;
  soulContent: string;
  allowedTools: string[];
  deniedTools: string[];
  mcpServers: { name: string; command: string; args: string[] }[];
}

const MODELS = {
  anthropic: [
    'claude-sonnet-4-20250514',
    'claude-haiku-35-20241022',
    'claude-opus-4-20250514',
  ],
  openrouter: [
    'xiaomi/mimo-v2-pro',
    'anthropic/claude-sonnet-4',
    'google/gemini-2.5-pro-preview',
    'openai/gpt-4o',
    'deepseek/deepseek-chat-v3-0324',
  ],
};

const TOOLS = [
  { name: 'Bash', desc: '执行 shell 命令', default: 'ask' },
  { name: 'PowerShell', desc: 'PowerShell 命令 (Windows)', default: 'ask' },
  { name: 'FileRead', desc: '读取文件', default: 'allow' },
  { name: 'FileEdit', desc: '编辑文件', default: 'ask' },
  { name: 'FileWrite', desc: '写入文件', default: 'ask' },
  { name: 'Glob', desc: '查找文件', default: 'allow' },
  { name: 'Grep', desc: '搜索内容', default: 'allow' },
  { name: 'WebSearch', desc: '网络搜索', default: 'allow' },
  { name: 'WebFetch', desc: '抓取网页', default: 'allow' },
  { name: 'Task', desc: '子代理', default: 'allow' },
  { name: 'GitCommit', desc: 'Git 提交', default: 'ask' },
  { name: 'ImageGenerate', desc: 'AI 生成图片', default: 'allow' },
  { name: 'TTS', desc: '文字转语音', default: 'allow' },
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

type Step = 'welcome' | 'provider' | 'apikey' | 'model' | 'soul' | 'tools' | 'mcp' | 'confirm' | 'done';

export function launchOnboarding() {
  function Onboarding() {
    const [step, setStep] = useState<Step>('welcome');
    const [config, setConfig] = useState<OnboardingConfig>({
      apiKey: '',
      provider: 'openrouter',
      model: 'xiaomi/mimo-v2-pro',
      soulContent: SOUL_TEMPLATE,
      allowedTools: ['FileRead', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Task', 'TodoWrite', 'AskUserQuestion'],
      deniedTools: [],
      mcpServers: [],
    });
    const [input, setInput] = useState('');
    const [toolCursor, setToolCursor] = useState(0);
    const [modelCursor, setModelCursor] = useState(0);
    const [mcpInput, setMcpInput] = useState({ name: '', command: '', args: '' });
    const [mcpField, setMcpField] = useState<'name' | 'command' | 'args'>('name');
    const { exit } = useApp();

    const dataDir = process.env.CCLAW_DATA_DIR || join(homedir(), '.cclaw');

    const saveConfig = useCallback(() => {
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

      // 保存 API Key 到环境变量提示
      const envFile = join(dataDir, '.env');
      writeFileSync(envFile, `${config.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENROUTER_API_KEY'}=${config.apiKey}\n`);

      // 保存 SOUL.md
      writeFileSync(join(dataDir, 'SOUL.md'), config.soulContent);

      // 保存权限配置
      writeFileSync(join(dataDir, 'permissions.json'), JSON.stringify({
        allowedTools: config.allowedTools,
        deniedTools: config.deniedTools,
        askForTools: TOOLS.filter(t => !config.allowedTools.includes(t.name) && !config.deniedTools.includes(t.name)).map(t => t.name),
      }, null, 2));

      // 保存 MCP 配置
      if (config.mcpServers.length > 0) {
        const mcpConfig = { mcpServers: {} as any };
        for (const s of config.mcpServers) {
          mcpConfig.mcpServers[s.name] = { command: s.command, args: s.args };
        }
        writeFileSync(join(dataDir, '.mcp.json'), JSON.stringify(mcpConfig, null, 2));
      }

      // 保存模型配置
      writeFileSync(join(dataDir, '.cclaw.json'), JSON.stringify({ model: config.model, provider: config.provider }, null, 2));

      // 创建必要目录
      for (const dir of ['memory', 'sessions', 'logs']) {
        const dirPath = join(dataDir, dir);
        if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
      }
    }, [config, dataDir]);

    // Provider 选择
    useInput((char, key) => {
      if (step === 'welcome') {
        if (key.return) setStep('provider');
        return;
      }

      if (step === 'provider') {
        if (char === '1') {
          setConfig(c => ({ ...c, provider: 'anthropic', model: MODELS.anthropic[0] }));
          setStep('apikey');
        } else if (char === '2') {
          setConfig(c => ({ ...c, provider: 'openrouter', model: MODELS.openrouter[0] }));
          setStep('apikey');
        }
        return;
      }

      if (step === 'apikey') {
        if (key.return && input.trim()) {
          setConfig(c => ({ ...c, apiKey: input.trim() }));
          setInput('');
          setStep('model');
        } else if (key.backspace) {
          setInput(i => i.slice(0, -1));
        } else if (char && !key.ctrl && !key.meta) {
          setInput(i => i + char);
        }
        return;
      }

      if (step === 'model') {
        const models = MODELS[config.provider];
        if (key.upArrow) {
          setModelCursor(c => (c - 1 + models.length) % models.length);
        } else if (key.downArrow) {
          setModelCursor(c => (c + 1) % models.length);
        } else if (key.return) {
          setConfig(c => ({ ...c, model: models[modelCursor] }));
          setStep('soul');
        }
        return;
      }

      if (step === 'soul') {
        if (char === '1') {
          setStep('tools');
        } else if (char === '2') {
          setInput('');
          // 进入编辑模式（简化：直接用默认模板）
          setStep('tools');
        }
        return;
      }

      if (step === 'tools') {
        if (key.upArrow) {
          setToolCursor(c => (c - 1 + TOOLS.length) % TOOLS.length);
        } else if (key.downArrow) {
          setToolCursor(c => (c + 1) % TOOLS.length);
        } else if (char === ' ') {
          // 切换权限
          const tool = TOOLS[toolCursor];
          setConfig(c => {
            const isAllowed = c.allowedTools.includes(tool.name);
            const isDenied = c.deniedTools.includes(tool.name);
            if (isAllowed) {
              return {
                ...c,
                allowedTools: c.allowedTools.filter(t => t !== tool.name),
                deniedTools: [...c.deniedTools, tool.name],
              };
            } else if (isDenied) {
              return {
                ...c,
                deniedTools: c.deniedTools.filter(t => t !== tool.name),
              };
            } else {
              return {
                ...c,
                allowedTools: [...c.allowedTools, tool.name],
              };
            }
          });
        } else if (key.return) {
          setStep('mcp');
        }
        return;
      }

      if (step === 'mcp') {
        if (char === '1') {
          setMcpInput({ name: '', command: '', args: '' });
          setMcpField('name');
          // 简化：跳过 MCP 配置
          setStep('confirm');
        } else if (char === '2') {
          setStep('confirm');
        } else if (key.return && mcpField === 'name' && mcpInput.name.trim()) {
          setMcpField('command');
        } else if (key.return && mcpField === 'command' && mcpInput.command.trim()) {
          setMcpField('args');
        } else if (key.return && mcpField === 'args') {
          const args = mcpInput.args.trim() ? mcpInput.args.split(' ') : [];
          setConfig(c => ({
            ...c,
            mcpServers: [...c.mcpServers, { name: mcpInput.name, command: mcpInput.command, args }],
          }));
          setMcpInput({ name: '', command: '', args: '' });
          setMcpField('name');
          setStep('confirm');
        } else if (key.backspace) {
          setMcpInput(i => ({ ...i, [mcpField]: i[mcpField].slice(0, -1) }));
        } else if (char && !key.ctrl && !key.meta) {
          setMcpInput(i => ({ ...i, [mcpField]: i[mcpField] + char }));
        }
        return;
      }

      if (step === 'confirm') {
        if (char === 'y' || char === 'Y') {
          saveConfig();
          setStep('done');
        } else if (char === 'n' || char === 'N') {
          setStep('welcome');
        }
        return;
      }

      if (step === 'done') {
        if (key.return) exit();
        return;
      }
    });

    // 渲染
    const renderStep = () => {
      switch (step) {
        case 'welcome':
          return React.createElement(Box, { flexDirection: 'column', padding: 1 },
            React.createElement(Text, { bold: true, color: 'cyan' }, '⚡ C.C.Claw v0.2.0 — 首次配置'),
            React.createElement(Text, null, ''),
            React.createElement(Text, null, '欢迎使用 C.C.Claw！'),
            React.createElement(Text, null, 'Claude Code × OpenClaw 开源 CLI Agent 框架'),
            React.createElement(Text, null, ''),
            React.createElement(Text, { color: 'gray' }, '按 Enter 开始配置...'),
          );

        case 'provider':
          return React.createElement(Box, { flexDirection: 'column', padding: 1 },
            React.createElement(Text, { bold: true, color: 'cyan' }, '📡 选择 API 提供商'),
            React.createElement(Text, null, ''),
            React.createElement(Text, null, '  [1] Anthropic（推荐，直接使用 Claude）'),
            React.createElement(Text, null, '  [2] OpenRouter（支持多模型，包括 MiMo/Gemini/GPT）'),
            React.createElement(Text, null, ''),
            React.createElement(Text, { color: 'gray' }, '输入 1 或 2 选择'),
          );

        case 'apikey':
          return React.createElement(Box, { flexDirection: 'column', padding: 1 },
            React.createElement(Text, { bold: true, color: 'cyan' }, `🔑 输入 ${config.provider === 'anthropic' ? 'Anthropic' : 'OpenRouter'} API Key`),
            React.createElement(Text, null, ''),
            React.createElement(Text, null, `  ${config.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENROUTER_API_KEY'}=`),
            React.createElement(Text, { color: 'yellow' }, `  ${input}${'▋'}`),
            React.createElement(Text, null, ''),
            React.createElement(Text, { color: 'gray' }, '粘贴后按 Enter 确认'),
          );

        case 'model':
          const models = MODELS[config.provider];
          return React.createElement(Box, { flexDirection: 'column', padding: 1 },
            React.createElement(Text, { bold: true, color: 'cyan' }, '🤖 选择默认模型'),
            React.createElement(Text, null, ''),
            ...models.map((m, i) =>
              React.createElement(Text, {
                key: m,
                color: i === modelCursor ? 'cyan' : 'gray',
                bold: i === modelCursor,
              }, `  ${i === modelCursor ? '▸ ' : '  '}${m}`)
            ),
            React.createElement(Text, null, ''),
            React.createElement(Text, { color: 'gray' }, '↑↓ 选择，Enter 确认'),
          );

        case 'soul':
          return React.createElement(Box, { flexDirection: 'column', padding: 1 },
            React.createElement(Text, { bold: true, color: 'cyan' }, '🧠 配置 Agent 人格 (SOUL.md)'),
            React.createElement(Text, null, ''),
            React.createElement(Text, null, '  [1] 使用默认模板（推荐）'),
            React.createElement(Text, null, '  [2] 稍后自定义'),
            React.createElement(Text, null, ''),
            React.createElement(Text, { dimColor: true }, '默认模板包含：'),
            React.createElement(Text, { dimColor: true }, '  • 核心准则：开口即行动，结论先行'),
            React.createElement(Text, { dimColor: true }, '  • 行为铁律：未调用工具=未执行'),
            React.createElement(Text, { dimColor: true }, '  • 说话方式：简洁如匕首'),
          );

        case 'tools':
          return React.createElement(Box, { flexDirection: 'column', padding: 1 },
            React.createElement(Text, { bold: true, color: 'cyan' }, '🔧 配置工具权限'),
            React.createElement(Text, null, ''),
            React.createElement(Text, { dimColor: true }, '↑↓ 移动光标，Space 切换权限，Enter 确认'),
            React.createElement(Text, null, ''),
            ...TOOLS.map((tool, i) => {
              const isAllowed = config.allowedTools.includes(tool.name);
              const isDenied = config.deniedTools.includes(tool.name);
              const status = isAllowed ? '✅ allow' : isDenied ? '🚫 deny' : '❓ ask';
              const statusColor = isAllowed ? 'green' : isDenied ? 'red' : 'yellow';
              return React.createElement(Text, {
                key: tool.name,
                color: i === toolCursor ? 'cyan' : 'gray',
                bold: i === toolCursor,
              }, `  ${i === toolCursor ? '▸ ' : '  '}${tool.name.padEnd(16)} ${tool.desc.padEnd(20)} `, 
                React.createElement(Text, { color: statusColor }, status)
              );
            }),
          );

        case 'mcp':
          return React.createElement(Box, { flexDirection: 'column', padding: 1 },
            React.createElement(Text, { bold: true, color: 'cyan' }, '🔌 配置 MCP 服务器（可选）'),
            React.createElement(Text, null, ''),
            React.createElement(Text, null, '  [1] 跳过（稍后用 cclaw mcp add 添加）'),
            React.createElement(Text, null, '  [2] 跳过'),
            React.createElement(Text, null, ''),
            config.mcpServers.length > 0 && React.createElement(Text, { color: 'green' }, `  已添加 ${config.mcpServers.length} 个服务器`),
          );

        case 'confirm':
          return React.createElement(Box, { flexDirection: 'column', padding: 1 },
            React.createElement(Text, { bold: true, color: 'cyan' }, '✅ 确认配置'),
            React.createElement(Text, null, ''),
            React.createElement(Text, null, `  提供商: ${config.provider}`),
            React.createElement(Text, null, `  模型: ${config.model}`),
            React.createElement(Text, null, `  API Key: ${config.apiKey.slice(0, 8)}...${config.apiKey.slice(-4)}`),
            React.createElement(Text, null, `  允许工具: ${config.allowedTools.length} 个`),
            React.createElement(Text, null, `  询问工具: ${TOOLS.length - config.allowedTools.length - config.deniedTools.length} 个`),
            React.createElement(Text, null, `  拒绝工具: ${config.deniedTools.length} 个`),
            React.createElement(Text, null, `  MCP 服务器: ${config.mcpServers.length} 个`),
            React.createElement(Text, null, ''),
            React.createElement(Text, { color: 'yellow' }, '  保存配置？[Y/n]'),
          );

        case 'done':
          return React.createElement(Box, { flexDirection: 'column', padding: 1 },
            React.createElement(Text, { bold: true, color: 'green' }, '🎉 配置完成！'),
            React.createElement(Text, null, ''),
            React.createElement(Text, null, `  配置已保存到: ${dataDir}`),
            React.createElement(Text, null, ''),
            React.createElement(Text, null, '  启动命令:'),
            React.createElement(Text, { color: 'cyan' }, '    cclaw chat'),
            React.createElement(Text, null, ''),
            React.createElement(Text, { color: 'gray' }, '  按 Enter 退出'),
          );
      }
    };

    return React.createElement(Box, { flexDirection: 'column', height: '100%' },
      renderStep(),
    );
  }

  const { waitUntilExit } = render(React.createElement(Onboarding));
  return waitUntilExit();
}
