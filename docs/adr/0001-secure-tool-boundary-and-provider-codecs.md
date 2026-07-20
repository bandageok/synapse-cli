# ADR-0001: Secure Tool Boundary and Provider Codecs

- Status: Accepted
- Date: 2026-07-19

## Context

Synapse currently trusts model-provided tool arguments after JSON parsing, grants
uninitialized registries implicit permission, and lets file tools consume absolute
paths without a workspace boundary. The OpenAI-compatible provider also flattens
tool calls and results into text, losing the protocol relationship between them.

These failures are systemic: fixing individual tools or adding more command
blacklist patterns would leave alternate execution paths open.

## Decision

1. `ToolRegistry` is the only authorization and validation boundary.
2. Tool arguments are validated against their JSON Schema before execution.
3. An uninitialized permission registry fails closed.
4. Write and execute capabilities always require an explicit human decision.
5. Child agents inherit a restricted clone of the parent registry and cannot
   widen permissions.
6. File-system tools resolve paths against explicit workspace roots and reject
   lexical, drive, UNC, symlink, and junction escapes.
7. Provider adapters own protocol-specific message codecs. Internal tool blocks
   remain provider-neutral, while each adapter preserves native call identifiers.
8. Provider requests have bounded timeouts and actionable transport errors.

## Consequences

- Existing tests that relied on implicit permissions must initialize an explicit
  test policy.
- Out-of-workspace reads now require a future explicit capability flow; the
  current implementation denies them.
- Child agents are read-only unless a later ADR defines scoped delegation with a
  complete, reviewable approval UI.
- Provider conformance is tested with multi-turn tool calls, not text-only smoke
  responses.

## Rejected Alternatives

- Command and path blacklists alone: bypassable and incomplete.
- Validation inside each tool: duplicates policy and leaves plugin/MCP paths open.
- Treating a parent `Task` approval as approval for arbitrary child actions: the
  current UI cannot display or bind that delegation safely.
