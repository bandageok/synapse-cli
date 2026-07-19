# Synapse CLI

<p align="center">
  <img src="https://img.shields.io/badge/stars-0-2ecc71?style=flat-square&labelColor=555555" alt="GitHub Stars" />
  <img src="https://img.shields.io/badge/⭐_your_star-welcome-3498db?style=flat-square&labelColor=555555" alt="Your Star Welcome" />
  <img src="https://img.shields.io/badge/Node.js-≥18-3399cc?style=flat-square&labelColor=555555" alt="Node.js" />
  <img src="https://img.shields.io/badge/License-MIT-27ae60?style=flat-square&labelColor=555555" alt="MIT License" />
</p>

<p align="center">
  <strong>Agentic coding in the terminal — on any LLM, any provider.</strong>
</p>

<p align="center">
  Synapse is a TypeScript CLI for multi-provider coding agents. It combines an interactive terminal workflow with Vim mode, persistent agent soul, context compression, MCP, plugins, and 19 built-in tools.
</p>

---

## Why Synapse?

| Feature | Claude Code | Synapse |
|---------|------------|---------|
| Model-agnostic | ❌ Anthropic only | ✅ Any provider |
| Open source | ❌ Closed | ✅ MIT |
| Vim mode | ❌ | ✅ Full modal editor |
| Agent Soul (SOUL.md) | ❌ | ✅ Persistent personality |
| Memory system | ❌ | ✅ Daily notes + long-term memory |
| Self-improvement | ❌ | ✅ Learns from mistakes |
| MCP integration | ❌ | ✅ MCP protocol built-in |
| Plugin system | ❌ | ✅ Extensible architecture |

---

## Features

### 🧠 Any LLM, Any Provider
Choose a mainstream provider preset or connect any OpenAI-compatible or Anthropic-compatible BaseURL. Provider behavior is driven by configuration rather than hard-coded factory branches.

### ⚡ 19 Built-in Tools
File editing, shell execution, web search, Git operations, sub-agent spawning, image generation, TTS, and more — all permission-controlled.

### 🦾 Agent Soul System
Define your agent's personality once in `SOUL.md`. It persists across sessions, guides behavior, and evolves through self-improvement.

### 💾 Persistent Memory
Daily notes, curated long-term memory, session snapshots, and a self-improvement loop that learns from your corrections.

### 🎯 Vim Mode
Full NORMAL/INSERT mode switching, `hjkl` navigation, `d/y/p` operators — built into the REPL.

### 🛡️ Permission System
Three-tier tool permissions: `allow` / `ask` / `deny`. Dangerous operations always prompt. Customize per-tool in `permissions.json`.

### 🔌 MCP + Plugin Architecture
Connect any MCP-compatible server. Built-in plugin registry for extending functionality.

---

## Quick Start

```bash
# Install
npm install -g @bandageok/synapse-cli

# Launch (auto-configures on first run)
synapse chat

# Specify a model
synapse chat -m deepseek-chat

# Pipe mode — use in scripts
echo "Explain this code" | synapse chat -p
```

### Provider Setup

```bash
# Browse presets and see which credentials are available
synapse provider list

# Select a mainstream preset and store its API key locally
synapse provider set deepseek --api-key "$DEEPSEEK_API_KEY"

# Connect any OpenAI-compatible gateway or local server
synapse provider set company-gateway \
  --base-url https://llm.example.com/v1 \
  --protocol openai \
  --model company-model \
  --api-key "$COMPANY_API_KEY"

# Anthropic-compatible endpoints are also supported
synapse provider set private-anthropic \
  --base-url https://anthropic.example.com \
  --protocol anthropic \
  --auth x-api-key \
  --model private-model \
  --api-key-env PRIVATE_LLM_API_KEY

# Validate key, endpoint, protocol, and model with a one-token request
synapse provider test
```

`--api-key` writes the credential to `~/.synapse/.env` and never prints it. To keep secrets out of shell history, set the environment variable named by `--api-key-env` instead.

### Memory Operations

```bash
synapse memory inspect
synapse memory search "project convention"
synapse memory prune --older-than 90          # preview only
synapse memory prune --older-than 90 --yes    # apply deletion
synapse memory export memories.json
```

Search and export exclude session transcripts by default. Add `--include-sessions` only when the transcript content is intentionally needed. All read-oriented commands support structured output through `--json` where applicable.

---

## Demo

```
$ synapse chat
🤖 Synapse v0.2.0 — multi-provider coding agent

[Provider] Select provider: (anthropic/openrouter/minimax/custom)
> anthropic

[Model] Select model: (claude-sonnet-4-20250514/claude-opus-4-5...)
> claude-sonnet-4-20250514

[API Key] Paste your Anthropic API key:
> sk-ant-...

✅ Configured. Starting session...
─────────────────────────────────────────────
  Synapse Doctor
  Provider: anthropic
  Model: claude-sonnet-4-20250514
  Tools: 19 registered
  Engine: AsyncGenerator v0.2.0
─────────────────────────────────────────────

You> Explain what the Soul system does

🤖> The Soul system gives the agent a persistent identity...

You> /help
  /model   /clear   /memory   /soul    /session
  /config  /doctor  /cost     /compact /context
  /diff    /undo    /vim      /history /resume
```

---

## Architecture

```
synapse-cli/
├── src/
│   ├── core/           # Engine, Context, Compressor, ToolRegistry, HookSystem
│   ├── tools/          # 19 built-in tools
│   ├── providers/      # Anthropic, OpenRouter, MiniMax, Custom
│   ├── soul/           # SoulLoader, Heartbeat, Dream, MemoryManager,
│   │                   # SelfImprovement, FakeExecutionWatchdog
│   ├── ui/             # REPL (Ink + Vim mode), Onboarding
│   └── services/       # MCP Client, Plugin Registry
├── dist/               # Built output (~230 KB)
└── tests/              # 26 test files, 188 tests
```

---

## Tool Permission Model

```
✅ Allow (no confirm):
  FileRead · Glob · Grep · WebSearch · WebFetch
  Task · TodoWrite · GitStatus · GitDiff · Notebook
  Skill · TTS · Image · AskUserQuestion

⚠️  Ask (confirm before):
  Bash · PowerShell · FileEdit · FileWrite · GitCommit

🚫 Deny (always blocked):
  (user configurable)
```

---

## Configuration

Config stored in `~/.synapse/`:

| File | Purpose |
|------|---------|
| `.synapse.json` | Provider, model, endpoint |
| `.env` | API keys |
| `SOUL.md` | Agent personality |
| `permissions.json` | Tool permissions |
| `memory/` | Daily notes |
| `sessions/` | Session snapshots |
| `.learnings/` | Self-improvement records |

## Provider Payloads

Synapse sends each provider a system prompt assembled from `SOUL.md`, `MEMORY.md`, project instructions, active skills, and the current turn context. Tool use is gated by the permission model before execution, and every tool decision is written to `logs/audit.jsonl`.

---

## Requirements

- **Node.js** ≥ 18
- **TypeScript** 5.7+
- API key for your chosen provider

---

## Roadmap

See [docs/ROADMAP-v0.3.0.md](./docs/ROADMAP-v0.3.0.md) for upcoming features.

For positioning, competitor comparison, and release-readiness recommendations, see [docs/SYNAPSE-AUDIT-2026-07-19.md](./docs/SYNAPSE-AUDIT-2026-07-19.md).

For the complete provider configuration schema and memory command safety rules, see [docs/PROVIDER-MEMORY-CLI.md](./docs/PROVIDER-MEMORY-CLI.md).

---

## Contributing

Issues and PRs welcome. Please read [docs/CONFIG.md](./docs/CONFIG.md) before contributing.

---

## License

MIT — use freely, fork freely.
