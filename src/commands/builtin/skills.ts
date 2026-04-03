import type { SlashCommand } from '../registry.js';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const skillsCommand: SlashCommand = {
  name: 'skills',
  description: 'List available skills and their status',
  handler: async (_args, deps) => {
    const skillsDir = join(deps.dataDir, 'skills');
    if (!existsSync(skillsDir)) {
      return 'No skills directory found. Skills can be added to: ' + skillsDir;
    }

    const dirs = readdirSync(skillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    if (dirs.length === 0) {
      return 'No skills found in: ' + skillsDir;
    }

    const lines = ['=== Skills (' + dirs.length + ' found) ===', ''];
    for (const skill of dirs) {
      const manifestPath = join(skillsDir, skill, 'SKILL.md');
      if (existsSync(manifestPath)) {
        const content = readFileSync(manifestPath, 'utf-8');
        // Extract first line as title
        const firstLine = content.split('\n')[0].replace(/^#+\s*/, '');
        lines.push('  - ' + skill + ': ' + firstLine);
      } else {
        lines.push('  - ' + skill + ' (no SKILL.md)');
      }
    }
    return lines.join('\n');
  },
};
