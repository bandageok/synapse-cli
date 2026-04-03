import type { SlashCommand } from '../registry.js';

export const doctorCommand: SlashCommand = {
  name: 'doctor',
  description: 'Diagnose configuration',
  handler: async (_args, deps) => {
    const { existsSync } = await import('fs');
    const { join } = await import('path');
    const lines = [
      'Synapse Doctor',
      `  Data dir: ${deps.dataDir}`,
      `  Model: ${deps.model}`,
      `  SOUL.md: ${existsSync(join(deps.dataDir, 'SOUL.md')) ? '✅' : '❌'}`,
      `  MEMORY.md: ${existsSync(join(deps.dataDir, 'MEMORY.md')) ? '✅' : '❌'}`,
      `  Session: ${deps.turnCount} turns`,
    ];
    return lines.join('\n');
  },
};
