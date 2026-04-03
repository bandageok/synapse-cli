import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { SlashCommand } from '../registry.js';

export const historyCommand: SlashCommand = {
  name: 'history',
  description: 'List saved sessions',
  handler: async (_args, deps) => {
    const sessionsDir = join(deps.dataDir, 'sessions');
    if (!existsSync(sessionsDir)) return 'No sessions found.';

    const files = readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) return 'No sessions found.';

    const list = files.map(f => {
      try {
        const data = JSON.parse(readFileSync(join(sessionsDir, f), 'utf-8'));
        const msgs = data.messages;
        const turns = Array.isArray(msgs) ? msgs.filter((m: any) => m.role === 'user').length : 0;
        return `  ${data.metadata?.id ?? f} │ ${data.metadata?.model ?? '?'} │ ${turns} turns │ ${data.metadata?.createdAt ?? '?'}`;
      } catch {
        return `  ${f} │ (corrupt)`;
      }
    });
    return `Sessions:\n${list.join('\n')}`;
  },
};
