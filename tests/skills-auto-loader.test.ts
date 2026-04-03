// tests/skills-auto-loader.test.ts
// SkillAutoLoader: discover, auto-match, activate/deactivate
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SkillAutoLoader } from '../src/skills/AutoLoader.js';

describe('SkillAutoLoader', () => {
  let tmpDir: string;
  let cwd: string;
  let loader: SkillAutoLoader;

  beforeEach(() => {
    tmpDir = join(tmpdir(), 'cclaw-skills-' + Date.now());
    cwd = join(tmpdir(), 'cclaw-cwd-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(join(tmpDir, 'skills'), { recursive: true });
    mkdirSync(cwd, { recursive: true });
    loader = new SkillAutoLoader(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  it('instantiates', () => {
    expect(loader).toBeDefined();
  });

  it('returns empty list when no skills', () => {
    const skills = loader.discover(cwd);
    expect(skills).toEqual([]);
  });

  it('discovers a valid skill with SKILL.md', () => {
    const skillDir = join(tmpDir, 'skills', 'my-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# My Skill\nDescription here', 'utf-8');
    const skills = loader.discover(cwd);
    expect(skills.length).toBe(1);
    expect(skills[0].manifest.name).toBe('my-skill');
    expect(skills[0].skillMd).toContain('My Skill');
  });

  it('discovers skill with manifest.json', () => {
    const skillDir = join(tmpDir, 'skills', 'manifested');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# content', 'utf-8');
    writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify({
      title: 'Manifested Skill',
      description: 'A skill with metadata',
      triggers: ['manifest', 'meta'],
      paths: ['src/'],
    }));
    const skills = loader.discover(cwd);
    expect(skills.length).toBe(1);
    expect(skills[0].manifest.title).toBe('Manifested Skill');
    expect(skills[0].manifest.triggers).toContain('manifest');
    expect(skills[0].manifest.paths).toContain('src/');
  });

  it('activates and deactivates skills', () => {
    const skillDir = join(tmpDir, 'skills', 'toggle');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# toggle', 'utf-8');
    loader.discover(cwd);
    loader.activate('toggle');
    expect(loader.getActiveNames()).toContain('toggle');
    expect(loader.getActiveContents()).toContain('# toggle');
    loader.deactivate('toggle');
    expect(loader.getActiveNames()).not.toContain('toggle');
    expect(loader.getActiveContents()).toBe('');
  });

  it('auto-matches by trigger keyword', () => {
    const skillDir = join(tmpDir, 'skills', 'web-search');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# Web Search', 'utf-8');
    writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify({
      title: 'Web Search',
      triggers: ['search', 'find on web'],
    }));
    loader.discover(cwd);
    const matched = loader.autoMatch('Can you search for this?', cwd);
    expect(matched).not.toBeNull();
    expect(matched?.manifest.name).toBe('web-search');
  });

  it('auto-matches by name', () => {
    const skillDir = join(tmpDir, 'skills', 'python-coder');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# Python Coder', 'utf-8');
    loader.discover(cwd);
    const matched = loader.autoMatch('I need python-coder help', cwd);
    expect(matched).not.toBeNull();
    expect(matched?.manifest.name).toBe('python-coder');
  });

  it('returns null when no match', () => {
    const skillDir = join(tmpDir, 'skills', 'random');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# random', 'utf-8');
    writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify({
      triggers: ['xyz'],
    }));
    loader.discover(cwd);
    const matched = loader.autoMatch('nothing matches this', cwd);
    expect(matched).toBeNull();
  });

  it('discovers skills from cwd/skills/ directory', () => {
    mkdirSync(join(cwd, 'skills', 'project-skill'), { recursive: true });
    writeFileSync(join(cwd, 'skills', 'project-skill', 'SKILL.md'), '# project', 'utf-8');
    const skills = loader.discover(cwd);
    expect(skills.length).toBe(1);
    expect(skills[0].manifest.name).toBe('project-skill');
  });

  it('skip directories without SKILL.md', () => {
    mkdirSync(join(tmpDir, 'skills', 'no-skill'), { recursive: true });
    // No SKILL.md
    writeFileSync(join(tmpDir, 'skills', 'no-skill', 'readme.txt'), 'not a skill', 'utf-8');
    const skills = loader.discover(cwd);
    expect(skills.length).toBe(0);
  });

  it('skip invalid manifest.json', () => {
    const skillDir = join(tmpDir, 'skills', 'bad-manifest');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# bad', 'utf-8');
    writeFileSync(join(skillDir, 'manifest.json'), 'not json', 'utf-8');
    const skills = loader.discover(cwd);
    expect(skills.length).toBe(1);
    expect(skills[0].manifest.title).toBe('bad-manifest'); // uses directory name as fallback
  });
});
