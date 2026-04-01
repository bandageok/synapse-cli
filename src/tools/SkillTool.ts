import type { ToolDef, ToolResult } from '../core/types.js';

export const SkillTool: ToolDef<{ skill_name: string }> = {
  name: 'Skill',
  description: 'Invoke a skill (slash command)',
  schema: {
    type: 'object',
    properties: {
      skill_name: { type: 'string', description: 'Name of the skill to invoke' },
    },
    required: ['skill_name'],
  },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input): Promise<ToolResult> => {
    return {
      output: `[Skill stub] Skill "${input.skill_name}" invoked. Skill system not yet fully implemented.`,
      isError: false,
    };
  },
};
