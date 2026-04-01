// src/core/SessionStore.ts
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { Message, SessionMeta, SessionData } from './types.js';

export class SessionStore {
  constructor(private dir: string) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  async save(id: string, messages: Message[], metadata: SessionMeta): Promise<void> {
    const data: SessionData = {
      messages,
      metadata: { ...metadata, updatedAt: new Date().toISOString() },
    };
    writeFileSync(join(this.dir, `${id}.json`), JSON.stringify(data, null, 2));
  }

  async load(id: string): Promise<SessionData | null> {
    const path = join(this.dir, `${id}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  }

  async list(): Promise<SessionMeta[]> {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const data: SessionData = JSON.parse(readFileSync(join(this.dir, f), 'utf-8'));
        return data.metadata;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async delete(id: string): Promise<void> {
    const path = join(this.dir, `${id}.json`);
    if (existsSync(path)) unlinkSync(path);
  }
}
