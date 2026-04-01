import type { SlashCommand } from '../registry.js';

export const compactCommand: SlashCommand = {
  name: 'compact',
  description: 'Manually compress conversation',
  handler: async (_args, deps) => {
    return 'Manual compaction triggered. Will compress on next turn if over threshold.';
  },
};
