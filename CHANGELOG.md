# Changelog

All notable changes to Synapse are documented in this file.

## Unreleased

## 0.3.0 - 2026-07-20

- Added a fail-closed tool registry with runtime JSON Schema validation and detailed self-correction errors.
- Restricted file tools to explicit workspace roots, including traversal and symlink/junction escape checks.
- Made write, execute, network, sub-agent, and sensitive-read capabilities require explicit approval.
- Fixed child-agent permission inheritance and removed shell-string construction from Git and Grep tools.
- Preserved OpenAI-compatible `tool_calls` and `tool_call_id` messages across multi-turn conversations.
- Added provider request timeouts and explicit same-endpoint fallback models that only switch before partial output.
- Added adversarial security, provider protocol, fallback, and agent turn-limit regression tests.
- Added strict Bubblewrap/Docker shell isolation and session-scoped `workspace-auto` permission mode; strict mode fails closed when no backend is available.
- Added MCP first-use trust with command/environment fingerprints, capability manifests, schema drift detection, and trust revocation.
- Added an outbound domain allowlist with per-hop DNS resolution, private-range rejection, and IP-pinned HTTP/TLS connections.
- Added provider/model-aware token accounting plus compression reduction and retention quality metrics.
- Added end-to-end request cancellation, coalesced streaming updates, and bounded long-output rendering in the TUI.
- Added an immutable safety kernel and lower-trust boundaries for repository instructions, skills, memory, tool output, and fetched content.
- Added `AGENTS.md` discovery, root-confined `@include` resolution, symlink/junction escape rejection, aggregate instruction budgets, and per-turn instruction refresh.
- Bound MCP trust to resolved executable and referenced local script content so same-path code replacement invalidates trust before spawn.
- Fixed unintended activation of every installed skill and propagated cancellation into in-process and spawned Task agents.
- Added adversarial regression tests for context exfiltration, MCP code replacement, skill activation, and nested-agent cancellation.
- Added a Linux CI job that executes commands inside Bubblewrap and proves workspace, host filesystem, network, and PID isolation at runtime.
- Made compression reject summaries that drop explicit approval or prohibition constraints.
- Added cooperative streaming backpressure and bounded scanning for million-character TUI output.

## 0.2.3 - 2026-07-19

- Updated configuration documentation to use the scoped npm package and arbitrary compatible BaseURL workflow.
- Removed the legacy identity from the generated template.
- Refreshed README architecture and test/build statistics.

## 0.2.2 - 2026-07-19

- Reworked onboarding into a predictable provider, model, key, connection test, and security flow.
- Added numeric provider selection, editable model IDs, masked API keys, back navigation, retry, and explicit save-anyway behavior.
- Improved provider connectivity errors with BaseURL, timeout, authentication, rate-limit, and endpoint hints.
- Added end-to-end tests for the interactive onboarding UI and a real OpenAI-compatible streaming conversation.
- Kept Ctrl+C responsive while a provider request is in progress.

## 0.2.1 - 2026-07-19

- Replaced the engine-starting `doctor` command with a side-effect-free readiness report.
- Added `synapse doctor --json` for scripts and `synapse doctor --live` for provider connectivity checks.
- Added validation for provider configuration, API key presence, data files, MCP configuration, and plugin manifests.
- Patched production dependency vulnerabilities in `form-data` and `ws`.
- Added Linux and Windows CI gates for Node.js 18 and 22.

## 0.2.0 - 2026-07-19

- Added provider list, set, and live test commands with custom BaseURL support.
- Added memory inspect, search, prune, and export commands.
- Published the package as `@bandageok/synapse-cli`.
