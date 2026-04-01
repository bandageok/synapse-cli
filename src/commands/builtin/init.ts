import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';
import type { SlashCommand } from '../registry.js';

export const initCommand: SlashCommand = {
  name: 'init',
  description: 'Initialize ~/.cclaw/ config',
  handler: async (_args, deps) => {
    const dataDir = deps.dataDir;
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

    const templateDir = join(import.meta.url.replace('file:///', ''), '..', '..', '..', 'templates').replace(/%20/g, ' ');
    const files = ['SOUL.md', 'USER.md', 'IDENTITY.md', 'MEMORY.md', 'HEARTBEAT.md', 'TOOLS.md'];

    let created = 0;
    for (const file of files) {
      const dst = join(dataDir, file);
      if (!existsSync(dst)) {
        try {
          copyFileSync(join(templateDir, file), dst);
          created++;
        } catch {}
      }
    }

    for (const dir of ['memory', 'sessions']) {
      const dirPath = join(dataDir, dir);
      if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
    }

    return `Done. ${created} files created.`;
  },
};
