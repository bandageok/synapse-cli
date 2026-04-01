import type { SlashCommand } from '../registry.js';

export const exitCommand: SlashCommand = {
  name: 'exit',
  aliases: ['quit', 'q'],
  description: 'Exit the REPL',
  handler: async () => {
    process.exit(0);
  },
};
