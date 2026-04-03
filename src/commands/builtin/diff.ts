import { execSync } from 'child_process';
import type { SlashCommand } from '../registry.js';

export const diffCommand: SlashCommand = {
  name: 'diff',
  aliases: ['d'],
  description: 'Show git diff of current changes (with file list)',
  usage: '/diff [--staged] [--stat] [--name-only]',
  handler: async (args) => {
    try {
      const argList = args?.trim().split(/\s+/) || [];
      const staged = argList.includes('--staged') ? '--staged' : '';
      const stat = argList.includes('--stat');
      const nameOnly = argList.includes('--name-only');
      const baseCmd = `git diff ${staged}`.trim();

      const parts: string[] = ['--- Git Diff ---', ''];

      // File list with stats
      if (stat) {
        const statOutput = execSync(`${baseCmd} --stat`, {
          encoding: 'utf-8',
          timeout: 10_000,
          maxBuffer: 1024 * 1024,
        }).trim();
        if (statOutput) {
          parts.push('Files changed:');
          parts.push(statOutput);
          parts.push('');
        }
      } else if (nameOnly) {
        const names = execSync(`${baseCmd} --name-only`, {
          encoding: 'utf-8',
          timeout: 10_000,
          maxBuffer: 1024 * 1024,
        }).trim();
        if (names) {
          parts.push('Changed files:');
          for (const f of names.split('\n')) {
            parts.push('  ' + f);
          }
          parts.push('');
        }
      }

      // Full diff with syntax-highlight-like indicators
      const diffOutput = execSync(baseCmd, {
        encoding: 'utf-8',
        timeout: 10_000,
        maxBuffer: 1024 * 1024 * 5,
      }).trim();

      if (diffOutput) {
        if (!stat && !nameOnly) {
          // Show file headers
          const files = diffOutput.match(/^diff --git a\/.* b\/.*$/gm) || [];
          if (files.length > 0) {
            parts.push('Changed files:');
            for (const f of files) {
              const path = f.replace('diff --git a/', '').split(' b/')[1];
              parts.push('  ' + path);
            }
            parts.push('');
          }
        }

        const lines = diffOutput.split('\n');
        const maxLines = 200;
        const truncated = lines.length > maxLines;
        const displayLines = truncated ? lines.slice(0, maxLines) : lines;

        for (const line of displayLines) {
          if (line.startsWith('---') || line.startsWith('+++')) {
            parts.push('\u2500 ' + line.slice(3).split('/').pop());
          } else if (line.startsWith('+') && !line.startsWith('+++')) {
            parts.push('[+] ' + line.slice(1));
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            parts.push('[-] ' + line.slice(1));
          } else if (line.startsWith('@@')) {
            parts.push('');
            parts.push(line);
            parts.push('');
          } else if (line.startsWith('diff --git')) {
            // skip (already shown in header)
          } else if (line.trim()) {
            parts.push('  ' + line);
          }
        }

        if (truncated) {
          parts.push('');
          parts.push(`... (${lines.length - maxLines} more lines, truncated)`);
        }
      } else {
        parts.push('No changes.');
      }

      return parts.join('\n');
    } catch {
      return 'Not a git repository or no changes.';
    }
  },
};
