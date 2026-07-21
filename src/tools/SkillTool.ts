import type { ToolDef, ToolResult } from '../core/types.js';
import type { SkillAutoLoader } from '../skills/AutoLoader.js';
import { formatSkillInventory } from '../skills/query.js';

interface SkillToolInput {
  action?: 'list' | 'show';
  skill_name?: string;
}

export function createSkillTool(loader: SkillAutoLoader): ToolDef<SkillToolInput> {
  return {
    name: 'Skill',
    description: 'List or inspect skills discovered by Synapse. Use this instead of Glob, Grep, Bash, or PowerShell for questions about available skills.',
    schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'show'], description: 'List all skills or show one skill.' },
        skill_name: { type: 'string', description: 'Skill name required by the show action.' },
      },
      additionalProperties: false,
    },
    permissions: 'read',
    autoApproveInWorkspace: true,
    isEnabled: () => true,
    execute: async (input, ctx): Promise<ToolResult> => {
      const skills = loader.rebuild(ctx.cwd);
      if ((input.action ?? 'list') === 'list') {
        return { output: formatSkillInventory(skills), isError: false };
      }
      const requested = input.skill_name?.trim().toLowerCase();
      if (!requested) return { output: 'Error: skill_name is required when action is show.', isError: true };
      const skill = skills.find(candidate => candidate.manifest.name.toLowerCase() === requested
        || candidate.manifest.title.toLowerCase() === requested);
      if (!skill) return { output: `Error: Skill "${input.skill_name}" was not found.`, isError: true };
      return {
        output: `# ${skill.manifest.title || skill.manifest.name}\n\n${skill.manifest.description || 'No description.'}\n\n${skill.skillMd}`,
        isError: false,
      };
    },
  };
}
