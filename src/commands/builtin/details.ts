import type { SlashCommand } from '../registry.js';
import type { DetailsMode } from '../../ui/timeline.js';

export const detailsCommand: SlashCommand = {
  name: 'details',
  description: 'Control tool activity detail level',
  usage: '/details [compact|expanded|toggle]',
  handler: async (args, deps) => {
    if (!deps.detailsMode || !deps.setDetailsMode) return 'Detail switching is unavailable in this session.';
    const requested = args.trim().toLowerCase();
    if (!requested) return `Tool details: ${deps.detailsMode}`;
    let next: DetailsMode;
    if (requested === 'toggle') next = deps.detailsMode === 'compact' ? 'expanded' : 'compact';
    else if (requested === 'compact' || requested === 'expanded') next = requested;
    else return 'Usage: /details [compact|expanded|toggle]';
    deps.setDetailsMode(next);
    return `Tool details: ${next}`;
  },
};
