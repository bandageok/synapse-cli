# Synapse v0.2.0

> Claude Code × OpenClaw — Open Source CLI Agent Framework

[English](#installation) · [中文](#快速开始)

---

## Overview / 概述

Synapse is a lightweight, TypeScript-based CLI agent framework that brings Claude Code-style interactive terminal experience to any LLM API. It features onboarding-first configuration, 19 built-in tools, Vim mode, and a Soul system for persistent agent identity.

Synapse 是一个轻量级、基于 TypeScript 的 CLI Agent 框架，将 Claude Code 风格的交互式终端体验带入任意 LLM API。支持首次启动引导、19 个内置工具、Vim 模式和持久化 Agent 灵魂系统。

---

## Installation / 安装

```bash
# From NPM (coming soon)
npm install -g synapse

# From source
git clone https://github.com/synapse/synapse.git
cd synapse
npm install
npm run build
npm install -g .
```

---

## Quick Start (中文) / 快速开始

### 1. 首次启动

```bash
synapse chat
```

首次运行时，Synapse 会自动弹出配置向导。按以下步骤配置：

1. **选择提供商** — Anthropic / OpenRouter / MiniMax / 自定义
2. **选择模型** — 从对应提供商的模型列表中选择
3. **输入 API Key** — 粘贴你的 API Key
4. **安全须知** — 阅读 Agent 权限说明
5. **完成** — 自动进入对话

### 2. 配置流程

#### 2.1 支持的提供商

| 提供商 | 端点 | 认证方式 | 典型模型 |
|--------|------|----------|----------|
| **Anthropic** | `api.anthropic.com` | `x-api-key` | Claude Sonnet 4, Opus 4, Haiku 3.5 |
| **OpenRouter** | `openrouter.ai/api/v1` | `Bearer` | 任意模型（聚合路由） |
| **MiniMax** | `api.minimaxi.com/anthropic` | `Bearer` | MiniMax-M2.7 |
| **自定义** | 手动输入 | `x-api-key` | 任意 Anthropic 兼容端点 |

#### 2.2 配置文件

所有配置保存在 `~/.synapse/` 目录：

```
~/.synapse/
├── .synapse.json       # 主配置（提供商、模型、端点）
├── .env              # API Key（KEY=VALUE 格式）
├── SOUL.md           # Agent 人格定义
├── permissions.json  # 工具权限配置
├── memory/           # 记忆文件
├── sessions/         # 会话历史
├── logs/             # 日志
└── .learnings/       # 自我改进记录
```

#### 2.3 环境变量

```bash
# 直接通过环境变量配置（覆盖 .synapse.json）
export ANTHROPIC_API_KEY="your-key"        # Anthropic
export OPENROUTER_API_KEY="your-key"       # OpenRouter
export MINIMAX_API_KEY="your-key"          # MiniMax
export CUSTOM_API_KEY="your-key"           # 自定义
export API_BASE_URL="https://..."          # 自定义端点
export CCLAW_DATA_DIR="/path/to/data"      # 自定义数据目录
```

### 3. 启动命令

```bash
synapse chat                    # 启动交互式对话（默认模型）
synapse chat -m MiniMax-M2.7    # 指定模型
synapse chat -p                 # 管道模式（stdin → stdout）
synapse chat -v                 # 详细模式（显示完整工具调用）

synapse onboard                 # 手动启动配置向导
synapse doctor                  # 诊断配置问题
synapse init                    # 初始化模板文件
synapse logs                    # 查看日志
synapse logs -f                 # 实时跟踪日志
synapse mcp list                # 查看 MCP 服务器
synapse plugin list             # 查看插件
synapse update                  # 检查更新
synapse update --check          # 仅检查，不更新
```

### 4. REPL 命令

在 `synapse chat` 中输入斜杠命令：

| 命令 | 说明 | 示例 |
|------|------|------|
| `/help` | 显示所有命令和快捷键 | `/help` |
| `/model` | 切换模型 | `/model MiniMax-M2.7` |
| `/clear` | 清空对话历史 | `/clear` |
| `/memory` | 查看 Agent 记忆 | `/memory` |
| `/soul` | 查看 Agent 人格 (SOUL.md) | `/soul` |
| `/soul-edit` | 编辑 Agent 人格 | `/soul-edit` |
| `/session` | 会话管理（保存/加载/列表） | `/session list` |
| `/config` | 查看当前配置 | `/config` |
| `/doctor` | 诊断系统状态 | `/doctor` |
| `/cost` | 查看本轮费用估算 | `/cost` |
| `/compact` | 强制压缩当前上下文 | `/compact` |
| `/context` | 查看当前上下文大小 | `/context` |
| `/diff` | 查看本轮文件修改 | `/diff` |
| `/undo` | 撤销上次文件编辑 | `/undo` |
| `/vim` | 切换 Vim 模式 | `/vim on` |
| `/history` | 查看对话历史 | `/history` |
| `/resume` | 恢复上次会话 | `/resume` |
| `/init` | 初始化模板 | `/init` |
| `/exit` | 退出 | `/exit` |

### 5. 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 发送消息 |
| `Ctrl+C` | 退出 |
| `Ctrl+L` | 清屏 |
| `Ctrl+U` | 清除当前输入 |
| `Ctrl+W` | 删除前一个单词 |

#### Vim 模式（启用后）

| 快捷键 | 模式 | 功能 |
|--------|------|------|
| `h j k l` | NORMAL | 光标移动 |
| `Esc` | NORMAL | 进入 NORMAL 模式 |
| `i` | INSERT | 编辑输入 |
| `A` | INSERT | 跳到行尾并编辑 |

### 6. 工具系统

Synapse 预设 19 个工具，按权限分为三类：

#### Allow（默认允许，无需确认）

| 工具 | 说明 |
|------|------|
| `FileRead` | 读取文件内容 |
| `Glob` | 按模式搜索文件 |
| `Grep` | 按内容搜索文件 |
| `WebSearch` | 网络搜索（Tavily） |
| `WebFetch` | 抓取网页内容 |
| `Task` | 生成子代理 |
| `TodoWrite` | 任务管理 |
| `AskUserQuestion` | 向用户提问 |
| `GitStatus` | 查看 Git 状态 |
| `GitDiff` | 查看 Git 差异 |
| `Notebook` | 笔记读写 |
| `Skill` | 加载外部技能 |
| `TTS` | 文字转语音 |
| `Image` | 图片读取/生成 |

#### Ask（默认询问，需用户确认）

| 工具 | 说明 |
|------|------|
| `Bash` | 执行 Shell 命令 |
| `PowerShell` | 执行 PowerShell 命令 |
| `FileEdit` | 编辑文件（diff 模式） |
| `FileWrite` | 写入文件 |
| `GitCommit` | 提交 Git 变更 |

### 7. 权限管理

- **allow**: 无需确认直接执行
- **ask**: 执行前弹出确认对话框 (`[A]llow` / `[D]eny`)
- **deny**: 永远禁止执行

修改权限：编辑 `~/.synapse/permissions.json`

```json
{
  "allowedTools": ["FileRead", "Glob", "Grep"],
  "askTools": ["Bash", "PowerShell", "FileEdit"],
  "deniedTools": [])
}
```

### 8. Agent 灵魂系统

#### SOUL.md — Agent 人格定义

SOUL.md 定义 Agent 的行为准则、说话风格、思考方式。每次对话都会自动加载。

**示例：**

```markdown
# SOUL.md

## 核心准则
- 开口即行动，结论先行
- 先自己想办法，穷尽再开口

## 行为铁律
- 未调用工具 = 未执行
- 文件操作后必须验证修改生效

## 说话方式
简洁如匕首。一句话说完不写第二句。
```

编辑：`/soul-edit` 或直接编辑 `~/.synapse/SOUL.md`

### 9. 记忆系统

- **memory/** — 每日笔记 (`YYYY-MM-DD.md`)
- **MEMORY.md** — 长期记忆（精炼）
- **sessions/** — 会话快照（JSON 格式）
- **.learnings/** — 自我改进记录

### 10. MCP 集成

```bash
synapse mcp list                              # 列出已配置 MCP 服务器
synapse mcp add my-server /path/to/server     # 添加 MCP 服务器
synapse mcp remove my-server                  # 删除 MCP 服务器
```

MCP 配置文件保存在 `~/.synapse/.mcp.json`

---

## English Documentation

### Getting Started

#### 1. First Launch

```bash
synapse chat
```

On first run, Synapse automatically launches the setup wizard. Follow these steps:

1. **Select Provider** — Anthropic / OpenRouter / MiniMax / Custom
2. **Select Model** — Choose from provider's available models
3. **Enter API Key** — Paste your API key
4. **Security Notes** — Review agent permissions
5. **Done** — Automatically enters chat mode

#### 2. Configuration Files

All configurations are stored in `~/.synapse/`:

```
~/.synapse/
├── .synapse.json       # Main config (provider, model, endpoint)
├── .env              # API keys (KEY=VALUE format)
├── SOUL.md           # Agent personality definition
├── permissions.json  # Tool permission settings
├── memory/           # Memory files
├── sessions/         # Session history
├── logs/             # Logs
└── .learnings/       # Self-improvement records
```

#### 3. Environment Variables

```bash
export ANTHROPIC_API_KEY="your-key"
export OPENROUTER_API_KEY="your-key"
export MINIMAX_API_KEY="your-key"
export API_BASE_URL="https://..."
export CCLAW_DATA_DIR="/path/to/data"
```

#### 4. CLI Commands

```bash
# Main commands
synapse chat                    # Start interactive chat (default model)
synapse chat -m MiniMax-M2.7    # Specify model
synapse chat -p                 # Pipe mode (stdin → stdout)
synapse chat -v                 # Verbose mode (show full tool calls)

# Management
synapse onboard                 # Launch setup wizard
synapse doctor                  # Diagnose configuration
synapse init                    # Initialize template files
synapse logs                    # View logs
synapse logs -f                 # Follow logs (tail -f)

# Integrations
synapse mcp list                # List MCP servers
synapse plugin list             # List plugins
synapse update                  # Check for updates
```

#### 5. REPL Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/help` | Show all commands | `/help` |
| `/model` | Switch model | `/model claude-sonnet-4` |
| `/clear` | Clear chat history | `/clear` |
| `/memory` | View agent memory | `/memory` |
| `/soul` | View SOUL.md | `/soul` |
| `/soul-edit` | Edit SOUL.md | `/soul-edit` |
| `/session` | Session management | `/session list` |
| `/config` | View current config | `/config` |
| `/doctor` | Diagnose system status | `/doctor` |
| `/cost` | Cost estimation | `/cost` |
| `/compact` | Force context compression | `/compact` |
| `/context` | View context size | `/context` |
| `/diff` | View file changes this turn | `/diff` |
| `/undo` | Undo last file edit | `/undo` |
| `/vim` | Toggle Vim mode | `/vim on` |
| `/history` | View conversation history | `/history` |
| `/resume` | Resume last session | `/resume` |
| `/init` | Initialize templates | `/init` |
| `/exit` | Exit | `/exit` |

#### 6. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Ctrl+C` | Exit |
| `Ctrl+L` | Clear screen |
| `Ctrl+U` | Clear current input |
| `Ctrl+W` | Delete previous word |

### 7. Tool System

Synapse includes 19 pre-built tools, categorized by permission level:

**Allow** (no confirmation needed):
`FileRead`, `Glob`, `Grep`, `WebSearch`, `WebFetch`, `Task`, `TodoWrite`, `AskUserQuestion`, `GitStatus`, `GitDiff`, `Notebook`, `Skill`, `TTS`, `Image`

**Ask** (confirmation required):
`Bash`, `PowerShell`, `FileEdit`, `FileWrite`, `GitCommit`

### 8. Permission Model

- **allow**: Execute without confirmation
- **ask**: Prompt before execution (`[A]llow` / `[D]eny`)
- **deny**: Always rejected

Edit `~/.synapse/permissions.json` to customize tool permissions.

### 9. Soul System

SOUL.md defines the agent's personality, communication style, and behavioral rules. It's loaded automatically with every conversation.

Edit via `/soul-edit` or directly edit `~/.synapse/SOUL.md`.

### 10. Memory System

- **memory/** — Daily notes (`YYYY-MM-DD.md`)
- **MEMORY.md** — Long-term memory (curated)
- **sessions/** — Session snapshots (JSON)
- **.learnings/** — Self-improvement records

### 11. MCP Integration

```bash
synapse mcp list                              # List configured servers
synapse mcp add my-server /path/to/server     # Add an MCP server
synapse mcp remove my-server                  # Remove an MCP server
```

MCP configuration is stored in `~/.synapse/.mcp.json`

---

## Architecture / 架构

```
C.C.Clay v0.2.0
├── Core Engine (400+ LOC)
│   ├── Engine.ts          — AsyncGenerator streaming engine
│   ├── Compressor.ts      — 4-level context compression + LLM summary
│   ├── Context.ts         — 6-layer context builder
│   ├── ErrorRecovery.ts   — Circuit breaker + exponential backoff
│   ├── HookSystem.ts      — pre/post tool execution hooks
│   └── ToolRegistry.ts    — Tool registration + permission system
│
├── Providers (3 providers)
│   ├── AnthropicProvider  — Claude API (+ MiniMax custom endpoint)
│   └── OpenRouterProvider — OpenRouter unified routing
│
├── Tools (19 tools)
│   ├── FileRead/Edit/Write  — File operations (with backup)
│   ├── Bash/PowerShell      — Shell execution
│   ├── Glob/Grep            — File search
│   ├── WebSearch/WebFetch   — Network access
│   ├── Task                 — Sub-agent spawning (2 isolation modes)
│   ├── GitStatus/Diff/Commit — Git operations
│   └── + TodoWrite, Notebook, Skill, Image, TTS...
│
├── Soul System (9 modules)
│   ├── SOUL.md loader     — Personality injection
│   ├── Heartbeat          — Scheduled task engine
│   ├── Dream              — Session consolidation
│   ├── MemoryExtractor     — Session → memory extraction
│   ├── SelfImprovement    — Learning from mistakes
│   └── FakeExecutionWatchdog — Detect "fake" tool calls
│
├── UI
│   ├── REPL.tsx           — Ink-based terminal UI (syntax highlighting + Vim mode)
│   └── Onboarding.tsx     — First-run setup wizard
│
└── Services
    ├── MCP Client         — MCP protocol integration
    └── Plugin Registry    — Plugin system
```

---

## Requirements

- Node.js ≥ 18
- TypeScript 5.7+
- npm 10+

## License

MIT
