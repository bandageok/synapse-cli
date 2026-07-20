# Synapse CLI

<p align="center">
  <strong>Keep project memory when you switch models.</strong>
</p>

<p align="center">
  Synapse is an open-source, local-first coding agent for the terminal. It keeps project instructions and memory on your machine, connects to OpenAI-compatible and Anthropic-compatible endpoints, and fails closed when strict tool isolation is unavailable.
</p>

<p align="center">
  <a href="https://github.com/bandageok/synapse-cli/actions/workflows/ci.yml"><img src="https://github.com/bandageok/synapse-cli/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@bandageok/synapse-cli"><img src="https://img.shields.io/npm/v/@bandageok/synapse-cli?style=flat-square" alt="npm version" /></a>
  <img src="https://img.shields.io/node/v/@bandageok/synapse-cli?style=flat-square" alt="Node.js version" />
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/bandageok/synapse-cli?style=flat-square" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a>
</p>

![Synapse CLI demo](https://raw.githubusercontent.com/bandageok/synapse-cli/main/docs/assets/demo.gif)

The demo runs the real CLI against a deterministic local OpenAI-compatible endpoint. It verifies that project memory reaches the provider request. [Run it locally](./examples/demo/README.md).

## Quick start

Requires Node.js 18 or newer.

```bash
npm install -g @bandageok/synapse-cli
synapse onboard
synapse doctor
synapse chat
```

Use a provider preset, or configure any compatible endpoint:

```bash
# Preset provider
synapse provider set deepseek --api-key-env DEEPSEEK_API_KEY

# Custom OpenAI-compatible endpoint
synapse provider set company-gateway \
  --base-url https://llm.example.com/v1 \
  --protocol openai \
  --model company-model \
  --api-key-env COMPANY_LLM_API_KEY

# Check the endpoint with a one-token request
synapse provider test
```

Synapse stores keys in environment variables or `~/.synapse/.env`. It never writes a key into `.synapse.json` or prints the key value.

## Why Synapse

Synapse is useful when you want to change models or gateways without changing the rest of your coding workflow.

| Need | Synapse behavior |
| --- | --- |
| Move between providers | Provider routing is configured by protocol, auth method, BaseURL, model, and key environment variable. |
| Keep project context | `AGENTS.md`, `CLAUDE.md`, `SOUL.md`, and curated memory load from local files. |
| Control risky tools | Writes, shell commands, network access, sensitive reads, and sub-agents require permission. |
| Automate without host-shell fallback | `workspace-auto` runs shell commands only through a working Bubblewrap or Docker backend. |
| Inspect what happened | Permission decisions and tool lifecycle events are recorded in `logs/audit.jsonl`. |

Synapse does not claim that these ideas are unique. The project focuses on making provider portability, persistent context, and strict execution boundaries work together in one inspectable CLI.

## A normal workflow

```bash
# See available providers and credential status
synapse provider list

# Ask a one-off question from a script
echo "Explain the failing test" | synapse chat --pipe

# Search local project memory
synapse memory search "release convention"

# Connect an MCP server, then inspect and trust it before first use
synapse mcp add local node ./server.mjs
synapse mcp trust local

# Allow a domain before an agent-selected web request
synapse network allow docs.example.com
```

## Safety model

The default permission model is `allow`, `ask`, or `deny` per tool. Non-sensitive workspace reads can run without a prompt. Writes, command execution, network access, sensitive-file reads, Git commits, and sub-agent execution require approval.

For an explicitly authorized workspace session:

```bash
synapse chat --permission-mode workspace-auto --sandbox-backend auto
```

Strict auto-approval requires an operational Bubblewrap or Docker backend. Synapse runs a real isolation probe before use and denies command execution if no strict backend works. PowerShell host commands still require approval because constrained language mode is not an operating-system sandbox.

MCP servers remain inactive until their command, referenced scripts, and advertised capabilities are trusted. Network redirects are revalidated, private address ranges are rejected, and requests are pinned to the checked public address.

Read the decisions behind these boundaries:

- [Secure tool boundaries and provider codecs](./docs/adr/0001-secure-tool-boundary-and-provider-codecs.md)
- [Isolation, MCP trust, network policy, context, and TUI controls](./docs/adr/0002-isolation-trust-network-context-and-tui.md)
- [Trusted context and executable identity](./docs/adr/0003-trusted-context-and-executable-identity.md)

## Memory and configuration

Synapse keeps local state under `~/.synapse/` by default.

| Path | Purpose |
| --- | --- |
| `.synapse.json` | Active provider, model, protocol, and endpoint |
| `.env` | API keys, excluded from normal command output |
| `SOUL.md` | Agent behavior and identity |
| `MEMORY.md` | Curated long-term memory |
| `memory/` | Daily notes |
| `AGENTS.md` / `CLAUDE.md` | Project instructions discovered from root to working directory |
| `permissions.json` | Tool permission policy |
| `sessions/` | Resumable session snapshots |

Memory operations are explicit and scriptable:

```bash
synapse memory inspect
synapse memory search "project convention"
synapse memory prune --older-than 90          # preview
synapse memory prune --older-than 90 --yes    # delete
synapse memory export memories.json
```

Search and export exclude session transcripts unless `--include-sessions` is supplied.

## What is included

- Interactive Ink REPL with Vim editing
- OpenAI-compatible and Anthropic-compatible provider codecs
- File, shell, search, Git, notebook, web, image, TTS, and sub-agent tools
- MCP client and local plugin registry
- Context compression with provider-aware token accounting
- Session resume, persistent memory, and project instruction discovery
- Runtime schema validation, audit logging, and workspace path isolation

## Verification

The `v0.3.1` release is covered by 269 tests across unit, integration, protocol, CLI, and adversarial security paths. CI runs Node.js 18 and 22 on Windows and Linux. A separate Linux job executes the strict sandbox and checks workspace writes, host-path isolation, disabled networking, and private PID visibility.

Run the same checks locally:

```bash
npm ci
npm run lint
npm test
npm run build
npm pack --dry-run
npm audit
```

## Project status

Synapse is early-stage software. `v0.3.1` is usable and tested, but command names and configuration details can still change before `v1.0.0`. See the [current roadmap](./docs/ROADMAP.md) and [changelog](./CHANGELOG.md).

## Contributing

Bug reports, provider compatibility findings, documentation fixes, and focused pull requests are welcome. Start with [CONTRIBUTING.md](./CONTRIBUTING.md), open a [Discussion](https://github.com/bandageok/synapse-cli/discussions) for design questions, or use the issue forms for a reproducible bug or feature request.

Please report security issues through the process in [SECURITY.md](./SECURITY.md), not a public issue.

## License

MIT. See [LICENSE](./LICENSE).
