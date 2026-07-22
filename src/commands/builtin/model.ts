import type { SlashCommand } from '../registry.js';

export const modelCommand: SlashCommand = {
  name: 'model',
  aliases: ['m'],
  description: 'View or switch model',
  usage: '/model [name]',
  handler: async (args, deps) => {
    if (!args) {
      return `Current model: ${deps.model}\nUsage: /model <model-name>`;
    }
    const model = args.trim();
    if (!model) return 'Usage: /model <model-name>';
    deps.setModel(model);
    return `Model switched for this session: ${model}`;
  },
};
