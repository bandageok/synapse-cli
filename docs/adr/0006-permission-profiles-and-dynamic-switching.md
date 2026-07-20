# ADR-0006: Permission Profiles and Dynamic Switching

- Status: Accepted
- Date: 2026-07-20
- Scope: approval policy, shell isolation, CLI configuration, interactive session state
- Updates: ADR-0002 permission-mode decision

## Context

Synapse previously exposed `ask` and `workspace-auto`. The latter safely automated workspace commands, but users who deliberately wanted host execution without repeated prompts had no supported control. In a non-interactive session, an `ask` decision also could not be satisfied, so the requested operation failed instead of providing a clear way to select a different policy.

The earlier design also coupled two independent questions:

1. Should Synapse ask before executing a tool?
2. Should shell execution use strict workspace isolation or the host?

[Codex's documented permission model](https://learn.chatgpt.com/docs/sandboxing) demonstrates the value of treating approval policy and sandbox policy as separate controls. Synapse adopts that separation through a smaller set of named profiles suited to its existing tool boundary.

## Decision

Synapse exposes three canonical profiles:

| Profile | Approval policy | Shell isolation | Intended use |
| --- | --- | --- | --- |
| `ask` | `on-request` | `host-after-approval` | Interactive, deliberate control |
| `auto` | `never` | `strict-workspace` | Unattended workspace-safe automation |
| `full-access` | `never` | `host` | Explicit trusted-host automation |

`workspace-auto` normalizes to `auto`; `yolo` normalizes to `full-access`.

The selected profile lives in one shared `PermissionManager`. ToolRegistry instances, cloned sub-agent registries, the Bash tool, slash commands, and the status bar read the same current value. A session switch therefore changes both the approval decision and Bash isolation atomically rather than leaving stale construction-time flags.

Users can select a profile at three scopes:

- Persistent: `synapse permissions set <mode>` writes the default to `.synapse.json` for new sessions.
- Launch: `synapse chat --permission-mode <mode>` and `synapse resume <id> --permission-mode <mode>` override one launch; `--yolo` selects `full-access`.
- Current interactive session: `/permissions <mode>` changes the shared manager without modifying the persisted default.
- Pending approval dialog: `F` or `Y` changes the shared manager to `full-access` before approving the current call; this remains session-only.

`auto` never asks. It allows workspace-confined reads and writes and tools with an independently enforced safe boundary. Bash must pass the strict Bubblewrap/Docker probe; otherwise it fails closed. Tools such as host PowerShell that cannot remain inside that boundary are denied with an explanation that names the active profile.

`full-access` never asks and Bash uses the host shell. Selecting it emits a warning. It does not disable runtime JSON Schema validation, explicitly denied tools, dangerous-command patterns, file-tool path inspection, MCP trust, outbound network policy, hooks, or audit logging. This is defense in depth, not a claim that host execution is safe.

Within `ask`, explicit policy precedence is `deniedTools` then `askForTools` then `allowedTools`. Sensitive-path inspection occurs before those per-tool allow entries. Restricted child registries keep read allow entries but tighten inherited write/execute/network allow entries back to `ask`. Every profile, tool class, boundary state, conflict, transition, and approval response is specified in [the permission test matrix](../PERMISSION-TEST-MATRIX.md).

An existing malformed permission file is an initialization error. It is not replaced with defaults because doing so could discard explicit deny entries. Permission policy writes use a same-directory temporary file and atomic rename.

## Consequences

- Users can intentionally choose no-prompt execution instead of encountering an unsatisfiable approval request in pipe or automated workflows.
- `auto` remains suitable for unattended use because lack of a strict sandbox causes denial rather than an approval prompt or host fallback.
- `full-access` is materially higher risk. A compromised model response or trusted Provider can run host commands with the user's operating-system privileges, subject only to the remaining defenses.
- A persisted `full-access` default affects future `chat` and `resume` sessions, so both paths display the warning.
- Existing `workspace-auto` scripts continue to work through normalization.

## Rejected Alternatives

- Make `yolo` bypass every validation layer: this would turn a convenience switch into a second execution engine and invalidate the centralized safety boundary.
- Prompt after `auto` denies a tool: that contradicts the `never` approval policy and breaks non-interactive automation.
- Store mode independently in the REPL, registry, and Bash tool: dynamic switching could update one component while another continued using stale policy.
- Persist `/permissions` changes automatically: a session experiment should not silently change future security posture.
