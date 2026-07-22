import type { SlashCommand } from '../registry.js';

export const exitCommand: SlashCommand = {
  name: 'exit',
  aliases: ['quit', 'q'],
  description: 'Exit the REPL',
  handler: async (_args, deps) => {
    if (deps.exit) await deps.exit();
    else process.exit(0);
  },
};
