import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { SlashCommand } from '../registry.js';

export const resumeCommand: SlashCommand = {
  name: 'resume',
  aliases: ['r'],
  description: 'Resume a previous session',
  handler: async (args, deps) => {
    const sessionsDir = join(deps.dataDir, 'sessions');
    if (!existsSync(sessionsDir)) return 'No sessions found.';

    const files = readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) return 'No sessions found.';

    if (!args) {
      const list = files.slice(-10).map((f, i) => {
        const data = JSON.parse(readFileSync(join(sessionsDir, f), 'utf-8'));
        return `  ${i + 1}. ${data.metadata?.id ?? f} (${data.metadata?.turnCount ?? 0} turns, ${data.metadata?.model ?? '?'})`;
      });
      return `Recent sessions:\n${list.join('\n')}\n\nUsage: /resume <number>`;
    }

    const idx = parseInt(args, 10) - 1;
    const recentFiles = files.slice(-10);
    if (idx < 0 || idx >= recentFiles.length) return 'Invalid session number.';

    const data = JSON.parse(readFileSync(join(sessionsDir, recentFiles[idx]), 'utf-8'));
    deps.resetMessages();
    for (const msg of data.messages) {
      deps.messages.push(msg);
    }
    return `Resumed session: ${data.metadata?.id ?? recentFiles[idx]} (${data.messages.length} messages)`;
  },
};
