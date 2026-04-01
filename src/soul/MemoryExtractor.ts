// src/soul/MemoryExtractor.ts
// Memory extraction from conversation logs
// Ported from Claude Code extractMemories/prompts.ts

export interface ExtractionPrompt {
  system: string;
  user: (transcript: string) => string;
}

/**
 * Core memory extraction prompt — ported from Claude Code's extractMemories.
 * The model analyzes a conversation transcript and extracts durable memories
 * into a 4-category taxonomy: User, Feedback, Project, Reference.
 */
export const MEMORY_EXTRACTION_PROMPT: ExtractionPrompt = {
  system: `You are a memory extraction system. Analyze the conversation and extract important information that would be useful in future sessions.

Categorize each memory into one of these types:
- [User] User preferences, identity, working style, communication preferences
- [Feedback] Corrections, behavior preferences, things to remember about how to interact
- [Project] Project status, decisions, technical details, architecture choices
- [Reference] External resources, links, key information, documentation

Output format:
## [Category] Brief title
- Specific detail 1
- Specific detail 2

Rules:
- Only extract information that would be useful in future conversations
- Skip trivial details, greetings, and one-off requests
- Be specific: include file paths, function names, error messages when relevant
- If the user explicitly asks to remember something, save it immediately
- If something contradicts an existing memory, note the correction
- Keep each entry concise but actionable`,

  user: (transcript: string) =>
    `Extract memories from this conversation:\n\n${transcript}`,
};

/**
 * Consolidation prompt — ported from Claude Code's autoDream/consolidationPrompt.ts.
 * Used during "dream" cycles to synthesize existing memories into a tighter,
 * more organized form. Runs as a background pass over memory files.
 */
export function buildConsolidationPrompt(
  memoryDir: string,
  sessionDir: string,
  extra?: string,
): string {
  return `# Dream: Memory Consolidation

You are performing a dream — a reflective pass over your memory files. Synthesize what you've learned recently into durable, well-organized memories so that future sessions can orient quickly.

Memory directory: \`${memoryDir}\`
Session transcripts: \`${sessionDir}\`

---

## Phase 1 — Orient

- List the memory directory to see what already exists
- Read MEMORY.md to understand the current index
- Skim existing topic files so you improve them rather than creating duplicates

## Phase 2 — Gather recent signal

Look for new information worth persisting. Sources in rough priority order:

1. **Daily logs** if present — these are the append-only stream
2. **Existing memories that drifted** — facts that contradict something current
3. **Session transcripts** — grep for narrow terms only when you already suspect something matters

Don't exhaustively read transcripts. Look only for things you already suspect matter.

## Phase 3 — Consolidate

For each thing worth remembering, write or update a memory file. Focus on:
- Merging new signal into existing topic files rather than creating near-duplicates
- Converting relative dates ("yesterday", "last week") to absolute dates
- Deleting contradicted facts — if today's investigation disproves an old memory, fix it at the source

Use the 4-category taxonomy:
- [User] User preferences, identity, working style
- [Feedback] Corrections, behavior preferences
- [Project] Project status, decisions, technical details
- [Reference] External resources, links, key information

## Phase 4 — Prune and index

Update MEMORY.md so it stays under 200 lines AND under ~25KB. It's an **index**, not a dump — each entry should be one line under ~150 characters: \`- [Title](file.md) — one-line hook\`. Never write memory content directly into it.

- Remove pointers to memories that are now stale, wrong, or superseded
- Demote verbose entries: shorten the line, move the detail to the topic file
- Add pointers to newly important memories
- Resolve contradictions — if two files disagree, fix the wrong one

---

Return a brief summary of what you consolidated, updated, or pruned. If nothing changed (memories are already tight), say so.${
    extra ? `\n\n## Additional context\n\n${extra}` : ''
  }`;
}

/**
 * Session memory update prompt — ported from Claude Code's SessionMemory/prompts.ts.
 * Used to maintain a running markdown file of notes about the current conversation.
 */
export function buildSessionMemoryPrompt(
  currentNotes: string,
  notesPath: string,
): string {
  return `IMPORTANT: This message and these instructions are NOT part of the actual user conversation. Do NOT include any references to "note-taking" or "session notes extraction" in the notes content.

Based on the user conversation above, update the session notes file.

The file ${notesPath} has already been read for you. Here are its current contents:
<current_notes_content>
${currentNotes}
</current_notes_content>

Your ONLY task is to update the notes file, then stop.

CRITICAL RULES:
- Maintain the exact structure with all sections, headers, and descriptions intact
- ONLY update the actual content below each section header
- Do NOT reference this note-taking process in the notes
- Skip updating a section if there are no substantial new insights
- Write DETAILED, INFO-DENSE content — include file paths, function names, error messages
- Keep each section under ~2000 tokens — condense by cycling out less important details
- Focus on actionable information that would help someone understand the work discussed
- Always update "Current State" to reflect the most recent work

Sections to maintain:
# Session Title
# Current State
# Task specification
# Files and Functions
# Workflow
# Errors & Corrections
# Codebase and System Documentation
# Learnings
# Key results
# Worklog`;
}
