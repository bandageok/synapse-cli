import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { SlashCommand } from '../registry.js';

export const historyCommand: SlashCommand = {
  name: 'history',
  description: 'List saved sessions',
  handler: async (_args, deps) => {
    const sessionsDir = join(deps.dataDir, 'sessions');
    if (!existsSync(sessionsDir)) return 'No sessions found.';

    const files = readdirSync(sessionsDir).filter(f => f.endsWith('.json')).slice(-10);
    if (files.length === 0) return 'No sessions found.';

    const list = files.map(f => {
      const data = JSON.parse(readFileSync(join(sessionsDir, f), 'utf-8'));
      return `  ${data.metadata?.id ?? f} | ${data.metadata?.model ?? '?'} | ${data.metadata?.turnCount ?? 0} turns | ${data.metadata?.updatedAt ?? '?'}`;
    });
    return `Sessions:\n${list.join('\n')}`;
  },
};
