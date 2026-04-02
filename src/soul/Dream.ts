// src/soul/Dream.ts
// Background memory consolidation — ported from Claude Code autoDream service
//
// Gate order (cheapest first):
//   1. Time: hours since lastConsolidated >= minHours
//   2. Sessions: session count since last consolidation >= minSessions
//   3. Lock: no other process mid-consolidation
//
// The "dream" runs a reflective pass over memory files, merging/pruning/
// reorganizing them so future sessions orient quickly.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { buildConsolidationPrompt } from './MemoryExtractor.js';
import { SessionIndex } from './SessionIndex.js';

// ============================================================================
// Config — ported from Claude Code autoDream/config.ts
// ============================================================================

export interface DreamConfig {
  /** Minimum hours since last consolidation before triggering */
  minHours: number;
  /** Minimum new sessions since last consolidation before triggering */
  minSessions: number;
  /** Maximum lines in MEMORY.md index */
  maxIndexLines: number;
  /** Maximum size of MEMORY.md in bytes */
  maxIndexBytes: number;
}

const DEFAULT_CONFIG: DreamConfig = {
  minHours: 24,
  minSessions: 5,
  maxIndexLines: 200,
  maxIndexBytes: 25_000,
};

// ============================================================================
// Lock file management — ported from Claude Code consolidationLock
// ============================================================================

interface LockState {
  lastConsolidatedAt: number;
  locked: boolean;
}

function getLockPath(dataDir: string): string {
  return join(dataDir, '.dream-lock.json');
}

function readLockState(dataDir: string): LockState {
  const lockPath = getLockPath(dataDir);
  if (!existsSync(lockPath)) {
    return { lastConsolidatedAt: 0, locked: false };
  }
  try {
    return JSON.parse(readFileSync(lockPath, 'utf-8'));
  } catch {
    return { lastConsolidatedAt: 0, locked: false };
  }
}

function writeLockState(dataDir: string, state: LockState): void {
  const lockPath = getLockPath(dataDir);
  const dir = dataDir;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(lockPath, JSON.stringify(state, null, 2));
}

// ============================================================================
// Dream Engine
// ============================================================================

export class Dream {
  private config: DreamConfig;
  private sessionIndex: SessionIndex;
  private lastSessionScanAt = 0;
  private static readonly SESSION_SCAN_INTERVAL_MS = 10 * 60 * 1000; // 10 min throttle

  constructor(
    private dataDir: string,
    config?: Partial<DreamConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionIndex = new SessionIndex(dataDir);
  }

  /**
   * Check if the dream consolidation should trigger.
   * Ported from Claude Code autoDream gate logic.
   */
  shouldTrigger(): boolean {
    const lock = readLockState(this.dataDir);

    // Gate 1: Lock — another consolidation is in progress
    if (lock.locked) return false;

    // Gate 2: Time — hours since last consolidation
    const hoursSince =
      (Date.now() - lock.lastConsolidatedAt) / 3_600_000;
    if (hoursSince < this.config.minHours) return false;

    // Gate 3: Scan throttle — don't scan sessions too frequently
    const sinceScanMs = Date.now() - this.lastSessionScanAt;
    if (
      this.lastSessionScanAt > 0 &&
      sinceScanMs < Dream.SESSION_SCAN_INTERVAL_MS
    ) {
      return false;
    }

    // Gate 4: Sessions — enough new sessions since last consolidation
    const sessionsSince = this.countSessionsSince(lock.lastConsolidatedAt);
    if (sessionsSince < this.config.minSessions) return false;

    return true;
  }

  /**
   * Run the dream consolidation.
   * Returns a summary of what was consolidated.
   *
   * In C.C.Claw this is a synchronous file-based operation.
   * The LLM prompt is generated but the actual LLM call happens
   * at the integration layer (Heartbeat or REPL hook).
   */
  async run(): Promise<DreamResult> {
    // Acquire lock
    const lock = readLockState(this.dataDir);
    const priorMtime = lock.lastConsolidatedAt;
    writeLockState(this.dataDir, {
      lastConsolidatedAt: lock.lastConsolidatedAt,
      locked: true,
    });

    try {
      this.lastSessionScanAt = Date.now();

      // Build the consolidation prompt
      const memoryDir = join(this.dataDir, 'memory');
      const sessionDir = join(this.dataDir, 'sessions');
      const sessionIds = this.getRecentSessionIds(lock.lastConsolidatedAt);

      const extra = `Sessions since last consolidation (${sessionIds.length}):\n${sessionIds.map(id => `- ${id}`).join('\n')}`;
      const prompt = buildConsolidationPrompt(memoryDir, sessionDir, extra);

      // Phase 1-4: Run consolidation operations
      const result = await this.consolidate(memoryDir);

      // Update lock — success
      writeLockState(this.dataDir, {
        lastConsolidatedAt: Date.now(),
        locked: false,
      });

      return {
        success: true,
        prompt,
        filesUpdated: result.filesUpdated,
        filesPruned: result.filesPruned,
        indexUpdated: result.indexUpdated,
        summary: result.summary,
      };
    } catch (e: unknown) {
      // Rollback lock on failure
      writeLockState(this.dataDir, {
        lastConsolidatedAt: priorMtime,
        locked: false,
      });
      return {
        success: false,
        error: (e as Error).message,
      };
    }
  }

  /**
   * Get the consolidation prompt without running the dream.
   * Useful for manual /dream commands or testing.
   */
  getPrompt(): string {
    const memoryDir = join(this.dataDir, 'memory');
    const sessionDir = join(this.dataDir, 'sessions');
    const lock = readLockState(this.dataDir);
    const sessionIds = this.getRecentSessionIds(lock.lastConsolidatedAt);
    const extra = `Sessions since last consolidation (${sessionIds.length}):\n${sessionIds.map(id => `- ${id}`).join('\n')}`;
    return buildConsolidationPrompt(memoryDir, sessionDir, extra);
  }

  /**
   * Force-trigger for testing — bypasses time/session gates but NOT lock.
   */
  forceTrigger(): boolean {
    const lock = readLockState(this.dataDir);
    return !lock.locked;
  }

  // --- Internal consolidation logic ---

  private async consolidate(memoryDir: string): Promise<{
    filesUpdated: string[];
    filesPruned: string[];
    indexUpdated: boolean;
    summary: string;
  }> {
    const filesUpdated: string[] = [];
    const filesPruned: string[] = [];

    if (!existsSync(memoryDir)) {
      mkdirSync(memoryDir, { recursive: true });
      return {
        filesUpdated,
        filesPruned,
        indexUpdated: false,
        summary: 'Created memory directory — no existing memories to consolidate.',
      };
    }

    // Phase 4: Prune MEMORY.md index
    const indexPath = join(memoryDir, 'MEMORY.md');
    let indexUpdated = false;
    if (existsSync(indexPath)) {
      const original = readFileSync(indexPath, 'utf-8');
      const lines = original.split('\n');
      const pruned = this.pruneIndex(lines);
      const prunedContent = pruned.join('\n');
      if (prunedContent !== original.trim()) {
        writeFileSync(indexPath, prunedContent);
        indexUpdated = true;
        filesPruned.push(indexPath);
      }
    }

    const summary = indexUpdated
      ? `Consolidated: pruned index from ${this.countLines(indexPath)} lines.`
      : 'No changes needed — memories are already tight.';

    return { filesUpdated, filesPruned, indexUpdated, summary };
  }

  /**
   * Prune the MEMORY.md index to stay under limits.
   * Ported from Claude Code Phase 4 logic.
   */
  private pruneIndex(lines: string[]): string[] {
    let result = lines;

    // Remove empty/duplicate lines
    result = result.filter(
      (line, i, arr) => line.trim().length > 0 && arr.indexOf(line) === i,
    );

    // Truncate verbose entries (>200 chars)
    result = result.map(line => {
      if (line.length > 200) {
        return line.slice(0, 197) + '...';
      }
      return line;
    });

    // Enforce max lines
    if (result.length > this.config.maxIndexLines) {
      result = result.slice(0, this.config.maxIndexLines);
    }

    // Enforce max bytes
    let content = result.join('\n');
    while (
      Buffer.byteLength(content, 'utf-8') > this.config.maxIndexBytes &&
      result.length > 1
    ) {
      result = result.slice(0, -1);
      content = result.join('\n');
    }

    return result;
  }

  private countSessionsSince(timestamp: number): number {
    return this.getRecentSessionIds(timestamp).length;
  }

  private getRecentSessionIds(since: number): string[] {
    const sessionsDir = join(this.dataDir, 'sessions');
    if (!existsSync(sessionsDir)) return [];

    try {
      return readdirSync(sessionsDir)
        .filter((f: string) => f.endsWith('.json'))
        .map((f: string) => ({
          id: f,
          mtime: statSync(join(sessionsDir, f)).mtimeMs,
        }))
        .filter((s: { id: string; mtime: number }) => s.mtime > since)
        .map((s: { id: string; mtime: number }) => s.id);
    } catch {
      return [];
    }
  }

  private countLines(filePath: string): number {
    if (!existsSync(filePath)) return 0;
    return readFileSync(filePath, 'utf-8').split('\n').length;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface DreamResult {
  success: boolean;
  prompt?: string;
  filesUpdated?: string[];
  filesPruned?: string[];
  indexUpdated?: boolean;
  summary?: string;
  error?: string;
}
