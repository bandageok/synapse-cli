// src/soul/Heartbeat.ts
// In-process maintenance scheduler. It never executes commands from user files.

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type {
  MemoryMaintenance,
  MemoryMaintenanceResult,
} from './MemoryMaintenance.js';
import { Logger } from '../core/Logger.js';

export interface HeartbeatTask {
  name: string;
  intervalMs: number;
  lastRun: number;
}

interface ScheduledTask extends HeartbeatTask {
  run: () => void;
}

export class Heartbeat {
  private tasks: ScheduledTask[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private memoryMaintenance: MemoryMaintenance | null = null;
  private logger: Logger;

  constructor(private dataDir: string) {
    this.logger = new Logger({ dataDir, level: 'info' });
    this.loadBuiltinTasks();
  }

  setMemoryMaintenance(memoryMaintenance: MemoryMaintenance): void {
    this.memoryMaintenance = memoryMaintenance;
  }

  private loadBuiltinTasks(): void {
    this.tasks.push({
      name: 'memory-limit-observer',
      intervalMs: 24 * 60 * 60 * 1000,
      lastRun: 0,
      run: () => {
        const memoryPath = join(this.dataDir, 'MEMORY.md');
        if (!existsSync(memoryPath)) return;
        const lineCount = readFileSync(memoryPath, 'utf-8').split('\n').length;
        if (lineCount > 200) {
          this.logger.warn(
            `[Heartbeat] MEMORY.md has ${lineCount} lines; run synapse memory prune before adding more entries`,
          );
        }
      },
    });

    this.tasks.push({
      name: 'session-retention-observer',
      intervalMs: 7 * 24 * 60 * 60 * 1000,
      lastRun: 0,
      run: () => {
        const sessionsDir = join(this.dataDir, 'sessions');
        if (!existsSync(sessionsDir)) return;
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const oldSessionCount = readdirSync(sessionsDir)
          .filter(file => file.endsWith('.json'))
          .filter(file => {
            try {
              return statSync(join(sessionsDir, file)).mtimeMs < cutoff;
            } catch {
              return false;
            }
          }).length;
        if (oldSessionCount > 0) {
          this.logger.info(
            `[Heartbeat] ${oldSessionCount} session files are older than 30 days; review them before manual removal`,
          );
        }
      },
    });
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, 60_000);
    this.logger.info(`[Heartbeat] Started with ${this.tasks.length} in-process tasks`);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Run due maintenance checks without invoking a host shell. */
  async runOnce(now = Date.now()): Promise<void> {
    for (const task of this.tasks) {
      if (now - task.lastRun < task.intervalMs) continue;
      task.lastRun = now;
      try {
        task.run();
      } catch (error: unknown) {
        this.logger.warn(`[Heartbeat] ${task.name} failed: ${toErrorMessage(error)}`);
      }
    }

    if (this.memoryMaintenance && this.memoryMaintenance.shouldTrigger()) {
      this.logger.info('[Heartbeat] Memory maintenance triggered');
      try {
        const result: MemoryMaintenanceResult = await this.memoryMaintenance.run();
        if (result.success) {
          this.logger.info(`[Heartbeat] Memory maintenance completed: ${result.summary}`);
        } else {
          this.logger.warn(`[Heartbeat] Memory maintenance skipped: ${result.error ?? 'unknown error'}`);
        }
      } catch (error: unknown) {
        this.logger.warn(`[Heartbeat] Memory maintenance failed: ${toErrorMessage(error)}`);
      }
    }
  }

  getTasks(): HeartbeatTask[] {
    return this.tasks.map(({ name, intervalMs, lastRun }) => ({ name, intervalMs, lastRun }));
  }

}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
