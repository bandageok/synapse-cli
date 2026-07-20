# ADR-0002: Isolation, Trust, Network, Context, and TUI Control Plane

- Status: Accepted
- Date: 2026-07-20
- Scope: shell execution, MCP startup, outbound HTTP, context compression, interactive streaming

## Context

Synapse currently has policy checks, but several controls are advisory rather than enforceable:

- `sandbox: true` falls back to the host shell on Linux and Windows.
- configured MCP commands start before the user has trusted their executable identity or capabilities.
- URL validation checks literal addresses but does not pin DNS results for the connection.
- context thresholds use character heuristics and compression has no retention score.
- the TUI cannot cancel an active request and renders every token immediately.

These gaps are especially dangerous in an agent because model output is untrusted and repeated autonomously.

## Decision

### Permission modes and process isolation

Synapse exposes two permission modes:

- `ask` (default): every state-changing or network capability requires a fresh decision.
- `workspace-auto`: the command-line flag is a session-scoped human authorization for workspace-bounded operations. Shell execution is allowed without another prompt only when a strict sandbox backend is available.

There is deliberately no unsandboxed `skip all permissions` mode. Such a mode conflicts with the project's invariant that state-changing host operations require human authorization.

Strict shell isolation is provided by:

- Linux: Bubblewrap with a read-only host view, writable workspace binds, a private user/PID namespace, and an unshared network namespace by default. The invoking user is mapped to UID/GID 0 only inside the new user namespace so Bubblewrap can configure isolated loopback without host privileges.
- Windows and Linux fallback: Docker with a read-only container root, explicit workspace bind, dropped capabilities, no-new-privileges, PID/memory limits, and network disabled by default.

On Linux, Docker runs with the invoking host UID/GID so writable workspace mounts remain usable after all capabilities are dropped. It does not run as container root and does not restore `DAC_OVERRIDE`.

Backend discovery executes a minimal isolation probe. A Bubblewrap binary that exists but cannot create the required user, PID, and network namespaces is treated as unavailable, allowing `auto` to try Docker. Version output alone is not evidence of a usable sandbox.

If the requested backend is missing or cannot prove isolation, execution fails closed. No strict mode may silently fall back to the host shell.

### MCP trust

MCP configuration and trust are separate records. A command fingerprint is SHA-256 over canonical command, arguments, working directory, and environment values. Secret values are never displayed or stored in plaintext in the trust record.

An untrusted or changed fingerprint is never spawned. After initialization, Synapse records a normalized capability manifest containing server capabilities and the names of tools, resources, and prompts. A changed manifest locks the server until the user explicitly trusts the new capability fingerprint.

### Network policy

User-controlled outbound URLs must match an exact or wildcard domain allowlist. DNS is resolved once per hop; all answers are checked for loopback, private, link-local, multicast, documentation, and unspecified ranges. The HTTP/TLS socket connects to the selected validated address while preserving the original Host header and TLS server name. Redirects repeat the full policy and resolution process.

Provider endpoints and fixed vendor APIs remain separately configured trusted channels; this ADR applies to agent-selected destinations.

### Token accounting and compression quality

Token counts carry a method label: `exact`, `provider`, or `estimated`. Exact local tokenization is used only for a known tokenizer family. Providers may implement an authoritative asynchronous count endpoint. Unknown models use a conservative estimator and are never reported as exact.

Every compression records reduction ratio, protected-fact retention, recent-message retention, and tool-call integrity. A candidate below the configured quality floor is rejected instead of replacing history.

### TUI control plane

One `AbortController` owns each active agent run and is propagated through provider streams and tools. Ctrl+C cancels an active run; Ctrl+C exits only when idle. Streaming tokens enter a bounded coalescing buffer and update React at a fixed cadence. Full messages remain in session state while rendering uses a line-bounded viewport with explicit truncation markers.

## Consequences

- Strict auto mode can be unavailable until Bubblewrap or Docker is installed.
- Docker sandbox commands run in a configured image and may not contain every host tool.
- A newly added MCP server requires an explicit trust command before it can start, and capability changes require re-trust.
- Network destinations must be declared before WebFetch can reach them.
- Compression may happen later when a trustworthy tokenizer is unavailable because estimates include a safety margin.
- Batched rendering adds a small latency (tens of milliseconds) while preventing render storms.

## Rejected alternatives

- Regex-only command blocking: shell syntax is too expressive and bypassable.
- Windows PowerShell constrained language as the sole sandbox: it does not isolate native child processes, files, or network.
- Resolving a hostname only for validation and then calling `fetch(hostname)`: the connection can resolve a different address.
- Calling all token estimates exact: thresholds would be misleading and provider/model-dependent.
- Dropping old TUI messages from state: it reduces rendering cost but corrupts session history.
