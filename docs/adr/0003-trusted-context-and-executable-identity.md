# ADR-0003: Trusted Context Boundaries and Executable Identity

- Status: Accepted
- Date: 2026-07-20
- Scope: system prompt assembly, project instructions, skills, MCP trust, nested agent cancellation

## Context

Adversarial review found two release-blocking trust failures:

- A repository instruction file can use `@include` to read a file outside the workspace. The content is then placed in the provider system prompt without going through tool permissions.
- MCP trust covers only command text, arguments, working directory, and environment. Replacing a referenced script at the same path keeps the command trusted, and the changed code runs before its capability manifest is checked.

The same review found that repository instructions are described as overriding default behavior, `AGENTS.md` is not discovered, every skill is activated at TUI startup, and nested Task runs do not inherit cancellation.

## Decision

### Immutable safety kernel

Synapse emits a built-in safety kernel before all configurable content and a safety seal after it. The kernel defines tool input validation, human authorization, workspace boundaries, and untrusted-content handling. `SOUL.md`, skills, repository instructions, memory, tool output, and fetched content may shape the task but may not weaken those invariants.

This is defense in depth. Prompt ordering is not treated as an enforcement boundary; ToolRegistry, sandbox, network policy, and MCP trust remain authoritative.

### Instruction discovery and isolation

Synapse supports `AGENTS.md` and `CLAUDE.md` at user, project, local, and `.synapse` scopes. Project files are loaded from filesystem root to the working directory so that more specific guidance appears later.

An `@include` is accepted only when all of the following are true:

- it is relative to the owning instruction root;
- its lexical path remains within that root;
- its real path remains within that root after symlink or junction resolution;
- include depth, file count, per-file size, and aggregate instruction budgets are not exceeded.

Absolute paths, home-relative paths, cross-root traversal, and link escapes are rejected. Rejected includes are omitted from provider payloads.

### Skill activation

Discovery resets stale state. Skills activate only through an explicit name/trigger match or a valid path rule. TUI startup does not synthesize a name match for every installed skill.

### MCP executable identity

The command fingerprint binds configuration to executable identity. It includes the resolved command executable and hashes existing local file arguments, such as `node server.mjs`. A changed executable or referenced script invalidates trust before process creation.

Capability inspection remains a separate explicit trust action because inspecting an MCP server necessarily executes it. Normal connection never starts a server whose executable identity has changed.

### Cancellation

The parent request AbortSignal is propagated to in-process Task engines and terminates spawned Task processes. Cancellation is reported as an error result and is not converted into successful completion.

## Impact and Safety Audit

| Affected module/file | Change | Agent behavior risk | Mitigation |
| :--- | :--- | :--- | :--- |
| `src/core/Context.ts` | Modify | Stronger prompt precedence may change model behavior | Repeat a concise safety kernel and retain configurable personality below it |
| `src/core/MemoryLoader.ts` | Modify | Existing cross-root includes stop loading | Fail closed, retain valid root-local includes, add deterministic limits |
| `src/skills/AutoLoader.ts` | Modify | Fewer skills may auto-activate | Preserve explicit trigger/name activation and test path activation |
| `src/ui/REPL.tsx` | Modify | Startup no longer activates all skills | Match skills from the actual user request |
| `src/services/mcp/trust.ts` | Modify | Legitimate script updates require re-trust | Surface fingerprint change before spawn; explicit trust command remains available |
| `src/tools/TaskTool.ts` | Modify | Cancellation can interrupt nested work | Propagate AbortSignal and terminate spawned process before returning |

## Rejected Alternatives

- Prompt-only warnings without path enforcement: repository text could still be exfiltrated before the model sees the warning.
- Capability-only MCP checks: changed code already executes before capabilities can be queried.
- Hashing only command-line strings: same-path script replacement remains invisible.
- Loading all skills for convenience: it expands system context and grants unrelated instructions system-message influence.
