// src/core/Logger.ts
// 日志系统 — 对标 OpenClaw logs

import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerConfig {
  dataDir: string;
  level?: LogLevel;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private logPath: string;
  private level: LogLevel;

  constructor(config: LoggerConfig) {
    const logsDir = join(config.dataDir, 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    this.logPath = join(logsDir, 'cclaw.log');
    this.level = config.level ?? 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}\n`;

    try {
      appendFileSync(this.logPath, line);
    } catch {
      // 日志写入失败不抛异常
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.write('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write('error', message, meta);
  }

  /** 获取日志文件路径 */
  getPath(): string {
    return this.logPath;
  }
}
