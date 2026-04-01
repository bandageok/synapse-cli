// src/commands/builtin/vim.ts
import type { SlashCommand } from '../registry.js';

export const vimCommand: SlashCommand = {
  name: 'vim',
  description: 'Toggle vim mode (Esc=Normal, i=Insert)',
  handler: async () => {
    return 'Vim mode toggled. Use Esc → Normal mode, i → Insert mode.\nMotions: h/j/k/l, w/b/e, 0/^/$\nOperators: d/c/y + motion, dd, x\ni/a/I/A/o/O → Insert mode';
  },
};
