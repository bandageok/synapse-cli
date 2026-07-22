# Synapse roadmap

This roadmap records intended direction, not a release promise. Work moves into a version only after its behavior and validation plan are clear.

## Shipped in v0.6.1

- Synchronized the English and Chinese public entry points with the real v0.6 command surface and verification evidence
- Added a release-metadata gate so package, runtime, changelog, and README versions cannot drift silently
- Clarified the inactive plugin boundary and linked the public documentation to ADR-0010

## Shipped in v0.6.0

- Made `synapse` the default interactive entry point and added bounded `synapse exec` automation
- Made `/model` update the real Provider request route, identity context, token counter, and session metadata
- Added atomic session persistence and `synapse resume --last`
- Replaced fabricated cross-provider price output with explicitly estimated `/usage` activity
- Made memory reload output reflect the actual per-turn reload behavior
- Kept third-party plugin commands, skills, and hooks inactive while validating their manifests
- Added ADR-0010 and regression tests for each corrected product claim

## Shipped in v0.5.1

- Added cancellable `429 Too Many Requests` recovery with `Retry-After` support and bounded exponential backoff
- Kept interactive work retrying until cancellation while bounding scripts and CI to eight retries by default
- Prevented rate limits from consuming agent turn budgets or opening the tool circuit breaker

## Shipped in v0.5.0

- Reworked the TUI around turn-centric conversation flow, folded tool summaries, and expandable audit details
- Added CJK-aware responsive rendering, bounded queued input, and alternate-screen operation
- Added command palette, approval panel, mode-aware composer, three-zone footer, and optional Timeline rail
- Added deterministic skill inventory backed by the actual loader

## Shipped in v0.4.0

- Replaced prefix-parsed transcript strings with structured terminal events
- Added streaming-safe Markdown, bounded previews, ANSI sanitization, and compact/expanded tool views
- Added OIDC trusted npm publishing and canonical package-bin validation
- Made strict sandbox probing tolerate cold Docker startup without silently weakening isolation

## Shipped in v0.3.3

- Added explicit `ask`, fail-closed `auto`, and warned `full-access` permission profiles
- Added persistent, launch-scoped, and live session permission switching with compatibility aliases
- Kept approval decisions and Bash isolation synchronized through shared runtime state
- Separated immutable Synapse/BandageOK product provenance from replaceable Provider and model identity
- Wired the local `IDENTITY.md` profile into context without allowing it to override product or safety facts
- Added sanitized runtime route disclosure and deterministic local answers for direct product-identity questions
- Added identity request-envelope, migration, injection-resistance, and no-Provider-call regression tests

## Shipped in v0.3.2

- Replaced provenance-unclear memory and Vim modules with documented local contracts
- Removed unused memory prompt and session-index code
- Made memory maintenance target the actual root index with atomic state and lease handling
- Removed executable `HEARTBEAT.md` tasks so background work cannot bypass tool authorization
- Added a provenance ADR, project case study, and interview preparation guide

## Shipped in v0.3.0

- Provider routing for OpenAI-compatible and Anthropic-compatible endpoints
- Persistent local memory, project instructions, and session resume
- Runtime tool schema validation and workspace path confinement
- Approval gates for writes, commands, network access, sensitive reads, and sub-agents
- Strict Bubblewrap or Docker execution for explicitly authorized workspace automation
- MCP trust fingerprints, capability drift detection, and trust revocation
- Domain allowlists, redirect validation, private-range rejection, and DNS pinning
- Provider-aware token accounting, compression quality checks, and bounded TUI rendering
- Windows and Linux CI across Node.js 18 and 22
- Adversarial tests for context trust, executable replacement, sandboxing, and cancellation

## Current priorities

### Adoption and documentation

- Validate onboarding with first-time users and record where they stop
- Publish reproducible provider examples for local models and common gateways
- Add a plugin authoring guide and a minimal reference plugin
- Keep English and Chinese quick-start paths in sync
- Build release notes around user-visible workflows instead of internal implementation batches

### Reliability

- Add macOS coverage and document the strict isolation options available there
- Publish startup, memory-loading, and long-output performance baselines
- Expand provider compatibility fixtures without placing live credentials in CI
- Add recovery tests for interrupted sessions and partially written local state

### Distribution, based on demand

- Evaluate Homebrew, Scoop, and standalone binaries after measuring operating-system demand
- Publish a small example repository that demonstrates memory, provider switching, and permissions
- Maintain a public compatibility table built from reproducible tests

## Later candidates

These items need user evidence before implementation:

- LSP-backed code intelligence
- PTY support for interactive subprocesses
- Session sharing with explicit redaction
- A plugin directory or registry
- Team-managed policy and memory synchronization

## Non-goals

- Hard-coding runtime behavior to one model vendor
- Sending usage telemetry without explicit opt-in
- Silently bypassing approval or isolation when a backend fails
- Treating generated output as completed work without verification
