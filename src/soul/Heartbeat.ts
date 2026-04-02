// src/soul/Heartbeat.ts
// 定时任务引擎 — 借鉴 OpenClaw HEARTBEAT.md 驱动模式
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Dream, DreamResult } from './Dream.js';
import { Logger } from '../core/Logger.js';

export interface HeartbeatTask {
  name: string;
  command: string;
  condition: (output: string) => boolean;
  action: (output: string) => void;
  intervalMs: number;
  lastRun: number;
}

export class Heartbeat {
  private tasks: HeartbeatTask[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly defaultInterval = 5 * 60 * 1000; // 5 minutes
  private dream: Dream | null = null;
  private memoryExtractor: { extract: () => Promise<void> } | null = null;
  private logger: Logger;

  constructor(private dataDir: string) {
    this.logger = new Logger({ dataDir, level: 'info' });
    this.loadBuiltinTasks();
    this.loadHeartbeatMd();
  }

  /** 设置 Dream 实例（可选） */
  setDream(dream: Dream): void {
    this.dream = dream;
  }

  /** 设置 MemoryExtractor 实例（可选） */
  setMemoryExtractor(extractor: { extract: () => Promise<void> }): void {
    this.memoryExtractor = extractor;
  }

  private loadBuiltinTasks(): void {
    // 内置任务1: MEMORY.md 归档检查
    this.tasks.push({
      name: 'memory-archive',
      command: `wc -l < "${join(this.dataDir, 'MEMORY.md')}"`,
      condition: (output) => {
        const lines = parseInt(output.trim(), 10);
        return !isNaN(lines) && lines > 200;
      },
      action: () => {
        // Archive overflow — delegated to MemoryManager
        this.logger.info('[Heartbeat] MEMORY.md exceeds 200 lines, archiving...');
      },
      intervalMs: 24 * 60 * 60 * 1000, // daily
      lastRun: 0,
    });

    // 内置任务2: 会话日志清理 (30天以上)
    this.tasks.push({
      name: 'session-cleanup',
      command: process.platform === 'win32'
        ? `powershell -Command "Get-ChildItem '${join(this.dataDir, 'sessions')}' -Filter *.json | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Measure-Object | Select-Object -ExpandProperty Count"`
        : `find "${join(this.dataDir, 'sessions')}" -name "*.json" -mtime +30 | wc -l`,
      condition: (output) => parseInt(output.trim(), 10) > 0,
      action: (output) => {
        this.logger.info(`[Heartbeat] ${output.trim()} old sessions found for cleanup`);
      },
      intervalMs: 7 * 24 * 60 * 60 * 1000, // weekly
      lastRun: 0,
    });
  }

  private loadHeartbeatMd(): void {
    const heartbeatPath = join(this.dataDir, 'HEARTBEAT.md');
    if (!existsSync(heartbeatPath)) return;

    const content = readFileSync(heartbeatPath, 'utf-8');
    // Parse tasks from markdown sections
    const sections = content.split(/^## /m).filter(Boolean);

    for (const section of sections) {
      const lines = section.trim().split('\n');
      const name = lines[0].trim();
      const body = lines.slice(1).join('\n');

      // Extract command from code block
      const cmdMatch = body.match(/```(?:bash|powershell|sh)?\n([\s\S]*?)```/);
      if (cmdMatch) {
        this.tasks.push({
          name,
          command: cmdMatch[1].trim(),
          condition: (output) => output.trim().length > 0,
          action: (output) => {
            this.logger.info(`[Heartbeat:${name}] ${output.trim()}`);
          },
          intervalMs: this.defaultInterval,
          lastRun: 0,
        });
      }
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 60_000); // check every minute
    this.logger.info(`[Heartbeat] Started with ${this.tasks.length} tasks`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const now = Date.now();
    for (const task of this.tasks) {
      if (now - task.lastRun < task.intervalMs) continue;
      task.lastRun = now;
      try {
        const output = execSync(task.command, {
          encoding: 'utf-8',
          timeout: 10_000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        if (task.condition(output)) {
          task.action(output);
        }
      } catch {
        // silently skip failed tasks
      }
    }

    // Dream 整合检查
    if (this.dream && this.dream.shouldTrigger()) {
      this.logger.info('[Heartbeat] Dream consolidation triggered');
      this.dream.run().then((result: DreamResult) => {
        if (result.success) {
          this.logger.info(`[Heartbeat] Dream completed: ${result.summary}`);
        }
      }).catch(() => {});
    }

    // MemoryExtractor 检查（每天一次）
    if (this.memoryExtractor) {
      const sessionsDir = join(this.dataDir, 'sessions');
      if (existsSync(sessionsDir)) {
        const files = readdirSync(sessionsDir).filter((f: string) => f.endsWith('.json'));
        if (files.length > 0) {
          // 检查最近的会话是否已提取记忆
          const latestFile = files.sort().pop();
          const latestPath = join(sessionsDir, latestFile!);
          const stats = statSync(latestPath);
          const hoursSince = (Date.now() - stats.mtimeMs) / 3_600_000;
          if (hoursSince < 24) {
            this.logger.info(`[Heartbeat] Recent session found (${latestFile}), memory extraction available`);
          }
        }
      }
    }
  }

  getTasks(): { name: string; intervalMs: number; lastRun: number }[] {
    return this.tasks.map(t => ({ name: t.name, intervalMs: t.intervalMs, lastRun: t.lastRun }));
  }
}
