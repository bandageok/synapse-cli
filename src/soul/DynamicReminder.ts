// src/soul/DynamicReminder.ts
import type { ToolUse, ToolResult } from '../core/types.js';

export class DynamicReminder {
  getReminder(turnCount: number, toolUse: ToolUse, result: ToolResult): string | null {
    // Every 3 turns: progress check
    if (turnCount > 1 && turnCount % 3 === 0) {
      return `[Turn ${turnCount}] Review your progress. Are you still on track with the original task?`;
    }

    // Bash error → root cause analysis
    if (toolUse.name === 'Bash' && result.isError) {
      return 'Reminder: Analyze the root cause. Do not retry the same command without modification.';
    }

    // File edit → verify
    if (['FileEdit', 'FileWrite'].includes(toolUse.name) && !result.isError) {
      return 'Reminder: Verify the modification took effect (re-read the file).';
    }

    // Search → no fabrication
    if (['WebSearch', 'Grep', 'Glob'].includes(toolUse.name)) {
      return 'Reminder: Use only information found in search results. Do not infer or fabricate.';
    }

    return null;
  }
}
