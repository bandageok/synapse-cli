import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { SlashCommand } from '../registry.js';

export const soulEditCommand: SlashCommand = {
  name: 'soul-edit',
  description: 'Append a rule to SOUL.md',
  usage: '/soul-edit <rule text>',
  handler: async (args, deps) => {
    if (!args) return 'Usage: /soul-edit <rule text>';
    const path = join(deps.dataDir, 'SOUL.md');
    if (!existsSync(path)) {
      writeFileSync(path, '# SOUL.md\n\n');
    }
    const current = readFileSync(path, 'utf-8');
    writeFileSync(path, current + `\n- ${args}`);
    return `Added to SOUL.md: "${args}"`;
  },
};
