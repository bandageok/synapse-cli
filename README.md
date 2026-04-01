# C.C.Claw

> Claude Code × Claw — An open-source CLI agent framework with personality.

## Features

- 🧠 **Personality System** — SOUL.md defines your agent's behavior and tone
- 💾 **Persistent Memory** — 4-category memory with 200-line auto-management
- 🔧 **12 Core Tools** — Bash, File ops, Web search, Sub-agents, and more
- 🔄 **AsyncGenerator Engine** — Same architecture as Claude Code
- 📦 **Plugin System** — Extend with custom tools, skills, and hooks
- 🔒 **Data Sanitized** — Zero personal info in codebase

## Quick Start

```bash
npm i -g cclaw
export ANTHROPIC_API_KEY=sk-ant-xxx
# or
export OPENROUTER_API_KEY=sk-or-xxx

cclaw chat
```

## Commands

| Command | Description |
|---------|-------------|
| `cclaw chat` | Start interactive chat |
| `cclaw doctor` | Diagnose configuration |
| `cclaw resume` | Resume a session (coming soon) |

## Configuration

```
~/.cclaw/
├── SOUL.md       # Agent personality
├── MEMORY.md     # Long-term memory (4 categories, 200-line limit)
├── memory/       # Daily logs + archives
├── sessions/     # Saved sessions
└── .cclaw.md     # User-level config
```

### Project-level config

Place a `.cclaw.md` in your project root for project-specific instructions.

### SOUL.md Example

```markdown
# SOUL.md

You are a concise, helpful assistant.
- Always verify before answering
- Prefer editing over creating files
- Report errors with root cause analysis
```

## Architecture

```
CLI (Commander) → REPL (Ink) → Engine (AsyncGenerator)
                                    ↓
                              Context (6 layers)
                              1. Default prompt
                              2. SOUL.md personality
                              3. Memory mechanics
                              4. User/Project config
                              5. System context
                              6. Dynamic reminders
                                    ↓
                              Provider (Anthropic / OpenRouter)
                                    ↓
                              Tools (12) + Hooks + Compressor
```

## Tools

| Tool | Permission | Description |
|------|------------|-------------|
| Bash | execute | Shell command execution |
| FileRead | read | Read files with offset/limit |
| FileEdit | write | Find-and-replace editing |
| FileWrite | write | Create/overwrite files |
| Glob | read | Find files by pattern |
| Grep | read | Search file contents |
| WebSearch | network | Web search (Tavily API) |
| WebFetch | network | Fetch URL content |
| Agent | execute | Spawn sub-agents |
| TodoWrite | read | Task tracking |
| AskUserQuestion | read | Clarifying questions |
| Skill | read | Skill invocation |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (preferred) |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `TAVILY_API_KEY` | Tavily search API key |
| `CCLAW_DATA_DIR` | Custom data directory (default: `~/.cclaw`) |

## Development

```bash
git clone https://github.com/cclaw/cclaw.git
cd cclaw
npm install
npm run dev    # Run with tsx
npm test       # Run tests
npm run build  # Build to dist/
```

## License

MIT
