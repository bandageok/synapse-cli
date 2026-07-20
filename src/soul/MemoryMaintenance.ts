// Deterministic maintenance for the local memory index.

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';

export interface MemoryMaintenanceConfig {
  minHours: number;
  minSessions: number;
  maxIndexLines: number;
  maxIndexBytes: number;
  maxEntryChars: number;
  scanThrottleMs: number;
  leaseTimeoutMs: number;
}

export interface MemoryMaintenanceResult {
  success: boolean;
  filesUpdated?: string[];
  filesPruned?: string[];
  indexUpdated?: boolean;
  summary?: string;
  error?: string;
}

interface MaintenanceState {
  version: 1;
  lastCompletedAt: number;
}

const DEFAULT_CONFIG: MemoryMaintenanceConfig = {
  minHours: 24,
  minSessions: 5,
  maxIndexLines: 200,
  maxIndexBytes: 25_000,
  maxEntryChars: 200,
  scanThrottleMs: 10 * 60 * 1000,
  leaseTimeoutMs: 30 * 60 * 1000,
};

const STATE_FILE = '.memory-maintenance.json';
const LEASE_FILE = '.memory-maintenance.lock';
const LEGACY_STATE_FILE = '.dream-lock.json';

export class MemoryMaintenance {
  private readonly config: MemoryMaintenanceConfig;
  private lastSessionScanAt = 0;

  constructor(
    private readonly dataDir: string,
    config?: Partial<MemoryMaintenanceConfig>,
  ) {
    this.config = validateConfig({ ...DEFAULT_CONFIG, ...config });
  }

  shouldTrigger(): boolean {
    const now = Date.now();
    if (this.hasActiveLease(now)) return false;

    const state = this.readState();
    const elapsedHours = (now - state.lastCompletedAt) / 3_600_000;
    if (elapsedHours < this.config.minHours) return false;

    if (
      this.lastSessionScanAt > 0 &&
      now - this.lastSessionScanAt < this.config.scanThrottleMs
    ) {
      return false;
    }

    this.lastSessionScanAt = now;
    return this.countSessionsSince(state.lastCompletedAt) >= this.config.minSessions;
  }

  forceTrigger(): boolean {
    return !this.hasActiveLease(Date.now());
  }

  async run(): Promise<MemoryMaintenanceResult> {
    const startedAt = Date.now();
    if (!this.acquireLease(startedAt)) {
      return { success: false, error: 'Memory maintenance is already running.' };
    }

    try {
      const result = this.maintainIndex();
      this.writeState({ version: 1, lastCompletedAt: Date.now() });
      return { success: true, ...result };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.releaseLease();
    }
  }

  private maintainIndex(): Omit<MemoryMaintenanceResult, 'success' | 'error'> {
    const archiveDir = join(this.dataDir, 'memory');
    mkdirSync(archiveDir, { recursive: true });

    const indexPath = join(this.dataDir, 'MEMORY.md');
    if (!existsSync(indexPath)) {
      return {
        filesUpdated: [],
        filesPruned: [],
        indexUpdated: false,
        summary: 'No MEMORY.md file exists; no maintenance was needed.',
      };
    }

    const original = readFileSync(indexPath, 'utf-8').replace(/\r\n/g, '\n').trimEnd();
    const beforeLines = original.length === 0 ? 0 : original.split('\n').length;
    const compacted = compactMemoryIndex(original.split('\n'), this.config);
    const next = compacted.join('\n').trimEnd();

    if (next === original) {
      return {
        filesUpdated: [],
        filesPruned: [],
        indexUpdated: false,
        summary: `MEMORY.md already satisfies the ${this.config.maxIndexLines}-line and ${this.config.maxIndexBytes}-byte limits.`,
      };
    }

    writeTextAtomic(indexPath, next.length > 0 ? `${next}\n` : '');
    const afterLines = next.length === 0 ? 0 : next.split('\n').length;
    return {
      filesUpdated: [indexPath],
      filesPruned: [indexPath],
      indexUpdated: true,
      summary: `Compacted MEMORY.md from ${beforeLines} to ${afterLines} lines.`,
    };
  }

  private countSessionsSince(timestamp: number): number {
    const sessionsDir = join(this.dataDir, 'sessions');
    if (!existsSync(sessionsDir)) return 0;

    try {
      return readdirSync(sessionsDir)
        .filter(file => file.endsWith('.json'))
        .filter(file => {
          try {
            return statSync(join(sessionsDir, file)).mtimeMs > timestamp;
          } catch {
            return false;
          }
        }).length;
    } catch {
      return 0;
    }
  }

  private readState(): MaintenanceState {
    const current = readJson(join(this.dataDir, STATE_FILE));
    if (isRecord(current) && current.version === 1 && isTimestamp(current.lastCompletedAt)) {
      return { version: 1, lastCompletedAt: current.lastCompletedAt };
    }

    const legacy = readJson(join(this.dataDir, LEGACY_STATE_FILE));
    if (isRecord(legacy) && isTimestamp(legacy.lastConsolidatedAt)) {
      return { version: 1, lastCompletedAt: legacy.lastConsolidatedAt };
    }

    return { version: 1, lastCompletedAt: 0 };
  }

  private writeState(state: MaintenanceState): void {
    mkdirSync(this.dataDir, { recursive: true });
    writeTextAtomic(join(this.dataDir, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
  }

  private hasActiveLease(now: number): boolean {
    const leasePath = join(this.dataDir, LEASE_FILE);
    if (!existsSync(leasePath)) return false;
    try {
      return now - statSync(leasePath).mtimeMs <= this.config.leaseTimeoutMs;
    } catch {
      return false;
    }
  }

  private acquireLease(now: number): boolean {
    mkdirSync(this.dataDir, { recursive: true });
    const leasePath = join(this.dataDir, LEASE_FILE);

    if (existsSync(leasePath) && !this.hasActiveLease(now)) {
      try {
        rmSync(leasePath);
      } catch {
        return false;
      }
    }

    let fd: number | null = null;
    try {
      fd = openSync(leasePath, 'wx');
      writeFileSync(fd, `${JSON.stringify({ version: 1, acquiredAt: now })}\n`);
      return true;
    } catch {
      if (fd !== null) {
        try {
          rmSync(leasePath);
        } catch {
          // The incomplete lease may already have been removed.
        }
      }
      return false;
    } finally {
      if (fd !== null) closeSync(fd);
    }
  }

  private releaseLease(): void {
    try {
      rmSync(join(this.dataDir, LEASE_FILE));
    } catch {
      // A missing lease is already released.
    }
  }
}

export function compactMemoryIndex(
  lines: string[],
  config: Pick<MemoryMaintenanceConfig, 'maxIndexLines' | 'maxIndexBytes' | 'maxEntryChars'>,
): string[] {
  const result: string[] = [];
  const seenEntries = new Set<string>();
  let previousWasBlank = false;

  for (const rawLine of lines) {
    let line = rawLine.trimEnd();
    const isBlank = line.trim().length === 0;
    if (isBlank) {
      if (!previousWasBlank && result.length > 0) result.push('');
      previousWasBlank = true;
      continue;
    }

    previousWasBlank = false;
    if (/^\s*[-*]\s+/.test(line)) {
      const key = line.trim();
      if (seenEntries.has(key)) continue;
      seenEntries.add(key);
      if (line.length > config.maxEntryChars) {
        line = `${line.slice(0, Math.max(0, config.maxEntryChars - 3))}...`;
      }
    }
    result.push(line);
  }

  while (result.at(-1) === '') result.pop();
  if (result.length > config.maxIndexLines) result.length = config.maxIndexLines;
  while (
    result.length > 0 &&
    Buffer.byteLength(result.join('\n'), 'utf-8') > config.maxIndexBytes
  ) {
    result.pop();
  }
  while (result.at(-1) === '') result.pop();
  return result;
}

function validateConfig(config: MemoryMaintenanceConfig): MemoryMaintenanceConfig {
  for (const [name, value] of Object.entries(config)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Memory maintenance config ${name} must be a non-negative number.`);
    }
  }
  for (const name of ['minSessions', 'maxIndexLines', 'maxIndexBytes', 'maxEntryChars'] as const) {
    if (!Number.isInteger(config[name])) {
      throw new Error(`Memory maintenance config ${name} must be an integer.`);
    }
  }
  if (config.maxIndexLines < 1 || config.maxIndexBytes < 1 || config.maxEntryChars < 4) {
    throw new Error('Memory index limits must allow at least one line, one byte, and a four-character entry.');
  }
  return config;
}

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function writeTextAtomic(path: string, content: string): void {
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, content, 'utf-8');
  try {
    renameSync(tempPath, path);
  } catch (error) {
    try {
      rmSync(tempPath);
    } catch {
      // Preserve the original write error.
    }
    throw error;
  }
}
