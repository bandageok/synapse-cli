import type { SlashCommand } from '../registry.js';

export const costCommand: SlashCommand = {
  name: 'cost',
  description: 'Show token usage estimate',
  handler: async (_args, deps) => {
    let totalChars = 0;
    for (const msg of deps.messages) {
      if (typeof msg.content === 'string') totalChars += msg.content.length;
      else totalChars += JSON.stringify(msg.content).length;
    }
    const estimatedTokens = Math.round(totalChars / 4);
    return `Estimated tokens: ~${estimatedTokens}\nMessages: ${deps.messages.length}\nTurns: ${deps.turnCount}`;
  },
};
