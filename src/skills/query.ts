import type { LoadedSkill, SkillAutoLoader } from './AutoLoader.js';

const MUTATING_SKILL_QUERY = /(?:创建|新增|安装|添加|编写|create|build|install|add)\s*(?:a\s+)?(?:skills?|技能)/i;
const LIST_SKILLS_QUERY = /(?:列出|显示|查看|有哪些|有什么).{0,16}(?:skills?|技能)|(?:skills?|技能).{0,16}(?:列表|有哪些|有什么)|\b(?:list|show|which|what)\b.{0,32}\bskills?\b/i;

export function isSkillInventoryQuery(input: string): boolean {
  const normalized = input.trim();
  return normalized.length > 0 && !MUTATING_SKILL_QUERY.test(normalized) && LIST_SKILLS_QUERY.test(normalized);
}

export function formatSkillInventory(skills: LoadedSkill[], language: 'en' | 'zh-CN' = 'en'): string {
  if (skills.length === 0) {
    return language === 'zh-CN'
      ? '当前没有已安装的 skills。\n\n可在 `~/.synapse/skills/` 或项目的 `.synapse/skills/` 中添加包含 `SKILL.md` 的技能目录。'
      : 'No skills are installed.\n\nAdd a skill directory containing `SKILL.md` under `~/.synapse/skills/` or the project `.synapse/skills/` directory.';
  }

  const activeCount = skills.filter(skill => skill.active).length;
  const heading = language === 'zh-CN'
    ? `已发现 ${skills.length} 个 skills，其中 ${activeCount} 个已激活：`
    : `${skills.length} skills discovered, ${activeCount} active:`;
  const lines = skills.map(skill => {
    const title = skill.manifest.title || skill.manifest.name;
    const state = skill.active ? (language === 'zh-CN' ? '已激活' : 'active') : (language === 'zh-CN' ? '未激活' : 'inactive');
    const description = skill.manifest.description ? ` — ${skill.manifest.description}` : '';
    return `- **${title}** (${state})${description}`;
  });
  return [heading, '', ...lines].join('\n');
}

export function answerSkillInventoryQuery(input: string, loader: SkillAutoLoader, cwd: string): string | null {
  if (!isSkillInventoryQuery(input)) return null;
  const skills = loader.rebuild(cwd);
  const language = /[\u3400-\u9fff]/.test(input) ? 'zh-CN' : 'en';
  return formatSkillInventory(skills, language);
}
