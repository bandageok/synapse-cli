# ADR-0009: Conversation-first terminal information flow

## Status

Accepted on 2026-07-21. This supersedes the compact rendering policy in ADR-0007; the structured event model and sanitization rules remain unchanged.

## Context

ADR-0007 connected the REPL to stable tool lifecycle items, but its compact mode still behaved like a shortened execution log: it kept recent successful calls visible and expanded failed output in the main conversation. Long tool chains therefore competed with the user's request and the final answer.

Codex and Hermes separate the event protocol from presentation policy:

- Codex models `Thread -> Turn -> Item` and updates a stable item through `item/started`, item-specific deltas, and `item/completed`. The completed item is authoritative, while full command output and raw transcript remain available as details.
- Hermes exposes independent detail levels for thinking, tools, subagents, and activity. Low-value activity can be hidden, and approvals or selectors do not become ordinary chat messages.
- Qwen Code separates committed history from live pending items, dispatches typed history items to dedicated components, and treats the composer as a focus-aware state machine.
- Claude Code documents `Esc` as interrupting the active response or tool call, permission modes as session state, and transcript viewing as distinct from the compact conversation.

Sources:

- https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md
- https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json
- https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/tui.md
- https://github.com/QwenLM/qwen-code/blob/main/packages/cli/src/ui/components/HistoryItemDisplay.tsx
- https://github.com/QwenLM/qwen-code/blob/main/packages/cli/src/ui/components/MainContent.tsx
- https://github.com/QwenLM/qwen-code/blob/main/packages/cli/src/ui/components/InputPrompt.tsx
- https://code.claude.com/docs/en/interactive-mode
- https://code.claude.com/docs/en/permission-modes

## Decision

Synapse keeps the `Turn -> Item` display model and uses two presentation layers.

### Compact mode

- A consecutive tool run becomes exactly one stable `activity` item.
- While running, the item shows only the current tool and a bounded input summary.
- When complete, the same item becomes `Worked N steps`, with duration and issue count.
- Successful tool names and outputs are hidden.
- Repeated failures are grouped by tool name and sanitized output fingerprint.
- Each distinct failure contributes one actionable summary line; stack traces and absolute Windows paths are removed from this layer.
- User prompts use a compact prompt anchor and assistant answers keep the Synapse identity without uppercase section banners.

### Expanded mode

- Original tool items remain in memory and render as an execution tree.
- Tool input, bounded raw output, duration, status, and ordering remain available for audit.
- `Ctrl+O` expands only the latest turn by default. `/details expanded` remains the global audit view.

### Chrome and viewport

- The top status line shows product identity, provider/model when space permits, active skill count on wide terminals, and context usage.
- Permission mode, issue count, and scroll position stay in the footer. Compact mode does not label itself.
- Row estimates use terminal display width. Narrow terminals split failure identity and cause across two rows so counts cannot be truncated independently.
- Long answer and composer content are bounded by rendered rows rather than source line count.
- Interactive TTY sessions use the terminal alternate screen so the header, viewport, composer, and footer have stable coordinates without polluting scrollback. Pipe mode remains plain output, and `SYNAPSE_NO_ALT_SCREEN=1` preserves inline rendering when required by accessibility tools or terminal multiplexers.
- The startup surface uses a responsive Synapse wordmark and Provider/model identity. The large mark is replaced by a compact label before it can wrap.
- The composer is the only persistent bordered focus surface. Its metadata row shows loaded skills and permission mode; the footer reserves left, center, and right zones for working directory, permission/issues, and model/context.
- Terminals at least 110 columns wide may add a latest-turn Timeline rail. Narrower terminals keep the single-column transcript, and compact activity remains the authoritative issue summary in both layouts.
- Slash-command suggestions are generated from `CommandRegistry`, capped at five rows, and rendered as a focus panel. Expanded tools use bounded status cards; normal compact work does not.

### Input and interruption

- The composer remains editable while an Engine turn is active.
- Enter queues a normal follow-up instead of starting a concurrent Engine. The bounded queue preserves insertion order and is rendered in the bottom pane, not the transcript.
- Slash commands are rejected while a turn is active because command side effects must not race Engine state.
- `Esc` and `Ctrl+C` interrupt the active turn through its abort signal. A user cancellation renders as neutral state rather than a failed issue.
- Permission prompts retain focus priority; composer input cannot accidentally approve or deny a tool.

The implementation is a clean-room rewrite. These sources define observable behavior and architecture choices; no third-party component code is copied into Synapse.

## Consequences

- The default view prioritizes request, progress, and answer instead of implementation noise.
- Compact and expanded views share the same underlying events, so folding cannot delete audit evidence.
- Repeated failures remain visible without consuming one row per attempt.
- Snapshot-style Ink tests must cover running, completed, failed, repeated-failure, expanded, CJK, and narrow-terminal states.
- Follow-up input no longer creates concurrent Engine runs; the next turn starts only after the active turn reaches a terminal state.
- Alternate-screen overlays, queued input, plan items, and approval modals remain separate future capabilities; they do not require another event-model rewrite.
