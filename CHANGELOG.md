# Changelog

All notable changes to Synapse are documented in this file.

## Unreleased

## 0.3.3 - 2026-07-20

- Added `ask`, `auto`, and `full-access` permission profiles with separate approval and shell-isolation semantics.
- Added persisted `synapse permissions set`, launch-scoped `--permission-mode`/`--yolo`, and session-scoped `/permissions` switching backed by shared runtime state.
- Kept `workspace-auto` as a compatibility alias, made strict `auto` deny instead of prompt or fall back, and warned before no-prompt host execution.
- Added unit, CLI persistence, slash-command, and real Bash tool round-trip regression tests for permission switching.
- Added an immutable Synapse/BandageOK product identity contract that distinguishes the CLI from its replaceable inference provider.
- Wired `IDENTITY.md` into context assembly, auto-created it for existing data directories, and prevented it from overriding product provenance or safety rules.
- Added sanitized runtime provider/model disclosure and explicit correction of stale identity claims in resumed conversations.
- Added deterministic unit and real-CLI request-envelope regression tests plus ADR-0005.
- Answered explicit product-identity questions locally before Provider invocation so model compliance cannot change product provenance.

## 0.3.2 - 2026-07-20

- Replaced the provenance-unclear Dream and Vim modules with documented project-local contracts and regression tests.
- Removed unused memory prompt and session-index modules that were not connected to the runtime.
- Added deterministic root `MEMORY.md` maintenance with exclusive leases, stale-lock recovery, atomic writes, and legacy timestamp migration.
- Removed the Heartbeat host-shell bypass; `HEARTBEAT.md` is now descriptive and cannot create executable scheduled tasks.
- Fixed Vim command reset, `d0`, and bounded operator-count behavior.
- Added a provenance remediation ADR, a Chinese project case study, and a commit-backed Chinese interview guide.
- Included the offline demo, demo asset, case study, and interview guide in the npm package.

## 0.3.1 - 2026-07-20

- Reworked the public README around project memory, provider portability, and verified tool boundaries.
- Added English and Chinese quick-start paths plus a reproducible offline CLI demo.
- Replaced the stale v0.3.0 implementation checklist with a current, evidence-driven roadmap.
- Added contribution, conduct, security, issue, and pull request guidance for public collaboration.
- Added a launch kit, tracked measurement targets, and deterministic README and social-preview assets.

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
- Added a Linux CI job that executes commands inside the selected strict backend and proves workspace, host filesystem, network, and PID isolation at runtime.
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
