// src/core/MemoryLoader.ts
// 严格对标 Claude Code 的 claudemd.ts 配置加载流程
// 加载顺序：User → Project → Local（优先级递增）

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';

export type MemoryType = 'User' | 'Project' | 'Local' | 'Rules';

export interface MemoryFileInfo {
  path: string;
  type: MemoryType;
  content: string;
  parent?: string;
  globs?: string[];
}

export interface MemoryLoaderConfig {
  dataDir: string;    // ~/.cclaw/
  cwd: string;        // current working directory
}

const MAX_INCLUDE_DEPTH = 5;
const MAX_MEMORY_CHARACTER_COUNT = 40000;

export class MemoryLoader {
  private processedPaths = new Set<string>();

  constructor(private config: MemoryLoaderConfig) {}

  /**
   * 加载所有内存文件（严格按优先级顺序）
   * Claude Code 顺序：Managed → User → Project → Local
   * C.C.Claw 顺序：User → Project → Local → Rules
   */
  async loadAll(): Promise<MemoryFileInfo[]> {
    const result: MemoryFileInfo[] = [];
    this.processedPaths.clear();

    // 1. User memory (~/.cclaw/CLAUDE.md)
    result.push(...await this.loadUserMemory());

    // 2. Project memory (从 CWD 向上遍历到根)
    result.push(...await this.loadProjectMemory());

    // 3. Local memory (CLAUDE.local.md)
    result.push(...await this.loadLocalMemory());

    // 4. Rules (.cclaw/rules/*.md)
    result.push(...await this.loadRules());

    return result;
  }

  /**
   * 加载 User 级别内存 (~/.cclaw/CLAUDE.md)
   */
  private async loadUserMemory(): Promise<MemoryFileInfo[]> {
    const result: MemoryFileInfo[] = [];
    const userClaudeMd = join(this.config.dataDir, 'CLAUDE.md');

    if (existsSync(userClaudeMd)) {
      const files = await this.processMemoryFile(userClaudeMd, 'User');
      result.push(...files);
    }

    // 加载 User 级别的 rules (~/.cclaw/rules/*.md)
    const userRulesDir = join(this.config.dataDir, 'rules');
    result.push(...await this.loadRulesFromDir(userRulesDir, 'User'));

    return result;
  }

  /**
   * 加载 Project 级别内存（从 CWD 向上遍历）
   * Claude Code: CLAUDE.md, .claude/CLAUDE.md, .claude/rules/*.md
   * C.C.Claw: CLAUDE.md, .cclaw/CLAUDE.md, .cclaw/rules/*.md
   */
  private async loadProjectMemory(): Promise<MemoryFileInfo[]> {
    const result: MemoryFileInfo[] = [];
    const dirs = this.getDirectoriesUpward();

    // 从根向下加载（优先级递增）
    for (const dir of dirs.reverse()) {
      // CLAUDE.md (Project)
      const projectPath = join(dir, 'CLAUDE.md');
      if (existsSync(projectPath)) {
        result.push(...await this.processMemoryFile(projectPath, 'Project'));
      }

      // .cclaw/CLAUDE.md (Project)
      const dotCclawPath = join(dir, '.cclaw', 'CLAUDE.md');
      if (existsSync(dotCclawPath)) {
        result.push(...await this.processMemoryFile(dotCclawPath, 'Project'));
      }

      // .cclaw/rules/*.md (Project)
      const rulesDir = join(dir, '.cclaw', 'rules');
      result.push(...await this.loadRulesFromDir(rulesDir, 'Project'));
    }

    return result;
  }

  /**
   * 加载 Local 级别内存 (CLAUDE.local.md)
   */
  private async loadLocalMemory(): Promise<MemoryFileInfo[]> {
    const result: MemoryFileInfo[] = [];
    const dirs = this.getDirectoriesUpward();

    for (const dir of dirs.reverse()) {
      const localPath = join(dir, 'CLAUDE.local.md');
      if (existsSync(localPath)) {
        result.push(...await this.processMemoryFile(localPath, 'Local'));
      }
    }

    return result;
  }

  /**
   * 加载 Rules (.cclaw/rules/*.md)
   */
  private async loadRules(): Promise<MemoryFileInfo[]> {
    const result: MemoryFileInfo[] = [];
    const dirs = this.getDirectoriesUpward();

    for (const dir of dirs.reverse()) {
      const rulesDir = join(dir, '.cclaw', 'rules');
      result.push(...await this.loadRulesFromDir(rulesDir, 'Rules'));
    }

    return result;
  }

  /**
   * 从指定目录加载 .md 规则文件
   */
  private async loadRulesFromDir(rulesDir: string, type: MemoryType): Promise<MemoryFileInfo[]> {
    const result: MemoryFileInfo[] = [];

    if (!existsSync(rulesDir)) {
      return result;
    }

    try {
      const entries = readdirSync(rulesDir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = join(rulesDir, entry.name);

        if (entry.isDirectory()) {
          // 递归加载子目录
          result.push(...await this.loadRulesFromDir(entryPath, type));
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const files = await this.processMemoryFile(entryPath, type);
          result.push(...files);
        }
      }
    } catch {
      // 目录不存在或无权限，跳过
    }

    return result;
  }

  /**
   * 处理单个内存文件（支持 @include 指令）
   */
  private async processMemoryFile(
    filePath: string,
    type: MemoryType,
    depth: number = 0,
    parent?: string,
  ): Promise<MemoryFileInfo[]> {
    // 标准化路径（Windows 大小写不敏感）
    const normalizedPath = this.normalizePath(filePath);
    if (this.processedPaths.has(normalizedPath) || depth >= MAX_INCLUDE_DEPTH) {
      return [];
    }

    this.processedPaths.add(normalizedPath);

    try {
      const rawContent = readFileSync(filePath, 'utf-8');
      if (!rawContent.trim()) {
        return [];
      }

      // 解析内容（移除 HTML 注释，提取 @include）
      const { content, includePaths, globs } = this.parseMemoryFileContent(rawContent, filePath);

      const result: MemoryFileInfo[] = [];

      // 添加主文件
      result.push({
        path: filePath,
        type,
        content,
        parent,
        globs,
      });

      // 处理 @include 文件
      for (const includePath of includePaths) {
        const resolvedPath = this.resolveIncludePath(includePath, filePath);
        if (existsSync(resolvedPath)) {
          const includedFiles = await this.processMemoryFile(
            resolvedPath,
            type,
            depth + 1,
            filePath,
          );
          result.push(...includedFiles);
        }
      }

      return result;
    } catch {
      return [];
    }
  }

  /**
   * 解析内存文件内容（移除 HTML 注释，提取 @include 路径，提取 frontmatter globs）
   */
  private parseMemoryFileContent(rawContent: string, _filePath: string): {
    content: string;
    includePaths: string[];
    globs?: string[];
  } {
    let content = rawContent;
    const includePaths: string[] = [];
    let globs: string[] | undefined;

    // 1. 解析 frontmatter（提取 paths/globs）
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const pathsMatch = frontmatter.match(/paths:\s*\n((?:\s+-\s+.+\n?)*)/);
      if (pathsMatch) {
        const pathLines = pathsMatch[1].match(/- (.+)/g);
        if (pathLines) {
          globs = pathLines.map(line => line.replace(/- /, '').trim());
        }
      }
      // 移除 frontmatter
      content = content.slice(frontmatterMatch[0].length);
    }

    // 2. 移除 HTML 注释（<!-- ... -->）
    content = content.replace(/<!--[\s\S]*?-->/g, '');

    // 3. 提取 @include 路径
    const includeRegex = /(?:^|\s)@((?:[^\s\\]|\\ )+)/g;
    let match;
    while ((match = includeRegex.exec(content)) !== null) {
      let path = match[1];
      if (!path) continue;

      // 移除 fragment (#heading)
      const hashIndex = path.indexOf('#');
      if (hashIndex !== -1) {
        path = path.substring(0, hashIndex);
      }
      if (!path) continue;

      // 取消转义空格
      path = path.replace(/\\ /g, ' ');

      // 验证路径格式
      if (this.isValidIncludePath(path)) {
        includePaths.push(path);
      }
    }

    // 4. 截断过长内容（MEMORY.md 等）
    if (content.length > MAX_MEMORY_CHARACTER_COUNT) {
      content = content.substring(0, MAX_MEMORY_CHARACTER_COUNT) + '\n... (truncated)';
    }

    return { content: content.trim(), includePaths, globs };
  }

  /**
   * 验证 @include 路径格式
   */
  private isValidIncludePath(path: string): boolean {
    return (
      path.startsWith('./') ||
      path.startsWith('~/') ||
      (path.startsWith('/') && path !== '/') ||
      (!path.startsWith('@') &&
        !path.match(/^[#%^&*()]+/) &&
        path.match(/^[a-zA-Z0-9._-]/) !== null)
    );
  }

  /**
   * 解析 @include 路径为绝对路径
   */
  private resolveIncludePath(includePath: string, basePath: string): string {
    const baseDir = dirname(basePath);

    if (includePath.startsWith('./')) {
      return resolve(baseDir, includePath.slice(2));
    } else if (includePath.startsWith('~/')) {
      return resolve(this.config.dataDir, includePath.slice(2));
    } else if (includePath.startsWith('/')) {
      return includePath;
    } else {
      // 相对路径（无前缀）
      return resolve(baseDir, includePath);
    }
  }

  /**
   * 获取从 CWD 到根的所有目录
   */
  private getDirectoriesUpward(): string[] {
    const dirs: string[] = [];
    let currentDir = this.config.cwd;

    while (currentDir !== dirname(currentDir)) {
      dirs.push(currentDir);
      currentDir = dirname(currentDir);
    }
    // 添加根目录
    dirs.push(currentDir);

    return dirs;
  }

  /**
   * 标准化路径（Windows 兼容）
   */
  private normalizePath(path: string): string {
    return resolve(path).toLowerCase();
  }

  /**
   * 格式化内存文件为上下文字符串（对标 Claude Code 的 getClaudeMds）
   */
  formatAsContext(files: MemoryFileInfo[]): string {
    if (files.length === 0) return '';

    const memories: string[] = [];

    for (const file of files) {
      if (!file.content) continue;

      const description = this.getTypeDescription(file.type);
      memories.push(`Contents of ${file.path}${description}:\n\n${file.content}`);
    }

    if (memories.length === 0) return '';

    return `Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.\n\n${memories.join('\n\n')}`;
  }

  private getTypeDescription(type: MemoryType): string {
    switch (type) {
      case 'User':
        return " (user's private global instructions for all projects)";
      case 'Project':
        return ' (project instructions, checked into the codebase)';
      case 'Local':
        return " (user's private project instructions, not checked in)";
      case 'Rules':
        return ' (project rules)';
    }
  }
}
