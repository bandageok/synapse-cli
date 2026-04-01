import type { SlashCommand } from '../registry.js';

export const configCommand: SlashCommand = {
  name: 'config',
  description: 'Show current configuration',
  handler: async (_args, deps) => {
    return [
      `Data dir: ${deps.dataDir}`,
      `Model: ${deps.model}`,
      `Provider: openrouter`,
      `Turns: ${deps.turnCount}`,
    ].join('\n');
  },
};
