// src/soul/SessionIndex.ts
// Session indexing for memory retrieval
// Simplified from Claude Code SessionMemory

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface SessionEntry {
  id: string;
  timestamp: string;
  summary: string;
  topics: string[];
  messageCount: number;
}

/**
 * In-memory + on-disk session index. Stores lightweight summaries of past
 * sessions so the Dream consolidation and memory extraction can reference
 * prior context without reading full transcripts.
 */
export class SessionIndex {
  private entries: SessionEntry[] = [];
  private indexPath: string;

  constructor(private dataDir: string) {
    this.indexPath = join(dataDir, 'session-index.json');
    this.load();
  }

  /** Add a new session entry and persist. */
  add(entry: SessionEntry): void {
    this.entries.push(entry);
    this.save();
  }

  /** Search sessions by keyword match against summary and topics. */
  search(query: string): SessionEntry[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return this.recent();

    return this.entries
      .filter(e =>
        terms.some(
          t =>
            e.summary.toLowerCase().includes(t) ||
            e.topics.some(topic => topic.toLowerCase().includes(t)),
        ),
      )
      .slice(-5);
  }

  /** Return the most recent N sessions. */
  recent(limit = 10): SessionEntry[] {
    return this.entries.slice(-limit);
  }

  /** Total number of indexed sessions. */
  get count(): number {
    return this.entries.length;
  }

  /** Get all entries (for serialization / testing). */
  getAll(): SessionEntry[] {
    return [...this.entries];
  }

  /** Clear all entries (for testing). */
  clear(): void {
    this.entries = [];
    this.save();
  }

  private load(): void {
    if (!existsSync(this.indexPath)) return;
    try {
      const raw = readFileSync(this.indexPath, 'utf-8');
      this.entries = JSON.parse(raw);
    } catch {
      // Corrupted index — start fresh
      this.entries = [];
    }
  }

  private save(): void {
    const dir = join(this.dataDir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.indexPath, JSON.stringify(this.entries, null, 2));
  }
}
