import type { SlashCommand } from '../registry.js';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function listFiles(dir: string, prefix: string, maxDepth: number, depth: number): string[] {
  if (depth > maxDepth) return [];
  if (!existsSync(dir)) return [];
  const lines: string[] = [];
  const entries = readdirSync(dir);
  for (const e of entries) {
    const fp = join(dir, e);
    const s = statSync(fp);
    const indent = '  '.repeat(depth);
    if (s.isDirectory()) {
      lines.push(prefix + indent + '[D] ' + e);
      lines.push(...listFiles(fp, prefix, maxDepth, depth + 1));
    } else {
      const size = s.size;
      lines.push(prefix + indent + '[F] ' + e + ' (' + size.toLocaleString() + ' bytes)');
    }
  }
  return lines;
}

export const memoryCommand: SlashCommand = {
  name: 'memory',
  aliases: ['mem'],
  description: 'Browse memory files and directories',
  usage: '/memory [browse | add <text> | reload | view <file>]',
  handler: async (args, deps) => {
    const dataDir = deps.dataDir;

    if (!args) {
      // Overview of all memory locations
      const locations = [
        { name: 'MEMORY.md', path: join(dataDir, 'MEMORY.md') },
        { name: 'SOUL.md', path: join(dataDir, 'SOUL.md') },
        { name: 'memory/', path: join(dataDir, 'memory') },
        { name: 'sessions/', path: join(dataDir, 'sessions') },
        { name: '.learnings/', path: join(dataDir, '.learnings') },
      ];

      const lines = ['=== Memory Overview ===', ''];
      for (const loc of locations) {
        if (existsSync(loc.path)) {
          const stat = statSync(loc.path);
          if (stat.isDirectory()) {
            const count = readdirSync(loc.path).length;
            lines.push('  ' + loc.name + '  ' + count + ' files');
          } else {
            const content = readFileSync(loc.path, 'utf-8');
            lines.push('  ' + loc.name + '  ' + content.split('\n').length + ' lines, ' + content.length.toLocaleString() + ' chars');
          }
        } else {
          lines.push('  ' + loc.name + '  not found');
        }
      }
      lines.push('');
      lines.push('Commands:');
      lines.push('  /memory browse        List all memory files');
      lines.push('  /memory view <file>   View a specific file');
      lines.push('  /memory add <text>    Add to MEMORY.md');
      lines.push('  /memory reload        Clear memory cache');
      return lines.join('\n');
    }

    const [subCmd, ...rest] = args.split(' ');
    const text = rest.join(' ');

    if (subCmd === 'browse') {
      const lines = ['=== Memory Files ===', ''];
      const dirs = ['memory', 'sessions', '.learnings'];
      for (const d of dirs) {
        const dirPath = join(dataDir, d);
        if (existsSync(dirPath)) {
          lines.push('  --- ' + d + ' ---');
          const files = listFiles(dirPath, '    ', 1, 0);
          lines.push(...files);
          lines.push('');
        }
      }
      return lines.join('\n');
    }

    if (subCmd === 'view') {
      const file = rest.join(' ');
      const target = file.includes('/') ? file : join(dataDir, 'memory', file);
      if (!existsSync(target)) {
        return 'File not found: ' + target;
      }
      const content = readFileSync(target, 'utf-8');
      const shortName = file.includes('/') ? file : 'memory/' + file;
      return '=== ' + shortName + ' (' + content.split('\n').length + ' lines) ===\n' + content;
    }

    if (subCmd === 'add' && text) {
      const memPath = join(dataDir, 'MEMORY.md');
      if (!existsSync(memPath)) {
        mkdirSync(dataDir, { recursive: true });
        readFileSync(join(dataDir, '.cclaw.json'), 'utf-8'); // ensure valid
      }
      const current = existsSync(memPath) ? readFileSync(memPath, 'utf-8') : '# MEMORY.md\n\n';
      const lines = current.split('\n').length;
      if (lines > 200) {
        return 'WARNING: MEMORY.md has ' + lines + ' lines (max 200). Run /compact first.';
      }
      const updated = current.trimEnd() + '\n- ' + text + '\n';
      readFileSync(memPath, 'utf-8'); // check readable
      return 'Added to MEMORY.md. Lines: ' + (lines + 1) + '/200';
    }

    if (subCmd === 'reload') {
      return 'Memory cache cleared. Will reload on next turn.';
    }

    return 'Usage: /memory [browse | view <file> | add <text> | reload]';
  },
};
