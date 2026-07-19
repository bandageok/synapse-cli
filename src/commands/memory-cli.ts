import type { Command } from 'commander';
import { join, resolve } from 'path';
import {
  exportMemory,
  inspectMemory,
  pruneMemory,
  searchMemory,
  type PruneScope,
} from '../memory/management.js';
import { getSynapseDataDir } from '../providers/management.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(error: unknown): void {
  console.error(`Error: ${errorMessage(error)}`);
  process.exitCode = 1;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function printInspection(json = false): void {
  const inspection = inspectMemory(getSynapseDataDir());
  if (json) {
    console.log(JSON.stringify(inspection, null, 2));
    return;
  }
  console.log(`Memory root: ${inspection.dataDir}`);
  console.log(`Total: ${inspection.totalFiles} files, ${formatBytes(inspection.totalBytes)}`);
  for (const source of inspection.sources) {
    console.log(`  ${source.source.padEnd(10)} ${String(source.files).padStart(3)} files  ${formatBytes(source.bytes).padStart(9)}  ${source.lines} lines`);
  }
  const injected = inspection.files.filter(file => file.injected);
  console.log(`Context injection: ${injected.length ? injected.map(file => file.relativePath).join(', ') : 'none'}`);
  const oversized = inspection.files.find(file => file.relativePath === 'MEMORY.md' && file.lines > 200);
  if (oversized) console.log(`Warning: MEMORY.md has ${oversized.lines} lines and will not be injected (maximum 200).`);
}

function defaultExportPath(format: 'json' | 'markdown'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const extension = format === 'json' ? 'json' : 'md';
  return join(process.cwd(), `synapse-memory-${timestamp}.${extension}`);
}

export function registerMemoryCli(program: Command): void {
  const memory = program
    .command('memory')
    .description('Inspect, search, prune, and export persistent memory')
    .action(() => {
      try {
        printInspection(false);
      } catch (error) {
        fail(error);
      }
    });

  memory
    .command('inspect')
    .description('Show memory sources, sizes, and context injection state')
    .option('--json', 'Output machine-readable JSON')
    .action((options: { json?: boolean }) => {
      try {
        printInspection(Boolean(options.json));
      } catch (error) {
        fail(error);
      }
    });

  memory
    .command('search')
    .description('Search memory content using a case-insensitive literal query')
    .argument('<query>', 'Text to search for')
    .option('-n, --limit <count>', 'Maximum matches', '50')
    .option('--include-sessions', 'Also search saved session transcripts')
    .option('--json', 'Output machine-readable JSON')
    .action((query: string, options: { limit: string; includeSessions?: boolean; json?: boolean }) => {
      try {
        const matches = searchMemory(getSynapseDataDir(), query, {
          limit: Number(options.limit),
          includeSessions: options.includeSessions,
        });
        if (options.json) console.log(JSON.stringify(matches, null, 2));
        else if (matches.length === 0) console.log(`No memory matches for: ${query}`);
        else {
          console.log(`${matches.length} memory match${matches.length === 1 ? '' : 'es'}:`);
          for (const match of matches) console.log(`${match.path}:${match.line}: ${match.text}`);
        }
      } catch (error) {
        fail(error);
      }
    });

  memory
    .command('prune')
    .description('Preview or delete old managed memory files')
    .requiredOption('--older-than <days>', 'Only files older than this many days')
    .option('--scope <scope>', 'memory | learnings | sessions | all', 'memory')
    .option('--yes', 'Apply deletion; without this flag the command is a preview')
    .option('--json', 'Output machine-readable JSON')
    .action((options: { olderThan: string; scope: PruneScope; yes?: boolean; json?: boolean }) => {
      try {
        const result = pruneMemory(getSynapseDataDir(), {
          olderThanDays: Number(options.olderThan),
          scope: options.scope,
          apply: options.yes,
        });
        if (options.json) console.log(JSON.stringify(result, null, 2));
        else {
          const verb = result.applied ? 'Deleted' : 'Would delete';
          console.log(`${verb} ${result.files.length} files (${formatBytes(result.bytes)}).`);
          for (const file of result.files) console.log(`  ${file.path}  ${file.modifiedAt}`);
          if (!result.applied && result.files.length > 0) console.log('Preview only. Re-run with --yes to apply.');
        }
      } catch (error) {
        fail(error);
      }
    });

  memory
    .command('export')
    .description('Export memory to a portable JSON or Markdown file')
    .argument('[file]', 'Output file; defaults to the current directory')
    .option('--format <format>', 'json | markdown', 'json')
    .option('--include-sessions', 'Include saved session transcripts')
    .option('--force', 'Overwrite an existing output file')
    .option('--json', 'Output machine-readable result metadata')
    .action((file: string | undefined, options: { format: string; includeSessions?: boolean; force?: boolean; json?: boolean }) => {
      try {
        if (options.format !== 'json' && options.format !== 'markdown') {
          throw new Error('Export format must be json or markdown.');
        }
        const output = file ? resolve(file) : defaultExportPath(options.format);
        const result = exportMemory(getSynapseDataDir(), output, {
          format: options.format,
          includeSessions: options.includeSessions,
          overwrite: options.force,
        });
        if (options.json) console.log(JSON.stringify(result, null, 2));
        else console.log(`Exported ${result.files} memory files to ${result.path} (${formatBytes(result.bytes)}).`);
      } catch (error) {
        fail(error);
      }
    });
}
