# Changelog

All notable changes to Synapse are documented in this file.

## Unreleased

## 0.6.0 - 2026-07-22

- Made `synapse` launch the interactive CLI by default, accepted a direct initial task, and added `synapse exec <prompt>` as the automation-oriented alias for bounded pipe execution.
- Made unconfigured automation fail with an actionable non-TTY error instead of starting Ink onboarding or returning a false success.
- Replaced display-only `/model` switching with one runtime transaction that updates the active Provider request model, identity context, token counter, and session metadata.
- Replaced vendor-specific `/cost` guesses with `/usage`-compatible, explicitly estimated session activity and removed fabricated currency output.
- Made session writes atomic, preserved creation timestamps, rejected unsafe session ids, skipped corrupt entries during listing, and persisted normal, local, failed, cancelled, and exit paths without silently swallowing failures.
- Added `synapse resume --last`, restored the saved model when resuming, and prevented in-session `/resume` from merging a transcript under the wrong session identity.
- Clarified that memory files reload before every model turn instead of claiming to clear a nonexistent cache.
- Validated plugin manifests and labeled installed packages as `manifest-only; inactive`; executable commands, skills, and hooks remain fail-closed until a trusted runtime exists.
- Added ADR-0010 and regression coverage for direct and exec entry points, runtime model requests, session atomicity and path boundaries, truthful usage and memory output, resume identity, and invalid plugin manifests.

## 0.5.1 - 2026-07-22

- Kept interactive tasks alive across provider `429 Too Many Requests` responses with cancellable retries, `Retry-After` support, and bounded exponential backoff.
- Kept pipe and CI use bounded to eight retries by default while allowing `SYNAPSE_RATE_LIMIT_RETRIES=-1` for retry-until-cancelled behavior.
- Prevented rate limits from opening the tool circuit breaker or consuming the agent turn limit, and surfaced retry progress without contaminating pipe-mode stdout.
- Added unit, Provider metadata, Engine budget, cancellation, Node 18, and real CLI round-trip coverage for rate-limit recovery.

## 0.5.0 - 2026-07-21

- Reworked the default terminal transcript around user prompts, one stable turn activity, and assistant answers instead of a shortened tool log.
- Folded completed tool runs into `Worked N steps` summaries, grouped repeated failures by root-cause fingerprint, and kept full inputs, outputs, and traces in the expanded audit view.
- Added turn-scoped `Ctrl+O` details, responsive row-based viewport slicing, CJK-aware display widths, bounded composer input, and one consistent long-content omission marker.
- Reduced status and footer noise, added terminal-native Markdown links, and preserved failure counts and actionable causes in narrow terminals.
- Kept the composer editable while a turn runs, queued bounded follow-up messages instead of starting concurrent Engines, and displayed the queue in the bottom pane.
- Made `Esc` interrupt the active turn through its abort signal and rendered user cancellation as neutral state rather than a failed issue.
- Replaced the placeholder `Skill` tool with loader-backed list/show behavior and answered explicit skill inventory questions deterministically without unnecessary Provider or filesystem scans.
- Preserved active skill state across loader rebuilds and unified slash-command, tool, pipe, and interactive skill inventory output.
- Added conversation, running, failure aggregation, expanded audit, CJK, narrow-terminal, queue, cancellation, Markdown, skill-query, and row-virtualization regression tests.
- Documented the clean-room interaction study of Codex CLI, Claude Code, Hermes Agent, and Qwen Code in ADR-0009.
- Added a responsive blue-purple-pink Synapse wordmark, mode-aware bordered composer, three-zone footer, and optional wide-terminal Timeline rail while preserving the single-column narrow layout.
- Added a registry-backed slash-command palette with bounded candidates and keyboard navigation, plus bordered expanded tool cards and a bounded approval panel with numeric or mnemonic actions.
- Enabled alternate-screen rendering for interactive TTY sessions with an explicit inline-mode environment escape hatch.

## 0.4.0 - 2026-07-21

- Rebuilt the interactive terminal around structured user, assistant, tool, and notice items instead of prefix-parsed strings.
- Added automatic successful-tool folding, always-visible failures, ANSI-safe output previews, stable tool ids, durations, and `Ctrl+O` or `/details` compact/expanded views.
- Replaced the unused terminal Markdown implementation with a streaming-safe semantic renderer and added responsive status, composer, and footer layouts.
- Bound assistant previews by visual rows and terminal width, including single-line content that wraps on screen.
- Sanitized ANSI control sequences across tool output, Provider responses, user text, and notices before terminal rendering.
- Added structured failure events for schema, hook, and permission rejections without executing the rejected tool.
- Added OIDC trusted npm publishing and fixed the canonical package `bin` path so global installs retain the `synapse` command.
- Normalized the dependency lockfile to the canonical npm registry and added a pre-install release gate that rejects foreign registry URLs.
- Retried strict sandbox backend probes only after an explicit timeout so cold Docker daemons do not produce false unavailable results.

## 0.3.3 - 2026-07-20

- Added `ask`, `auto`, and `full-access` permission profiles with separate approval and shell-isolation semantics.
- Added persisted `synapse permissions set`, launch-scoped `--permission-mode`/`--yolo`, and session-scoped `/permissions` switching backed by shared runtime state.
- Kept `workspace-auto` as a compatibility alias, made strict `auto` deny instead of prompt or fall back, and warned before no-prompt host execution.
- Added unit, CLI persistence, slash-command, and real Bash tool round-trip regression tests for permission switching.
- Added an executable 90-case permission state matrix plus CLI and Provider round trips for every approval profile.
- Added `npm run test:permissions` as the repeatable permission release gate.
- Added read-only `synapse permissions list|get|show` aliases and verified that they never create or mutate configuration.
- Added an in-dialog `F`/`Y` action that switches the current session to `full-access` before allowing the pending tool call, with dedicated component tests.
- Fixed ineffective high-risk `allowedTools`, disabled-tool pre-authorization, child-registry allowlist inheritance, cross-directory default-policy mutation, and allow/ask conflict recovery.
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
