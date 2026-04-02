// src/commands/builtin/diff.ts
import { execSync } from 'child_process';
import type { SlashCommand } from '../registry.js';

export const diffCommand: SlashCommand = {
  name: 'diff',
  aliases: ['d'],
  description: 'Show git diff of current changes',
  usage: '/diff [--staged]',
  handler: async (args) => {
    try {
      const staged = args.includes('--staged') ? '--staged' : '';
      const cmd = `git diff ${staged}`.trim();
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 10_000, maxBuffer: 1024 * 1024 });
      return output || 'No changes.';
    } catch {
      return 'Not a git repository or no changes.';
    }
  },
};
