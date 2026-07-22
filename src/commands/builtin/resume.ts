import type { SlashCommand } from '../registry.js';

export const resumeCommand: SlashCommand = {
  name: 'resume',
  aliases: ['r'],
  description: 'Resume a previous session',
  handler: async () => {
    return 'Resume starts a separate session identity. Exit and run `synapse resume`, `synapse resume --last`, or `synapse resume <id>`.';
  },
};
