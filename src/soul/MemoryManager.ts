// src/soul/MemoryManager.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface MemoryEntry {
  category: 'user' | 'feedback' | 'project' | 'reference';
  content: string;
  importance: number;
}

export class MemoryManager {
  constructor(private dataDir: string) {}

  async enforceLimit(): Promise<void> {
    const path = join(this.dataDir, 'MEMORY.md');
    if (!existsSync(path)) return;

    const lines = readFileSync(path, 'utf-8').split('\n');
    if (lines.length <= 200) return;

    // Archive overflow
    const archiveDir = join(this.dataDir, 'memory');
    if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });

    const date = new Date().toISOString().split('T')[0];
    const overflow = lines.slice(200);
    writeFileSync(join(archiveDir, `archive-${date}.md`), overflow.join('\n'));

    // Keep top 200
    writeFileSync(path, lines.slice(0, 200).join('\n'));
  }

  parseEntries(): MemoryEntry[] {
    const path = join(this.dataDir, 'MEMORY.md');
    if (!existsSync(path)) return [];

    const content = readFileSync(path, 'utf-8');
    const entries: MemoryEntry[] = [];
    let currentCategory: MemoryEntry['category'] | null = null;
    let currentContent: string[] = [];

    for (const line of content.split('\n')) {
      const categoryMatch = line.match(/^## \[(\w+)\]/);
      if (categoryMatch) {
        if (currentCategory && currentContent.length) {
          entries.push({ category: currentCategory, content: currentContent.join('\n'), importance: 0.5 });
        }
        currentCategory = categoryMatch[1].toLowerCase() as MemoryEntry['category'];
        currentContent = [];
      } else if (currentCategory) {
        currentContent.push(line);
      }
    }

    if (currentCategory && currentContent.length) {
      entries.push({ category: currentCategory, content: currentContent.join('\n'), importance: 0.5 });
    }

    return entries;
  }

  getMemoryPath(): string {
    return join(this.dataDir, 'MEMORY.md');
  }
}
