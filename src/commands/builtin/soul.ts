import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { SlashCommand } from '../registry.js';

export const soulCommand: SlashCommand = {
  name: 'soul',
  description: 'View SOUL.md',
  handler: async (_args, deps) => {
    const path = join(deps.dataDir, 'SOUL.md');
    if (!existsSync(path)) return 'No SOUL.md found. Run /init to create.';
    const content = readFileSync(path, 'utf-8');
    return `--- SOUL.md ---\n${content}`;
  },
};
