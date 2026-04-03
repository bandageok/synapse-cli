import type { SlashCommand } from '../registry.js';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

export const historyCommand: SlashCommand = {
  name: 'history',
  description: 'List saved sessions with details',
  handler: async (args, deps) => {
    const sessionsDir = join(deps.dataDir, 'sessions');
    if (!existsSync(sessionsDir)) return 'No sessions found.';

    const { readdirSync, statSync } = await import('fs');
    const files = readdirSync(sessionsDir)
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => {
        const sa = statSync(join(sessionsDir, a)).mtimeMs;
        const sb = statSync(join(sessionsDir, b)).mtimeMs;
        return sb - sa;
      })
      .slice(0, 20);

    if (files.length === 0) return 'No sessions found.';

    const lines = ['=== Session History (latest 20) ===', ''];

    for (const f of files) {
      try {
        const data = JSON.parse(readFileSync(join(sessionsDir, f), 'utf-8'));
        const meta = data.metadata || {};
        const msgs = data.messages || [];
        const userCount = msgs.filter((m: any) => m.role === 'user').length;
        const asstCount = msgs.filter((m: any) => m.role === 'assistant').length;
        const toolCount = msgs.reduce((c: number, m: any) => {
          if (Array.isArray(m.content)) {
            return c + m.content.filter((b: any) => b.type === 'tool_use').length;
          }
          return c;
        }, 0);

        // Extract session title from first user message
        const firstUser = msgs.find((m: any) => m.role === 'user');
        let title = '';
        if (firstUser) {
          const text = typeof firstUser.content === 'string'
            ? firstUser.content
            : JSON.stringify(firstUser.content);
          title = text.length > 50 ? text.slice(0, 50) + '...' : text;
        }

        const modified = meta.updatedAt ? new Date(meta.updatedAt).toLocaleString() : 'unknown';

        lines.push(`  ID:      ${f.replace('.json', '')}`);
        lines.push(`  Model:   ${meta.model || 'unknown'}`);
        lines.push(`  Turns:   ${userCount}`);
        lines.push(`  User:    ${userCount} | Asst: ${asstCount} | Tools: ${toolCount}`);
        lines.push(`  Updated: ${modified}`);
        lines.push(`  Title:   ${title || '(empty)'}`);
        lines.push('');
      } catch {
        lines.push(`  ${f} -- (corrupt)`);
        lines.push('');
      }
    }

    return lines.join('\n');
  },
};
