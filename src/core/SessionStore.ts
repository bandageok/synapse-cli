// src/core/SessionStore.ts
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { Message, SessionMeta, SessionData } from './types.js';

export class SessionStore {
  constructor(private dir: string) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  async save(id: string, messages: Message[], metadata: SessionMeta): Promise<void> {
    const path = this.pathFor(id);
    const existing = this.read(path);
    const data: SessionData = {
      messages,
      metadata: {
        ...metadata,
        id,
        createdAt: existing?.metadata.createdAt ?? metadata.createdAt,
        updatedAt: new Date().toISOString(),
      },
    };
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf-8');
      renameSync(temporary, path);
    } catch (error) {
      if (existsSync(temporary)) unlinkSync(temporary);
      throw error;
    }
  }

  async load(id: string): Promise<SessionData | null> {
    return this.read(this.pathFor(id));
  }

  async list(): Promise<SessionMeta[]> {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter(f => f.endsWith('.json'))
      .map(f => this.read(join(this.dir, f))?.metadata)
      .filter((metadata): metadata is SessionMeta => metadata !== undefined)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async delete(id: string): Promise<void> {
    const path = this.pathFor(id);
    if (existsSync(path)) unlinkSync(path);
  }

  private pathFor(id: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) {
      throw new Error('Invalid session id. Use 1-128 letters, numbers, dots, underscores, or hyphens.');
    }
    return join(this.dir, `${id}.json`);
  }

  private read(path: string): SessionData | null {
    if (!existsSync(path)) return null;
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as SessionData;
      if (!parsed || !Array.isArray(parsed.messages) || !parsed.metadata?.id) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
