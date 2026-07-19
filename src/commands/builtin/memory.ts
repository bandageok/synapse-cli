import { join, resolve } from 'path';
import type { SlashCommand } from '../registry.js';
import {
  appendLongTermMemory,
  collectMemoryFiles,
  exportMemory,
  inspectMemory,
  pruneMemory,
  readManagedMemoryFile,
  searchMemory,
  type PruneScope,
} from '../../memory/management.js';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function overview(dataDir: string): string {
  const inspection = inspectMemory(dataDir);
  const lines = [
    '=== Memory Overview ===',
    `Root: ${inspection.dataDir}`,
    `Total: ${inspection.totalFiles} files, ${formatBytes(inspection.totalBytes)}`,
    '',
  ];
  for (const source of inspection.sources) {
    lines.push(`  ${source.source.padEnd(10)} ${source.files} files, ${formatBytes(source.bytes)}, ${source.lines} lines`);
  }
  const injected = inspection.files.filter(file => file.injected).map(file => file.relativePath);
  lines.push('', `Context injection: ${injected.length ? injected.join(', ') : 'none'}`);
  lines.push('', 'Commands:');
  lines.push('  /memory inspect');
  lines.push('  /memory search <text>');
  lines.push('  /memory add <text>');
  lines.push('  /memory browse');
  lines.push('  /memory view <relative-file>');
  lines.push('  /memory prune <days> [memory|learnings|sessions|all] [--yes]');
  lines.push('  /memory export [file]');
  lines.push('  /memory reload');
  return lines.join('\n');
}

export const memoryCommand: SlashCommand = {
  name: 'memory',
  aliases: ['mem'],
  description: 'Inspect, search, prune, and export persistent memory',
  usage: '/memory [inspect | search <text> | add <text> | browse | view <file> | prune <days> [scope] [--yes] | export [file] | reload]',
  handler: async (args, deps) => {
    const dataDir = deps.dataDir;
    const trimmed = args.trim();
    if (!trimmed || trimmed === 'inspect') return overview(dataDir);

    const [subCommand, ...rest] = trimmed.split(/\s+/);
    const text = rest.join(' ').trim();

    try {
      if (subCommand === 'browse') {
        const files = collectMemoryFiles(dataDir, { includeSessions: true });
        if (files.length === 0) return 'No memory files found.';
        return ['=== Memory Files ===', ...files.map(file =>
          `  ${file.relativePath}  ${formatBytes(file.bytes)}, ${file.lines} lines${file.injected ? ' [injected]' : ''}`
        )].join('\n');
      }

      if (subCommand === 'view') {
        if (!text) return 'Usage: /memory view <relative-file>';
        const file = readManagedMemoryFile(dataDir, text);
        return `=== ${file.path} ===\n${file.content}`;
      }

      if (subCommand === 'add') {
        if (!text) return 'Usage: /memory add <text>';
        const result = appendLongTermMemory(dataDir, text);
        deps.clearMemoryCache?.();
        return `Added to MEMORY.md. Lines: ${result.lines}/200`;
      }

      if (subCommand === 'search') {
        if (!text) return 'Usage: /memory search <text>';
        const matches = searchMemory(dataDir, text, { limit: 50 });
        if (matches.length === 0) return `No memory matches for: ${text}`;
        return matches.map(match => `${match.path}:${match.line}: ${match.text}`).join('\n');
      }

      if (subCommand === 'prune') {
        const days = Number(rest[0]);
        const scopeArg = rest.find(part => ['memory', 'learnings', 'sessions', 'all'].includes(part));
        const apply = rest.includes('--yes');
        const result = pruneMemory(dataDir, {
          olderThanDays: days,
          scope: (scopeArg ?? 'memory') as PruneScope,
          apply,
        });
        const verb = result.applied ? 'Deleted' : 'Would delete';
        const lines = [`${verb} ${result.files.length} files (${formatBytes(result.bytes)}).`];
        lines.push(...result.files.map(file => `  ${file.path}  ${file.modifiedAt}`));
        if (!result.applied && result.files.length > 0) lines.push('Preview only. Add --yes to apply.');
        return lines.join('\n');
      }

      if (subCommand === 'export') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const output = text
          ? resolve(text)
          : join(process.cwd(), `synapse-memory-${timestamp}.json`);
        const result = exportMemory(dataDir, output);
        return `Exported ${result.files} memory files to ${result.path} (${formatBytes(result.bytes)}).`;
      }

      if (subCommand === 'reload') {
        deps.clearMemoryCache?.();
        return 'Memory cache cleared. It will reload on the next turn.';
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }

    return `Usage: ${memoryCommand.usage}`;
  },
};
