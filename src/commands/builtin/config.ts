import type { SlashCommand } from '../registry.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const configCommand: SlashCommand = {
  name: 'config',
  description: 'Show current configuration',
  handler: async (_args, deps) => {
    const dataDir = deps.dataDir;
    const cfgPath = join(dataDir, '.cclaw.json');
    let cfg: any = {};
    if (existsSync(cfgPath)) {
      try { cfg = JSON.parse(readFileSync(cfgPath, 'utf-8')); } catch {}
    }

    const lines = [
      '--- Configuration ---',
      '',
      '  Data dir:    ' + dataDir,
      '  Model:       ' + (cfg.model || deps.model || '(not set)'),
      '  Provider:    ' + (cfg.provider || '(auto)'),
      '  Base URL:    ' + (cfg.baseUrl || '(default)'),
      '  Turns:       ' + deps.turnCount,
      '',
      '  Files:',
      '  .cclaw.json    ' + (existsSync(cfgPath) ? 'found' : 'missing'),
      '  SOUL.md        ' + (existsSync(join(dataDir, 'SOUL.md')) ? 'found' : 'missing'),
      '  MEMORY.md      ' + (existsSync(join(dataDir, 'MEMORY.md')) ? 'found' : 'missing'),
      '  permissions    ' + (existsSync(join(dataDir, 'permissions.json')) ? 'found' : 'missing'),
      '  .env           ' + (existsSync(join(dataDir, '.env')) ? 'found' : 'missing'),
    ];
    return lines.join('\n');
  },
};
