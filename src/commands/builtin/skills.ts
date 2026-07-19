import type { SlashCommand } from '../registry.js';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { SkillAutoLoader } from '../../skills/AutoLoader.js';

export const skillsCommand: SlashCommand = {
  name: 'skills',
  description: 'List, activate, and manage skills (auto-discovered)',
  usage: '/skills [list | activate <name> | deactivate <name> | scan]',
  handler: async (args, deps) => {
    const dataDir = deps.dataDir;
    const loader = new SkillAutoLoader(dataDir);

    // Auto-discover on first call
    const allSkills = loader.discover(process.cwd());

    const parts = args?.trim().split(/\s+/) || ['list'];
    const subCmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');

    if (subCmd === 'scan') {
      // Re-scan and show all discovered skills
      const lines = [
        '=== Skill Scan ===',
        '',
        `  Searched in:`,
        `    - ${join(dataDir, 'skills')}`,
        `    - ${join(process.cwd(), 'skills')}`,
        `    - ${join(process.cwd(), '.synapse', 'skills')}`,
        '',
        `  Discovered: ${allSkills.length}`,
        '',
      ];
      for (const s of allSkills) {
        const status = s.active ? '✅ active' : `  (${s.skillMd.split('\n').length} lines)`;
        lines.push(`  - ${s.manifest.title || s.manifest.name}  ${status}`);
        if (s.manifest.description) {
          lines.push(`    ${s.manifest.description}`);
        }
        if (s.manifest.triggers) {
          lines.push(`    Triggers: ${s.manifest.triggers.join(', ')}`);
        }
        if (s.manifest.paths) {
          lines.push(`    Paths: ${s.manifest.paths.join(', ')}`);
        }
        lines.push('');
      }
      return lines.join('\n');
    }

    if (subCmd === 'activate' && arg) {
      const skill = loader.activate(arg);
      if (skill) {
        // Create skills dir if needed
        const skillDir = join(dataDir, 'skills');
        if (!existsSync(skillDir)) mkdirSync(skillDir, { recursive: true });
        return `✅ Skill "${skill.manifest.title || skill.manifest.name}" activated.\n${skill.skillMd.slice(0, 200)}...`;
      }
      return `❌ Skill "${arg}" not found. Run /skills scan to list available skills.`;
    }

    if (subCmd === 'deactivate' && arg) {
      if (loader.deactivate(arg)) {
        return `✅ Skill "${arg}" deactivated.`;
      }
      return `❌ Skill "${arg}" not active.`;
    }

    // Default: list
    const activeNames = loader.getActiveNames();
    const lines = ['=== Skills ===', ''];
    if (allSkills.length === 0) {
      lines.push('  No skills found.');
      lines.push('');
      lines.push('  To add skills:');
      lines.push('    1. Place skill folders in ~/.synapse/skills/');
      lines.push('    2. Each skill needs a SKILL.md file');
      lines.push('    3. Optionally add manifest.json for metadata');
      lines.push('');
      lines.push('  Example manifest.json:');
      lines.push('    {"name": "my-skill", "title": "My Skill",');
      lines.push('     "description": "Does cool things",');
      lines.push('     "triggers": ["cool", "awesome"],');
      lines.push('     "paths": ["src/", "lib/"]}');
      lines.push('');
      lines.push('  Run /skills scan to search again.');
    } else {
      lines.push(`  ${allSkills.length} skill(s) discovered, ${activeNames.length} active`);
      lines.push('');
      for (const s of allSkills) {
        const icon = s.active ? '✅' : '  ';
        lines.push(`  ${icon} ${s.manifest.title || s.manifest.name}`);
        lines.push(`      ${s.manifest.description || ''}`);
        lines.push(`      ${s.skillMd.split('\n').length} lines  |  Used: ${s.useCount}x`);
      }
      lines.push('');
      lines.push('  Commands: /skills activate <name>  /skills deactivate <name>  /skills scan');
    }
    return lines.join('\n');
  },
};
