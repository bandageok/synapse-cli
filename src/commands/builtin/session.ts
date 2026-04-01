import type { SlashCommand } from '../registry.js';

export const sessionCommand: SlashCommand = {
  name: 'session',
  aliases: ['info'],
  description: 'Show session information',
  handler: async (_args, deps) => {
    return [
      `Messages: ${deps.messages.length}`,
      `Turns: ${deps.turnCount}`,
      `Model: ${deps.model}`,
    ].join('\n');
  },
};
