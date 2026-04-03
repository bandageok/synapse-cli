import type { SlashCommand } from '../registry.js';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

export const statusCommand: SlashCommand = {
  name: 'status',
  description: 'Show system status overview',
  handler: async (_args, deps) => {
    const dataDir = deps.dataDir;
    const lines = [
      '=== Synapse Status ===',
      '',
      '-- Core --',
      '  Version:     0.2.0',
      '  Model:       ' + deps.model,
      '  Provider:    auto-detected',
      '  Turns:       ' + deps.turnCount,
      '',
      '-- Directories --',
      '  Data dir:    ' + dataDir,
      '  Config:      ' + (existsSync(join(dataDir, '.cclaw.json')) ? 'yes' : 'no'),
      '  SOUL.md:     ' + (existsSync(join(dataDir, 'SOUL.md')) ? 'yes' : 'no'),
      '  MEMORY.md:   ' + (existsSync(join(dataDir, 'MEMORY.md')) ? 'yes' : 'no'),
      '  permissions: ' + (existsSync(join(dataDir, 'permissions.json')) ? 'yes' : 'no'),
    ];

    // Session count
    const sessionsDir = join(dataDir, 'sessions');
    if (existsSync(sessionsDir)) {
      const sessions = readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
      lines.push('  Sessions:    ' + sessions.length + ' saved');
    }

    // Memory size
    const memPath = join(dataDir, 'MEMORY.md');
    if (existsSync(memPath)) {
      const memContent = readFileSync(memPath, 'utf-8');
      lines.push('  MEMORY.md:   ' + memContent.split('\n').length + ' lines');
    }

    // Soul size
    const soulPath = join(dataDir, 'SOUL.md');
    if (existsSync(soulPath)) {
      const soulContent = readFileSync(soulPath, 'utf-8');
      lines.push('  SOUL.md:     ' + soulContent.split('\n').length + ' lines');
    }

    return lines.join('\n');
  },
};
