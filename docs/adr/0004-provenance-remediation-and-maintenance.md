# ADR-0004: Provenance Remediation and Deterministic Maintenance

- Status: Accepted
- Date: 2026-07-20
- Scope: memory maintenance, session indexing, Vim command parsing, Heartbeat execution, legacy design notes

## Context

Several source files described themselves as "ported from" or "simplified from"
Claude Code. Three internal planning documents also described implementation work
as source-aligned or architecturally identical. Those statements created an
unresolved provenance risk: the repository did not contain evidence sufficient to
show which parts were original, behaviorally inspired, or translated from another
implementation.

Removing those comments alone would not resolve the problem. The affected behavior
needed a current Synapse contract, replacement code, regression tests, and a record
of what remains uncertain.

This remediation is not described as a legal clean-room process. The maintainers
and the implementation agent had already seen the prior files, and Git history still
contains them. This ADR records engineering remediation, not a legal opinion about
historical code ownership or licensing.

## Audit Inventory

| Previous path | Finding | Current disposition |
| --- | --- | --- |
| `src/soul/Dream.ts` | Marked as ported; maintained `memory/MEMORY.md`, while the runtime injects root `MEMORY.md`; lock acquisition was not atomic | Removed and replaced by `MemoryMaintenance.ts` |
| `src/soul/MemoryExtractor.ts` | Marked as ported; prompt builders were not connected to a provider call | Removed as unused functionality |
| `src/soul/SessionIndex.ts` | Marked as simplified; imported only by its own tests and not connected to session resume or memory search | Removed as dead code |
| `src/vim/types.ts` | Marked as simplified | Rewritten around a small prompt-line command vocabulary |
| `src/vim/transitions.ts` | Marked as simplified; completed commands could leave a partial command state active | Rewritten as an explicit four-state parser with reset semantics |
| `src/soul/Heartbeat.ts` | Not marked as ported, but executed command blocks from `HEARTBEAT.md` through the host shell | Rewritten as an in-process scheduler; user files are descriptive only |
| `src/soul/FakeExecutionWatchdog.ts` | Adjacent comparison comment referenced another product; implementation is a small local claim/tool-call consistency check | Behavior reviewed and retained; comparison claim removed |
| `src/soul/SelfImprovement.ts` | Adjacent comparison comment referenced another product; implementation is a local Markdown journal | Behavior reviewed and retained; comparison claim removed |
| `docs/superpowers/**` | Legacy plans used source-alignment and architectural-identity language | Removed from the current tree; retained in Git history for traceability |

The public competitive audit remains in `docs/SYNAPSE-AUDIT-2026-07-19.md`.
It compares documented product behavior and is not an implementation provenance
claim.

## Decision

### Memory maintenance contract

The maintained index is `${SYNAPSE_DATA_DIR}/MEMORY.md`, the same file loaded into
context and managed by the memory CLI. Maintenance is deterministic and performs
only bounded text normalization:

- preserve headings and paragraph content;
- collapse repeated blank lines;
- remove exact duplicate list entries;
- truncate oversized list entries, not headings;
- enforce configured line and UTF-8 byte limits.

The maintenance lease uses exclusive file creation. A bounded timeout permits
recovery from a stale lease. Completion state and index writes use temporary files
followed by rename so readers do not observe partially written content. A legacy
`.dream-lock.json` timestamp is read only to preserve the previous time gate during
migration.

### Vim command parser contract

Synapse supports a deliberately small prompt-line subset: INSERT/NORMAL modes,
decimal counts, basic motions, delete/change/yank operators, `x`, `u`, `.`, and
line-opening commands. The parser has four command states: idle, count, operator,
and operator-with-count.

Every completed NORMAL-mode command explicitly returns to idle. Commands that enter
INSERT mode do not emit a NORMAL reset. Counts are capped at 10,000, including
operator-count multiplication. `0` is a line-start motion when it follows an
operator and a count digit only after a non-zero count has started.

These are standard editor behaviors and local product requirements; the parser does
not claim compatibility with every Vim command.

### Heartbeat execution boundary

`HEARTBEAT.md` is a maintenance checklist, not executable configuration. Heartbeat
may read local state and write logs through built-in code. It must not invoke a host
shell or convert fenced code blocks into scheduled tasks. Any future command-running
scheduler must enter through ToolRegistry authorization and the configured strict
sandbox.

## Verification Evidence

- `tests/memory-maintenance.test.ts` covers legacy-state migration, session/time
  gates, live and stale leases, concurrent-run rejection, root-index selection,
  structure preservation, line limits, byte limits, and configuration validation.
- `tests/vim.test.ts` covers state initialization, own-key operator detection,
  count clamping, reset semantics, `d0`, repeated operators, INSERT transitions,
  and invalid-command recovery.
- `tests/soul-advanced.test.ts` writes a command block to `HEARTBEAT.md`, runs a
  heartbeat cycle, and verifies that no marker file is created.
- The acceptance scan requires no `ported from`, `simplified from`, competitor
  names, or product source-alignment statement under `src/` or `tests/`.

## Consequences

- The unconnected prompt extraction and session-index APIs are no longer present.
- `Dream` is replaced by the narrower `MemoryMaintenance` dependency in runtime
  initialization and Heartbeat.
- Existing completion timestamps migrate forward, but historical lock files are
  not deleted automatically.
- Historical repository commits remain available. If downstream publication needs
  a legal provenance determination, maintainers must perform a separate legal and
  commit-history review.

## Rejected Alternatives

- Delete only the comments: hides the signal without changing or explaining the
  implementation.
- Claim a clean-room rewrite: inaccurate because the prior implementation was
  already visible to the people and tools performing the replacement.
- Keep unused modules for possible future work: preserves provenance risk and test
  maintenance without runtime value.
- Continue executing `HEARTBEAT.md` commands with a warning: still bypasses the
  authorization and sandbox boundary.
