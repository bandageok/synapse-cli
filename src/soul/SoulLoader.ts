// src/soul/SoulLoader.ts
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export class SoulLoader {
  constructor(private dataDir: string) {}

  load(): string {
    const path = join(this.dataDir, 'SOUL.md');
    return existsSync(path) ? readFileSync(path, 'utf-8') : '';
  }
}
