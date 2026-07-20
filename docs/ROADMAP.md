# Synapse roadmap

This roadmap records intended direction, not a release promise. Work moves into a version only after its behavior and validation plan are clear.

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
