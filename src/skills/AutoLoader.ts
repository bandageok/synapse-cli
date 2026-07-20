// src/skills/AutoLoader.ts
// Skill discovery and activation for user and project skill directories.
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

export interface SkillManifest {
  name: string;
  title: string;
  description: string;
  paths?: string[];
  triggers?: string[];
  version?: string;
}

export interface LoadedSkill {
  manifest: SkillManifest;
  dirPath: string;
  skillMdPath: string;
  skillMd: string;
  active: boolean;
  lastUsed?: number;
  useCount: number;
}

export class SkillAutoLoader {
  private skills: Map<string, LoadedSkill> = new Map();
  private activeSkills: Set<string> = new Set();

  constructor(private dataDir: string) {}

  rebuild(cwd?: string): LoadedSkill[] {
    return this.discover(cwd);
  }

  discover(cwd?: string): LoadedSkill[] {
    this.skills.clear();
    this.activeSkills.clear();
    const searchDirs: string[] = [
      join(this.dataDir, 'skills'),
    ];
    if (cwd) {
      searchDirs.push(join(cwd, 'skills'));
      let currentDir = cwd;
      while (currentDir !== resolve(currentDir, '..')) {
        const parentSkills = join(currentDir, '.synapse', 'skills');
        if (existsSync(parentSkills)) {
          searchDirs.push(parentSkills);
        }
        currentDir = resolve(currentDir, '..');
      }
    }

    for (const dir of searchDirs) {
      if (!existsSync(dir)) continue;
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillDir = join(dir, entry.name);
        const skillMdPath = join(skillDir, 'SKILL.md');
        const manifestPath = join(skillDir, 'manifest.json');

        if (!existsSync(skillMdPath)) continue;

        let manifest: SkillManifest = {
          name: entry.name,
          title: entry.name,
          description: '',
        };

        if (existsSync(manifestPath)) {
          try {
            const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8'));
            manifest = { ...manifest, ...parsed, name: entry.name };
          } catch {
            // use defaults
          }
        }

        this.skills.set(manifest.name, {
          manifest,
          dirPath: skillDir,
          skillMdPath,
          skillMd: readFileSync(skillMdPath, 'utf-8'),
          active: false,
          useCount: 0,
        });
      }
    }

    return Array.from(this.skills.values());
  }

  autoMatch(userInput: string, cwd?: string): LoadedSkill | null {
    const input = userInput.toLowerCase().trim();

    for (const [name, skill] of this.skills) {
      if (skill.manifest.triggers) {
        for (const trigger of skill.manifest.triggers) {
          if (input.includes(trigger.toLowerCase())) {
            return this.activate(name);
          }
        }
      }
      if (input.includes(name.toLowerCase())) {
        return this.activate(name);
      }
    }

    if (cwd) {
      for (const [name, skill] of this.skills) {
      if (skill.manifest.paths) {
          for (const p of skill.manifest.paths) {
            const resolved = resolve(cwd, p);
            if (this.pathStartsWith(cwd, resolved)) {
              return this.activate(name);
            }
          }
        }
      }
    }

    return null;
  }

  activate(name: string): LoadedSkill | null {
    const skill = this.skills.get(name);
    if (!skill) return null;
    if (!this.activeSkills.has(name)) {
      this.activeSkills.add(name);
      skill.active = true;
      skill.useCount++;
      skill.lastUsed = Date.now();
    }
    return skill;
  }

  getActiveContents(): string {
    const parts: string[] = [];
    for (const name of this.activeSkills) {
      const skill = this.skills.get(name);
      if (skill) {
        parts.push('\n--- Skill: ' + (skill.manifest.title || skill.manifest.name) + ' ---\n');
        parts.push(skill.skillMd);
      }
    }
    return parts.join('\n');
  }

  list(): LoadedSkill[] {
    return Array.from(this.skills.values());
  }

  getActiveNames(): string[] {
    return Array.from(this.activeSkills);
  }

  deactivate(name: string): boolean {
    const skill = this.skills.get(name);
    if (skill) {
      skill.active = false;
      return this.activeSkills.delete(name);
    }
    return false;
  }

  private pathStartsWith(dir: string, prefix: string): boolean {
    const n1 = dir.replace(/\\/g, '/').toLowerCase();
    const n2 = prefix.replace(/\\/g, '/').toLowerCase();
    return n1 === n2 || n1.startsWith(n2.endsWith('/') ? n2 : `${n2}/`);
  }
}
