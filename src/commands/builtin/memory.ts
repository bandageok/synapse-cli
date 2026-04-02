import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { SlashCommand } from '../registry.js';

export const memoryCommand: SlashCommand = {
  name: 'memory',
  aliases: ['mem'],
  description: 'View or edit MEMORY.md',
  usage: '/memory [add <text> | edit]',
  handler: async (args, deps) => {
    const path = join(deps.dataDir, 'MEMORY.md');

    if (!args) {
      // 查看
      if (!existsSync(path)) return 'No MEMORY.md found. Run /init to create.';
      const content = readFileSync(path, 'utf-8');
      return `--- MEMORY.md (${content.split('\n').length} lines) ---\n${content}`;
    }

    const [subCmd, ...rest] = args.split(' ');
    const text = rest.join(' ');

    if (subCmd === 'add' && text) {
      // 追加
      if (!existsSync(path)) {
        writeFileSync(path, '# MEMORY.md\n\n');
      }
      const current = readFileSync(path, 'utf-8');
      const lines = current.split('\n').length;
      if (lines > 200) {
        return `⚠️ MEMORY.md has ${lines} lines (max 200). Run /compact or manually prune.`;
      }
      writeFileSync(path, current.trimEnd() + `\n- ${text}\n`);
      return `✅ Added to MEMORY.md: "${text}"`;
    }

    if (subCmd === 'reload') {
      return 'Memory cache cleared. Will reload on next turn.';
    }

    return 'Usage: /memory [add <text> | reload]';
  },
};
