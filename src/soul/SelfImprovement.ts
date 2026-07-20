// src/soul/SelfImprovement.ts
// Local markdown journal for errors, corrections, and recurring learnings.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

export type LearningCategory = 'correction' | 'knowledge_gap' | 'best_practice' | 'error';

export interface LearningEntry {
  id: string;
  category: LearningCategory;
  summary: string;
  details: string;
  timestamp: string;
  occurrences: number;
}

export class SelfImprovement {
  private learningsDir: string;
  private errorsFile: string;
  private learningsFile: string;
  private featureRequestsFile: string;

  constructor(dataDir: string) {
    this.learningsDir = join(dataDir, '.learnings');
    if (!existsSync(this.learningsDir)) mkdirSync(this.learningsDir, { recursive: true });
    this.errorsFile = join(this.learningsDir, 'ERRORS.md');
    this.learningsFile = join(this.learningsDir, 'LEARNINGS.md');
    this.featureRequestsFile = join(this.learningsDir, 'FEATURE_REQUESTS.md');
  }

  // 记录错误
  logError(tool: string, command: string, error: string): void {
    const entry = this.formatEntry('error', `${tool} failed`, `Command: ${command}\nError: ${error}`);
    this.appendTo(this.errorsFile, entry);
  }

  // 记录用户纠正
  logCorrection(original: string, corrected: string): void {
    const entry = this.formatEntry('correction', 'User correction', `Original: ${original}\nCorrected: ${corrected}`);
    this.appendTo(this.learningsFile, entry);
  }

  // 记录知识缺口
  logKnowledgeGap(topic: string, details: string): void {
    const entry = this.formatEntry('knowledge_gap', `Knowledge gap: ${topic}`, details);
    this.appendTo(this.learningsFile, entry);
  }

  // 记录最佳实践
  logBestPractice(context: string, practice: string): void {
    const entry = this.formatEntry('best_practice', `Best practice: ${context}`, practice);
    this.appendTo(this.learningsFile, entry);
  }

  // 记录功能请求
  logFeatureRequest(description: string): void {
    const entry = this.formatEntry('correction', `Feature request`, description);
    this.appendTo(this.featureRequestsFile, entry);
  }

  // 检查是否有高频模式（3次以上重复）
  getHotPatterns(): LearningEntry[] {
    if (!existsSync(this.learningsFile)) return [];
    const content = readFileSync(this.learningsFile, 'utf-8');
    const entries = this.parseEntries(content);

    // Count by summary
    const counts = new Map<string, number>();
    for (const entry of entries) {
      counts.set(entry.summary, (counts.get(entry.summary) ?? 0) + 1);
    }

    return entries.filter(e => (counts.get(e.summary) ?? 0) >= 3);
  }

  // 获取最近的学习记录
  getRecent(limit = 10): LearningEntry[] {
    if (!existsSync(this.learningsFile)) return [];
    const content = readFileSync(this.learningsFile, 'utf-8');
    return this.parseEntries(content).slice(-limit);
  }

  private formatEntry(category: LearningCategory, summary: string, details: string): string {
    const timestamp = new Date().toISOString();
    return `\n## [${category}] ${summary}\n**Time**: ${timestamp}\n${details}\n`;
  }

  private appendTo(file: string, content: string): void {
    if (!existsSync(file)) {
      writeFileSync(file, `# ${file.split('/').pop()?.replace('.md', '') || 'Learnings'}\n`);
    }
    appendFileSync(file, content);
  }

  private parseEntries(content: string): LearningEntry[] {
    const entries: LearningEntry[] = [];
    const sections = content.split(/^## /m).filter(Boolean);

    for (const section of sections) {
      const lines = section.trim().split('\n');
      const header = lines[0];
      const match = header.match(/\[(\w+)\]\s*(.+)/);
      if (!match) continue;

      entries.push({
        id: `${entries.length}`,
        category: match[1].toLowerCase() as LearningCategory,
        summary: match[2],
        details: lines.slice(1).join('\n'),
        timestamp: '',
        occurrences: 1,
      });
    }

    return entries;
  }
}
