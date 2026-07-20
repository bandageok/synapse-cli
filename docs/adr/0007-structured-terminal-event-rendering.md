# ADR-0007: Structured terminal event rendering

## Status

Accepted on 2026-07-21.

## Context

The original REPL flattened user messages, assistant text, tool lifecycle events, errors, and context compression notices into one `{ role, content }` shape. Rendering then inferred meaning from string prefixes such as `[✓]`. This produced several failures:

- ANSI sequences from tool output could recolor later terminal content.
- A running tool and its result occupied separate, repetitive rows.
- Errors were guessed from an `Error:` prefix instead of the tool result contract.
- Long successful tool chains filled the viewport while failures competed for attention.
- The existing Markdown and tool-detail components were not connected to the REPL.
- Terminal width detection read the `useStdout()` context instead of its stream, so responsive layout often used fallback dimensions.

Three first-party implementations informed the redesign:

- Claude Code keeps a compact primary view, collapses repeated MCP calls, and exposes detailed execution through its transcript viewer. Its optional fullscreen renderer uses the alternate screen and renders only visible messages.
- Codex exposes distinct thread items and streaming deltas for agent messages, reasoning summaries, command output, file changes, and errors. Rich clients render the event type rather than parsing Markdown prefixes.
- Hermes TUI provides independent `hidden`, `collapsed`, and `expanded` detail levels for thinking, tools, subagents, and activity, while approvals and selectors use overlays.

Sources:

- https://code.claude.com/docs/en/interactive-mode
- https://code.claude.com/docs/en/fullscreen
- https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md
- https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/tui.md

## Decision

Synapse uses a discriminated terminal display model:

- `user` for prompts;
- `assistant` for streamed answer content;
- `tool` for one stable tool-use lifecycle;
- `notice` for compression, permission decisions, commands, and errors.

Engine tool events carry `toolUseId`, `isError`, and `durationMs`. Validation, hook, and permission rejections emit an error result for observability but do not emit a tool-start event or execute the tool.

The default detail mode is `compact`:

- old successful calls in a consecutive run are summarized by count and tool name;
- the three most recent calls remain visible;
- running and failed calls always remain visible;
- failed output shows a bounded head/tail preview;
- ANSI control sequences are removed before display.

`Ctrl+O` toggles between `compact` and `expanded`. `/details compact|expanded|toggle` provides an explicit command path. Expanded mode shows tool input and bounded output while preserving the same event history.

Assistant responses use a semantic terminal renderer for headings, emphasis, inline code, lists, quotes, rules, and fenced code. Markdown is an input syntax for answer content, not the UI event model.

The initial implementation keeps inline terminal scrollback. Alternate-screen rendering is deferred to a separate renderer because it changes copy, scrollback, multiplexing, and accessibility behavior. The structured display model is renderer-independent so an alternate-screen implementation can be added without changing Engine events.

## Consequences

- Tool output can no longer leak color state into the rest of the interface.
- Long tool chains become compact without deleting detailed in-memory display data.
- UI tests can assert semantic states directly instead of matching decorative prefixes.
- Consumers of `EngineEvent` must handle the additional tool fields and the new visible result for rejected attempts.
- Fullscreen differential rendering, mouse interaction, and a separate transcript overlay remain future work rather than implicit requirements of the event model.
