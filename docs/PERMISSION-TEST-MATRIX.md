# Permission Test Matrix

This document is the executable acceptance contract for Synapse permissions. It separates the finite authorization state machine, which is exhaustively enumerated, from operating-system and third-party behavior, which is covered by representative runtime and adversarial tests.

## Decision Order

`ToolRegistry.checkPermission()` must apply these rules in order:

1. Deny an unknown, disabled, schema-invalid, or uninitialized tool.
2. Deny a path outside the workspace or a path that escapes through a link.
3. Deny every tool named in `deniedTools`, in every profile.
4. In `full-access`, allow the remaining enabled and valid tools.
5. For sensitive workspace paths, ask in `ask` and deny in `auto`.
6. In `auto`, allow reads, writes, and tools that enforce their own workspace/network boundary; deny all other tools. Never return `ask`.
7. In `ask`, `askForTools` wins over `allowedTools` if a malformed policy contains the same name in both lists.
8. In `ask`, explicitly allowed tools run without another prompt; otherwise reads run and write/execute/network tools ask.

The execution layer still applies tool-specific checks after authorization. `full-access` does not bypass dangerous-command patterns, MCP trust, network destination policy, hooks, or audit logging.

## Finite State Matrix

| Dimension | Enumerated states | Expected invariant |
| --- | --- | --- |
| Profile | `ask`, `auto`, `full-access` | Every tool decision is exactly one of allow/ask/deny |
| Tool class | read, write, execute, network | All four classes are exercised in every profile |
| Independent boundary | bounded, unbounded | `auto` permits only bounded execute/network tools |
| Path | normal, sensitive, outside workspace | Sensitive ask/deny/allow follows profile; outside always denies |
| Policy | unlisted, allowed, ask, denied, conflicting | deny > ask > allow in `ask`; `auto`/`full-access` never prompt |
| Tool state | unknown, disabled, invalid schema, enabled | Only enabled, registered, schema-valid tools reach profile logic |
| Registry state | initialized, uninitialized | Uninitialized always denies |
| Approval response | absent, reject, approve | `ask` executes only after approve; other profiles do not request it |
| Transition | ask -> auto -> full-access and aliases | Parent, Bash, REPL, and restricted child read one shared mode |
| Configuration | missing, valid, malformed, overlapping, cross-directory | Defaults do not mutate globally; invalid existing files fail closed; conflicts recover deterministically |

These combinations are table-driven in `tests/permission-matrix.test.ts`. Adding a profile, tool permission class, or policy state requires updating the table before implementation is accepted.

## User Entry Points

| Entry point | Scope | Automated proof |
| --- | --- | --- |
| `synapse permissions [list|get|show]` | Read-only status | Equivalent output and no configuration mutation |
| `synapse permissions set <mode>` | Future sessions | Valid values, aliases, invalid values, non-mutation on error |
| `synapse chat --permission-mode <mode>` | One launch | Invalid/conflicting options exit 2; launch value overrides persisted value |
| `synapse chat --yolo` | One launch | Real Bash tool call executes and returns output without approval |
| `synapse resume <id> --permission-mode/--yolo` | One resumed launch | Shared option resolver and CLI help contract |
| `/permissions <mode>` | Current interactive session | All profiles, invalid input, unavailable switch, status output |
| Approval dialog `F`/`Y` | Current interactive session | Switch mode before resolving the current call; `A`/`D` remain one-shot decisions |
| Persisted default | New chat/resume | Real pipe conversation uses persisted `auto` without a launch flag |

## Engine Event Matrix

| Profile | Tool boundary | Approval handler | `permission_ask` | Executes |
| --- | --- | --- | --- | --- |
| ask | unbounded | absent | once | no |
| ask | unbounded | reject | once | no |
| ask | unbounded | approve | once | yes |
| auto | unbounded | absent | never | no |
| auto | bounded | absent | never | yes |
| full-access | unbounded | absent | never | yes |

The same states are tested through the Engine and through real OpenAI-compatible CLI round trips. The Provider receives a deterministic tool result for denied ask/auto calls instead of the CLI hanging for input.

## Runtime and Adversarial Coverage

- Windows host-shell execution is exercised by the real `--yolo` CLI round trip and clean-package smoke test.
- Linux strict isolation runs in CI with Bubblewrap or Docker and verifies workspace writes, host-path isolation, disabled networking, and private PID visibility.
- Dangerous Bash patterns and explicit deny policy remain active in `full-access`.
- Permission-dialog key mapping, full-access-before-resolve ordering, visible choices, and oversized-input truncation have component tests.
- Schema errors, sensitive files, traversal, symlink/junction escape, private network destinations, MCP executable replacement, and child-registry restriction have dedicated regression tests.

## Completion Gate

A permission change cannot be released until all of the following pass:

1. `npm run test:permissions` for the matrix, dialog, security, CLI, Provider round trips, and sandbox policy.
2. Type check and complete test suite.
3. Production build and package dry run.
4. Dependency audit.
5. Clean tarball installation and installed CLI smoke test.
6. Windows/Linux Node.js CI and strict sandbox runtime CI.

No finite test suite can enumerate every shell program, operating-system failure, Provider response, or third-party service condition. Those unbounded spaces are handled with centralized validation, fail-closed defaults, representative runtime tests, adversarial cases, and a requirement to add a regression row whenever a new failure class is found.
