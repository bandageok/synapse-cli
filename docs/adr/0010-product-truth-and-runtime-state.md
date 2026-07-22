# ADR 0010: Product Truth and Runtime State

## Status

Accepted for v0.6.0.

## Context

Several commands described capabilities that were not connected to runtime behavior. `/model` changed only the TUI label, `/cost` applied one vendor's prices to every provider, `/memory reload` cleared an empty method, in-session `/resume` merged messages without changing the session identity, and plugin manifests declared executable surfaces that Synapse never loaded.

These mismatches are reliability defects. A coding agent must not claim that configuration, persistence, billing, memory, or extension behavior changed unless the underlying runtime changed and the result can be verified.

## Decision

1. Runtime model changes update the active Provider, product identity context, token counter, and session metadata together. Providers expose an explicit model getter/setter for this purpose.
2. Session files use validated identifiers and atomic temp-file replacement. Existing creation timestamps survive later saves; corrupt files do not prevent listing valid sessions.
3. `/cost` remains as a compatibility name with `/usage` as an alias. It reports measured activity and a clearly labeled local context estimate. It does not report currency until a provider supplies trustworthy usage and pricing data.
4. Memory files are re-read before every model turn. `/memory reload` therefore reports that memory is already live instead of pretending to clear a cache.
5. Resuming creates a distinct runtime session. The in-session command directs users to `synapse resume`; the top-level command owns session selection and supports `--last`.
6. Plugins are manifest-only packages in v0.6.0. Manifests are validated and may be inspected, installed, listed, or removed, but declared commands, skills, and hooks remain inactive.

## Plugin Trust Boundary

Executable plugin support requires all of the following before activation:

- an explicit trust decision tied to a content or command fingerprint;
- schema validation for every registered command and hook;
- workspace, network, and subprocess permissions no broader than built-in tools;
- provenance and collision handling for command and skill names;
- deterministic uninstall and rollback behavior;
- adversarial tests for path escape, symlink/junction escape, command injection, and permission inheritance.

Until those controls exist, executing plugin code would violate Synapse's fail-closed design. The CLI displays installed packages as `manifest-only; inactive`.

## Consequences

- Existing `/model`, `/cost`, `/memory reload`, and `/resume` inputs remain recognized, but their behavior is now truthful.
- Runtime model switching affects only the current process. Persisting the default model remains the responsibility of `synapse provider set`.
- Third-party plugin execution is intentionally unavailable in v0.6.0; installed manifests are inventory, not an execution boundary.
- Future provider usage events can replace local token estimates without changing the command contract.
