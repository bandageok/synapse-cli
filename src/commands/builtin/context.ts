import type { SlashCommand } from '../registry.js';

export const contextCommand: SlashCommand = {
  name: 'context',
  description: 'Show current context layers and loaded files',
  handler: async (_args, deps) => {
    const { existsSync, readFileSync, readdirSync } = await import('fs');
    const { join } = await import('path');

    const lines: string[] = [];
    const cwd = process.cwd();

    // Layer 1: Default prompt
    lines.push('📦 Layer 1: Default prompt ✅');

    // Layer 2: SOUL.md
    const soulPath = join(deps.dataDir, 'SOUL.md');
    if (existsSync(soulPath)) {
      const size = readFileSync(soulPath, 'utf-8').length;
      lines.push(`📦 Layer 2: SOUL.md ✅ (${size} chars)`);
    } else {
      lines.push('📦 Layer 2: SOUL.md ❌ not found');
    }

    // Layer 3: Memory mechanics
    lines.push('📦 Layer 3: Memory mechanics ✅');

    // Layer 4: User context (详细)
    lines.push('📦 Layer 4: User context');
    const userConfig = join(deps.dataDir, '.synapse.md');
    const projectConfig = join(cwd, '.synapse.md');
    const memoryPath = join(deps.dataDir, 'MEMORY.md');

    if (existsSync(userConfig)) {
      const size = readFileSync(userConfig, 'utf-8').length;
      lines.push(`    ├── ~/.synapse.md ✅ (${size} chars)`);
    } else {
      lines.push('    ├── ~/.synapse.md ❌');
    }
    if (existsSync(projectConfig)) {
      const size = readFileSync(projectConfig, 'utf-8').length;
      lines.push(`    ├── ./.synapse.md ✅ (${size} chars)`);
    } else {
      lines.push('    ├── ./.synapse.md ❌');
    }
    if (existsSync(memoryPath)) {
      const content = readFileSync(memoryPath, 'utf-8');
      const lineCount = content.split('\n').length;
      lines.push(`    ├── MEMORY.md ✅ (${lineCount} lines, ${content.length} chars)`);
    } else {
      lines.push('    ├── MEMORY.md ❌');
    }

    // CLAUDE.md 文件发现
    const claudeFiles = ['CLAUDE.md', '.synapse/CLAUDE.md', 'CLAUDE.local.md'];
    for (const f of claudeFiles) {
      const p = join(cwd, f);
      if (existsSync(p)) {
        const size = readFileSync(p, 'utf-8').length;
        lines.push(`    ├── ${f} ✅ (${size} chars)`);
      }
    }

    // .synapse/rules/*.md
    const rulesDir = join(cwd, '.synapse', 'rules');
    if (existsSync(rulesDir)) {
      const rules = readdirSync(rulesDir).filter((f: string) => f.endsWith('.md'));
      if (rules.length > 0) {
        lines.push(`    └── .synapse/rules/ ✅ (${rules.length} rules: ${rules.join(', ')})`);
      }
    }

    // Layer 5: System context
    lines.push(`📦 Layer 5: System context`);
    lines.push(`    ├── cwd: ${cwd}`);
    lines.push(`    ├── platform: ${process.platform}`);
    lines.push(`    └── node: ${process.version}`);

    // Layer 6: Dynamic reminders
    lines.push(`📦 Layer 6: Dynamic reminders: ${deps.turnCount > 1 ? 'active' : 'inactive (turn 1)'}`);

    // Token estimate (使用精确计数)
    let totalChars = 0;
    for (const msg of deps.messages) {
      if (typeof msg.content === 'string') totalChars += msg.content.length;
      else totalChars += JSON.stringify(msg.content).length;
    }
    const estimatedTokens = Math.round(totalChars / 4);

    return `${lines.join('\n')}\n\n📊 Messages: ${deps.messages.length} | ~${estimatedTokens} tokens | Turn: ${deps.turnCount}`;
  },
};
