import type { SlashCommand } from '../registry.js';

export const clearCommand: SlashCommand = {
  name: 'clear',
  aliases: ['cls'],
  description: 'Clear the screen',
  handler: async (_args, deps) => {
    deps.clearOutput();
  },
};
