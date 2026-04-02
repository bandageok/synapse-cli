// src/core/Context.ts
// 严格对标 Claude Code 的 context.ts + claudemd.ts 配置加载流程
// 6 层上下文构建 + 内存文件自动发现

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { MemoryLoader, type MemoryFileInfo } from './MemoryLoader.js';

export interface ContextConfig {
  dataDir: string;   // ~/.cclaw/
  cwd: string;       // current working directory
  additionalDirs?: string[];  // --add-dir 额外目录
  soulLoader?: { load: () => string };  // 可选 SoulLoader
}

export class ContextBuilder {
  private memoryLoader: MemoryLoader;
  private cachedMemoryFiles: MemoryFileInfo[] | null = null;

  constructor(private config: ContextConfig) {
    this.memoryLoader = new MemoryLoader({ dataDir: config.dataDir, cwd: config.cwd });
  }

  /**
   * 构建 6 层上下文（对标 Claude Code 的 getSystemContext + getUserContext）
   */
  async build(turnCount: number): Promise<string[]> {
    // 加载内存文件（带缓存）
    const memoryFiles = await this.loadMemoryFiles();

    return [
      this.layer1_defaultPrompt(),
      this.layer2_soul(),
      this.layer3_memoryMechanics(),
      this.layer4_userContext(memoryFiles),
      this.layer5_systemContext(),
      this.layer6_dynamicReminders(turnCount),
    ];
  }

  /**
   * 加载内存文件（带缓存，类似 Claude Code 的 getMemoryFiles）
   */
  private async loadMemoryFiles(): Promise<MemoryFileInfo[]> {
    if (this.cachedMemoryFiles) {
      return this.cachedMemoryFiles;
    }

    this.cachedMemoryFiles = await this.memoryLoader.loadAll();
    return this.cachedMemoryFiles;
  }

  /**
   * 清除内存文件缓存（修改文件后调用）
   */
  clearMemoryCache(): void {
    this.cachedMemoryFiles = null;
  }

  /**
   * Layer 1: 默认系统提示词
   */
  private layer1_defaultPrompt(): string {
    return `You are C.C.Claw, an agentic CLI assistant. You have access to tools and should use them to help the user.
Follow these principles:
- Be concise and direct
- Use tools to verify information, never guess
- If a task requires multiple steps, create a plan first
- Report errors with root cause analysis`;
  }

  /**
   * Layer 2: SOUL.md 人格定义
   */
  private layer2_soul(): string {
    // 优先使用 SoulLoader（支持缓存）
    if (this.config.soulLoader) {
      return this.config.soulLoader.load();
    }
    const soulPath = join(this.config.dataDir, 'SOUL.md');
    if (existsSync(soulPath)) {
      return readFileSync(soulPath, 'utf-8');
    }
    return '';
  }

  /**
   * Layer 3: 内存系统机制说明
   */
  private layer3_memoryMechanics(): string {
    return `## Memory System
You have access to a persistent memory system:
- MEMORY.md contains long-term memory (always loaded)
- memory/ directory contains daily logs
- CLAUDE.md files provide project/user instructions (auto-discovered)
- .cclaw/rules/*.md files provide conditional rules
- Use the memory system to remember user preferences and project context
- IMPORTANT: Never fabricate or assume memory content. Only reference what exists.`;
  }

  /**
   * Layer 4: 用户上下文（严格对标 Claude Code 的 getUserContext）
   * 包含：.cclaw.md + MEMORY.md + 所有发现的内存文件
   */
  private layer4_userContext(memoryFiles: MemoryFileInfo[]): string {
    const parts: string[] = [];

    // User-level .cclaw.md
    const userConfig = join(this.config.dataDir, '.cclaw.md');
    if (existsSync(userConfig)) {
      parts.push(readFileSync(userConfig, 'utf-8'));
    }

    // Project-level .cclaw.md
    const projectConfig = join(this.config.cwd, '.cclaw.md');
    if (existsSync(projectConfig)) {
      parts.push(readFileSync(projectConfig, 'utf-8'));
    }

    // MEMORY.md (200 line limit)
    const memoryPath = join(this.config.dataDir, 'MEMORY.md');
    if (existsSync(memoryPath)) {
      const memory = readFileSync(memoryPath, 'utf-8');
      if (memory.split('\n').length <= 200) {
        parts.push(`## Long-Term Memory\n${memory}`);
      }
    }

    // 自动发现的内存文件（CLAUDE.md, CLAUDE.local.md, rules/*.md）
    const memoryContext = this.memoryLoader.formatAsContext(memoryFiles);
    if (memoryContext) {
      parts.push(memoryContext);
    }

    // --add-dir 额外目录的 CLAUDE.md
    if (this.config.additionalDirs && this.config.additionalDirs.length > 0) {
      for (const dir of this.config.additionalDirs) {
        const claudeMdPath = join(dir, 'CLAUDE.md');
        if (existsSync(claudeMdPath)) {
          const content = readFileSync(claudeMdPath, 'utf-8');
          parts.push(`Contents of ${claudeMdPath} (from --add-dir):\n\n${content}`);
        }
        const dotCclawPath = join(dir, '.cclaw', 'CLAUDE.md');
        if (existsSync(dotCclawPath)) {
          const content = readFileSync(dotCclawPath, 'utf-8');
          parts.push(`Contents of ${dotCclawPath} (from --add-dir):\n\n${content}`);
        }
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Layer 5: 系统上下文（严格对标 Claude Code 的 getSystemContext）
   * 包含：工作目录 + 平台 + Git 状态
   */
  private layer5_systemContext(): string {
    const parts: string[] = [];
    parts.push(`Working directory: ${this.config.cwd}`);
    parts.push(`Platform: ${process.platform}`);
    parts.push(`Node: ${process.version}`);

    // Git 信息（严格对标 Claude Code 的 getGitStatus）
    const gitStatus = this.getGitStatus();
    if (gitStatus) {
      parts.push(gitStatus);
    }

    return parts.join('\n');
  }

  /**
   * 获取 Git 状态（严格对标 Claude Code 的 getGitStatus）
   */
  private getGitStatus(): string | null {
    try {
      // 检查是否是 Git 仓库
      execSync('git rev-parse --git-dir', {
        cwd: this.config.cwd,
        encoding: 'utf-8',
        timeout: 3000,
        stdio: 'pipe',
      });
    } catch {
      return null;
    }

    try {
      const [branch, mainBranch, status, log, userName] = [
        execSync('git branch --show-current', {
          cwd: this.config.cwd,
          encoding: 'utf-8',
          timeout: 3000,
        }).trim(),
        this.getDefaultBranch(),
        execSync('git status --short', {
          cwd: this.config.cwd,
          encoding: 'utf-8',
          timeout: 3000,
        }).trim(),
        execSync('git log --oneline -5', {
          cwd: this.config.cwd,
          encoding: 'utf-8',
          timeout: 3000,
        }).trim(),
        execSync('git config user.name', {
          cwd: this.config.cwd,
          encoding: 'utf-8',
          timeout: 3000,
        }).trim(),
      ];

      // 截断过长的 status（Claude Code 限制 2000 字符）
      const MAX_STATUS_CHARS = 2000;
      const truncatedStatus =
        status.length > MAX_STATUS_CHARS
          ? status.substring(0, MAX_STATUS_CHARS) +
            '\n... (truncated because it exceeds 2k characters. If you need more information, run "git status" using BashTool)'
          : status;

      return [
        `This is the git status at the start of the conversation. Note that this status is a snapshot in time, and will not update during the conversation.`,
        `Current branch: ${branch}`,
        `Main branch (you will usually use this for PRs): ${mainBranch}`,
        ...(userName ? [`Git user: ${userName}`] : []),
        `Status:\n${truncatedStatus || '(clean)'}`,
        `Recent commits:\n${log}`,
      ].join('\n\n');
    } catch {
      return null;
    }
  }

  /**
   * 获取默认分支名（Claude Code 的 getDefaultBranch）
   */
  private getDefaultBranch(): string {
    try {
      // 尝试获取 origin/HEAD 指向的分支
      const result = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
        cwd: this.config.cwd,
        encoding: 'utf-8',
        timeout: 3000,
      }).trim();
      return result.replace('refs/remotes/origin/', '');
    } catch {
      // 回退到 main 或 master
      try {
        execSync('git rev-parse --verify main', {
          cwd: this.config.cwd,
          encoding: 'utf-8',
          timeout: 3000,
          stdio: 'pipe',
        });
        return 'main';
      } catch {
        try {
          execSync('git rev-parse --verify master', {
            cwd: this.config.cwd,
            encoding: 'utf-8',
            timeout: 3000,
            stdio: 'pipe',
          });
          return 'master';
        } catch {
          return 'main'; // 默认
        }
      }
    }
  }

  /**
   * Layer 6: 动态提醒（每 3 轮检查进度）
   */
  private layer6_dynamicReminders(turnCount: number): string {
    if (turnCount <= 1) return '';

    const reminders: string[] = [];

    if (turnCount % 3 === 0) {
      reminders.push(`[Turn ${turnCount}] Review your progress. Are you still on track with the original task?`);
    }

    return reminders.join('\n');
  }
}
