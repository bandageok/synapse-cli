// src/core/Context.ts
// 7-layer context: default / soul / skills / memory / user / system / dynamic
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { MemoryLoader, type MemoryFileInfo } from './MemoryLoader.js';
import { SkillAutoLoader } from '../skills/AutoLoader.js';

export interface ContextConfig {
  dataDir: string;
  cwd: string;
  additionalDirs?: string[];
  soulLoader?: { load: () => string };
  skillLoader?: SkillAutoLoader;
}

export class ContextBuilder {
  private memoryLoader: MemoryLoader;
  private cachedMemoryFiles: MemoryFileInfo[] | null = null;
  private skillContents: string = '';

  constructor(private config: ContextConfig) {
    this.memoryLoader = new MemoryLoader({ dataDir: config.dataDir, cwd: config.cwd });
  }

  // Call from REPL before each turn to inject active skills
  injectSkills(contents: string): void {
    this.skillContents = contents;
  }

  // Call before build() to auto-match skills based on user input
  matchSkills(userInput: string): void {
    if (this.config.skillLoader) {
      this.config.skillLoader.autoMatch(userInput, this.config.cwd);
    }
  }

  async build(turnCount: number): Promise<string[]> {
    const memoryFiles = await this.loadMemoryFiles();
    return [
      this.layer1_defaultPrompt(),
      this.layer2_soul(),
      this.layer3_skills(),
      this.layer4_memoryMechanics(),
      this.layer5_userContext(memoryFiles),
      this.layer6_systemContext(),
      this.layer7_dynamicReminders(turnCount),
    ];
  }

  private async loadMemoryFiles(): Promise<MemoryFileInfo[]> {
    if (this.cachedMemoryFiles) return this.cachedMemoryFiles;
    this.cachedMemoryFiles = await this.memoryLoader.loadAll();
    return this.cachedMemoryFiles;
  }

  clearMemoryCache(): void { this.cachedMemoryFiles = null; }

  private layer1_defaultPrompt(): string {
    return 'You are Synapse, an agentic CLI assistant. You have access to tools and should use them to help the user.\nFollow these principles:\n- Be concise and direct\n- Use tools to verify information, never guess\n- If a task requires multiple steps, create a plan first\n- Report errors with root cause analysis';
  }

  private layer2_soul(): string {
    if (this.config.soulLoader) return this.config.soulLoader.load();
    const soulPath = join(this.config.dataDir, 'SOUL.md');
    if (existsSync(soulPath)) return readFileSync(soulPath, 'utf-8');
    return '';
  }

  // Layer 3 — Skills: auto-loaded via skillLoader, fall back to injectSkills()
  private layer3_skills(): string {
    // Prefer skillLoader (auto-discovered skills)
    if (this.config.skillLoader) {
      const contents = this.config.skillLoader.getActiveContents();
      if (!contents.trim()) return '';
      return '## Active Skills\nThe following skill instructions are currently active. You MUST follow them:\n' + contents;
    }
    // Fall back to legacy injectSkills()
    if (!this.skillContents.trim()) return '';
    return '## Active Skills\nThe following skill instructions are currently active. You MUST follow them:\n' + this.skillContents;
  }

  private layer4_memoryMechanics(): string {
    return '## Memory System\nYou have access to a persistent memory system:\n- MEMORY.md contains long-term memory (always loaded)\n- memory/ directory contains daily logs\n- CLAUDE.md files provide project/user instructions (auto-discovered)\n- .synapse/rules/*.md files provide conditional rules\n- Use the memory system to remember user preferences and project context\n- IMPORTANT: Never fabricate or assume memory content. Only reference what exists.';
  }

  private layer5_userContext(memoryFiles: MemoryFileInfo[]): string {
    const parts: string[] = [];
    const userConfig = join(this.config.dataDir, '.synapse.md');
    if (existsSync(userConfig)) parts.push(readFileSync(userConfig, 'utf-8'));
    const projectConfig = join(this.config.cwd, '.synapse.md');
    if (existsSync(projectConfig)) parts.push(readFileSync(projectConfig, 'utf-8'));
    const memoryPath = join(this.config.dataDir, 'MEMORY.md');
    if (existsSync(memoryPath)) {
      const memory = readFileSync(memoryPath, 'utf-8');
      if (memory.split('\n').length <= 200) parts.push('## Long-Term Memory\n' + memory);
    }
    const memoryContext = this.memoryLoader.formatAsContext(memoryFiles);
    if (memoryContext) parts.push(memoryContext);
    if (this.config.additionalDirs && this.config.additionalDirs.length > 0) {
      for (const dir of this.config.additionalDirs) {
        const claudeMdPath = join(dir, 'CLAUDE.md');
        if (existsSync(claudeMdPath)) parts.push('Contents of ' + claudeMdPath + ' (from --add-dir):\n\n' + readFileSync(claudeMdPath, 'utf-8'));
        const dotSynapsePath = join(dir, '.synapse', 'CLAUDE.md');
        if (existsSync(dotSynapsePath)) parts.push('Contents of ' + dotSynapsePath + ' (from --add-dir):\n\n' + readFileSync(dotSynapsePath, 'utf-8'));
      }
    }
    return parts.join('\n\n');
  }

  private layer6_systemContext(): string {
    const parts: string[] = [];
    parts.push('Working directory: ' + this.config.cwd);
    parts.push('Platform: ' + process.platform);
    parts.push('Node: ' + process.version);
    const gitStatus = this.getGitStatus();
    if (gitStatus) parts.push(gitStatus);
    return parts.join('\n');
  }

  private getGitStatus(): string | null {
    try {
      execSync('git rev-parse --git-dir', { cwd: this.config.cwd, encoding: 'utf-8', timeout: 3000, stdio: 'pipe' });
    } catch { return null; }
    try {
      const branch = execSync('git branch --show-current', { cwd: this.config.cwd, encoding: 'utf-8', timeout: 3000 }).trim();
      const mainBranch = this.getDefaultBranch();
      const status = execSync('git status --short', { cwd: this.config.cwd, encoding: 'utf-8', timeout: 3000 }).trim();
      const log = execSync('git log --oneline -5', { cwd: this.config.cwd, encoding: 'utf-8', timeout: 3000 }).trim();
      const userName = execSync('git config user.name', { cwd: this.config.cwd, encoding: 'utf-8', timeout: 3000 }).trim();
      const MAX_STATUS_CHARS = 2000;
      const truncatedStatus = status.length > MAX_STATUS_CHARS ? status.substring(0, MAX_STATUS_CHARS) + '\n... (truncated)' : status;
      return ['This is the git status at the start of the conversation. Note that this status is a snapshot in time, and will not update during the conversation.', 'Current branch: ' + branch, 'Main branch (you will usually use this for PRs): ' + mainBranch, ...(userName ? ['Git user: ' + userName] : []), 'Status:\n' + (truncatedStatus || '(clean)'), 'Recent commits:\n' + log].join('\n\n');
    } catch { return null; }
  }

  private getDefaultBranch(): string {
    try { return execSync('git symbolic-ref refs/remotes/origin/HEAD', { cwd: this.config.cwd, encoding: 'utf-8', timeout: 3000 }).trim().replace('refs/remotes/origin/', ''); }
    catch {
      try { execSync('git rev-parse --verify main', { cwd: this.config.cwd, encoding: 'utf-8', timeout: 3000, stdio: 'pipe' }); return 'main'; }
      catch { try { execSync('git rev-parse --verify master', { cwd: this.config.cwd, encoding: 'utf-8', timeout: 3000, stdio: 'pipe' }); return 'master'; } catch { return 'main'; } }
    }
  }

  private layer7_dynamicReminders(turnCount: number): string {
    if (turnCount <= 1) return '';
    const reminders: string[] = [];
    if (turnCount % 3 === 0) reminders.push('[Turn ' + turnCount + '] Review your progress. Are you still on track with the original task?');
    return reminders.join('\n');
  }
}
