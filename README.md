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

### 🧠 Compatible Providers, Explicit Protocols
Choose a mainstream preset or connect an OpenAI-compatible or Anthropic-compatible BaseURL. Provider-specific codecs preserve native tool-call identifiers instead of flattening tool messages into text.

### ⚡ 19 Built-in Tools
File editing, shell execution, web search, Git operations, sub-agent spawning, image generation, TTS, and more — all permission-controlled.

### 🦾 Agent Soul System
Define your agent's personality once in `SOUL.md`. It persists across sessions, guides behavior, and evolves through self-improvement.

### 💾 Persistent Memory
Daily notes, curated long-term memory, session snapshots, and a self-improvement loop that learns from your corrections.

### 🎯 Vim Mode
Full NORMAL/INSERT mode switching, `hjkl` navigation, `d/y/p` operators — built into the REPL.

### 🛡️ Permission System
Three-tier tool permissions: `allow` / `ask` / `deny`, backed by runtime JSON Schema validation and workspace path isolation. Writes, command execution, network access, sensitive-file reads, and sub-agent execution require a fresh approval.

For an explicitly authorized, prompt-free workspace session, use:

```bash
synapse chat --permission-mode workspace-auto --sandbox-backend auto
```

Shell commands in this mode run only through Bubblewrap (Linux) or Docker (Windows/Linux). If neither strict backend is available, command execution is denied rather than falling back to the host shell. PowerShell host commands continue to require approval because constrained language mode is not an OS sandbox.

### 🔌 MCP + Plugin Architecture
Connect any MCP-compatible server. Built-in plugin registry for extending functionality.

MCP servers are inert until their command and advertised capability manifest are explicitly trusted:

```bash
synapse mcp add local node ./server.mjs
synapse mcp trust local
synapse mcp list
```

Agent-selected web destinations also require a domain allowlist entry. Every redirect is revalidated and DNS is pinned to the checked public address:

```bash
synapse network allow docs.example.com
synapse network allow '*.example.org'
synapse network list
```

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

# Add ordered fallback models on the same endpoint. Fallback occurs only before
# any streamed output, so partial responses are never silently mixed.
synapse provider set company-gateway \
  --model company-model \
  --fallback-model company-model-small local-model

# Anthropic-compatible endpoints are also supported
synapse provider set private-anthropic \
  --base-url https://anthropic.example.com \
  --protocol anthropic \
  --auth x-api-key \
  --model private-model \
  --api-key-env PRIVATE_LLM_API_KEY

# Validate key, endpoint, protocol, and model with a one-token request
synapse provider test

# Diagnose local readiness (no network request by default)
synapse doctor

# Include a minimal live provider request
synapse doctor --live
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

```text
$ synapse doctor
Synapse Doctor v0.3.0
  [PASS] Node.js: 22.x
  [PASS] Data directory: ~/.synapse is readable and writable
  [PASS] Provider config: ~/.synapse/.synapse.json is valid
  [PASS] Provider: company-gateway / company-model via environment (SYNAPSE_API_KEY)

Result: ready (8 passed, 0 warnings, 0 failed)

$ synapse chat
  Synapse v0.3.0
  ● company-gateway / company-model

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
│   ├── providers/      # Presets plus arbitrary compatible endpoints
│   ├── soul/           # SoulLoader, Heartbeat, Dream, MemoryManager,
│   │                   # SelfImprovement, FakeExecutionWatchdog
│   ├── ui/             # REPL (Ink + Vim mode), Onboarding
│   └── services/       # MCP Client, Plugin Registry
├── dist/               # Built output (~287 KB)
└── tests/              # Unit, integration, protocol, and adversarial security tests
```

---

## Tool Permission Model

```
✅ Allow (no confirm):
  Workspace-scoped non-sensitive reads
  TodoWrite · GitStatus · GitDiff · Skill · AskUserQuestion

⚠️  Ask (confirm before):
  Bash · PowerShell · Task · FileEdit · FileWrite · NotebookEdit · GitCommit
  WebSearch · WebFetch · TTS · ImageGenerate · sensitive-file reads

🚫 Deny (always blocked):
  Workspace escapes · symlink/junction escapes · uninitialized policies
  malformed tool inputs · user-configured denied tools
```

---

## Configuration

Config stored in `~/.synapse/`:

| File | Purpose |
|------|---------|
| `.synapse.json` | Provider, model, endpoint |
| `.env` | API keys |
| `SOUL.md` | Agent personality |
| `AGENTS.md` / `CLAUDE.md` | Project instructions discovered from root to working directory |
| `permissions.json` | Tool permissions |
| `memory/` | Daily notes |
| `sessions/` | Session snapshots |
| `.learnings/` | Self-improvement records |

## Provider Payloads

Synapse sends each provider a system prompt assembled from an immutable safety kernel, `SOUL.md`, `MEMORY.md`, `AGENTS.md`/`CLAUDE.md`, active skills, and current runtime context. Repository instructions, skills, memory, tool output, and fetched content are explicitly lower priority than approval and isolation policy.

File tools are restricted to the startup directory and explicit `--add-dir` roots. Paths are checked lexically and through their real existing ancestors to block traversal and link escapes. Instruction-file `@include` directives are also confined to their owning root, including real-path checks for symlinks and junctions. Network tools require approval and reject loopback, private, and link-local destinations.

Strict shell auto-approval requires an operational Bubblewrap or Docker backend and fails closed when neither is usable. Availability is proven with a runtime isolation probe rather than a version check. Linux CI executes the selected strict backend to verify writable workspace mounts, host-path isolation, isolated networking, and a private PID namespace.

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
