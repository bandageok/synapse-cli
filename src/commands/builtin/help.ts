import type { SlashCommand, CommandDeps } from '../registry.js';

export const helpCommand: SlashCommand = {
  name: 'help',
  aliases: ['h', '?'],
  description: 'Show available commands',
  handler: async (_args, deps) => {
    return 'Commands: /help /exit /clear /model /memory /soul /doctor /config /session /cost /compact /init /resume /history /soul-edit';
  },
};
