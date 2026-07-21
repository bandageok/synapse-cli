import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SkillAutoLoader } from '../src/skills/AutoLoader.js';
import { answerSkillInventoryQuery, isSkillInventoryQuery } from '../src/skills/query.js';
import { createSkillTool } from '../src/tools/SkillTool.js';

describe('deterministic skill inventory queries', () => {
  let dataDir: string;
  let workspace: string;
  let loader: SkillAutoLoader;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'synapse-skill-query-data-'));
    workspace = mkdtempSync(join(tmpdir(), 'synapse-skill-query-workspace-'));
    const skillDir = join(dataDir, 'skills', 'review');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# Review\nCheck code carefully.', 'utf8');
    writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify({
      title: 'Code Review', description: 'Review source changes', triggers: ['review'],
    }), 'utf8');
    loader = new SkillAutoLoader(dataDir);
    loader.rebuild(workspace);
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  it('matches explicit English and Chinese list requests but not mutation requests', () => {
    expect(isSkillInventoryQuery('列出所有 skills')).toBe(true);
    expect(isSkillInventoryQuery('你现在有什么技能？')).toBe(true);
    expect(isSkillInventoryQuery('show me all available skills')).toBe(true);
    expect(isSkillInventoryQuery('帮我创建一个 skill')).toBe(false);
    expect(isSkillInventoryQuery('install a skill')).toBe(false);
  });

  it('answers inventory requests locally in the user language', () => {
    const chinese = answerSkillInventoryQuery('列出所有 skills', loader, workspace);
    expect(chinese).toContain('已发现 1 个 skills');
    expect(chinese).toContain('Code Review');
    const english = answerSkillInventoryQuery('what skills are available?', loader, workspace);
    expect(english).toContain('1 skills discovered');
  });

  it('preserves active state and usage metadata across a rebuild', () => {
    loader.activate('review');
    expect(loader.getActiveNames()).toEqual(['review']);
    loader.rebuild(workspace);
    expect(loader.getActiveNames()).toEqual(['review']);
    expect(loader.list()[0]).toMatchObject({ active: true, useCount: 1 });
  });

  it('exposes a real read-only Skill tool instead of a provider-facing stub', async () => {
    const tool = createSkillTool(loader);
    const result = await tool.execute(
      { action: 'list' },
      { cwd: workspace, workspaceRoots: [workspace], abortSignal: new AbortController().signal },
    );
    expect(tool.name).toBe('Skill');
    expect(tool.description).toContain('instead of Glob');
    expect(result.isError).toBe(false);
    expect(result.output).toContain('Code Review');
    expect(result.output).not.toContain('stub');
  });
});
