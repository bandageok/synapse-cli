import type { SlashCommand } from '../registry.js';
import { SkillAutoLoader } from '../../skills/AutoLoader.js';
import { formatSkillInventory } from '../../skills/query.js';
import { join } from 'path';

export const skillsCommand: SlashCommand = {
  name: 'skills',
  description: 'List, activate, and manage discovered skills',
  usage: '/skills [list | activate <name> | deactivate <name> | scan]',
  handler: async (args, deps) => {
    const loader = deps.skillLoader ?? new SkillAutoLoader(deps.dataDir);
    const allSkills = loader.rebuild(process.cwd());
    const parts = args?.trim().split(/\s+/).filter(Boolean) ?? [];
    const subCommand = (parts[0] ?? 'list').toLowerCase();
    const name = parts.slice(1).join(' ');

    if (subCommand === 'scan') {
      const lines = [
        '# Skill scan',
        '',
        `Searched \`${join(deps.dataDir, 'skills')}\`, \`${join(process.cwd(), 'skills')}\`, and project parent \`.synapse/skills\` directories.`,
        '',
        formatSkillInventory(allSkills),
      ];
      return lines.join('\n');
    }

    if (subCommand === 'activate' && name) {
      const skill = loader.activate(name);
      return skill
        ? `Skill **${skill.manifest.title || skill.manifest.name}** activated for this session.`
        : `Skill **${name}** was not found. Run \`/skills scan\` to refresh the inventory.`;
    }

    if (subCommand === 'deactivate' && name) {
      return loader.deactivate(name)
        ? `Skill **${name}** deactivated for this session.`
        : `Skill **${name}** is not active.`;
    }

    if (subCommand !== 'list') return 'Usage: /skills [list | activate <name> | deactivate <name> | scan]';
    return formatSkillInventory(allSkills);
  },
};
