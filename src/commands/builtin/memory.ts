import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { SlashCommand } from '../registry.js';

export const memoryCommand: SlashCommand = {
  name: 'memory',
  description: 'View MEMORY.md',
  handler: async (_args, deps) => {
    const path = join(deps.dataDir, 'MEMORY.md');
    if (!existsSync(path)) return 'No MEMORY.md found. Run /init to create.';
    const content = readFileSync(path, 'utf-8');
    return `--- MEMORY.md ---\n${content}`;
  },
};
