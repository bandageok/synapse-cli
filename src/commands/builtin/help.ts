import type { SlashCommand } from '../registry.js';

const COMMANDS = [
  { cmd: '/help', desc: 'Show this help panel' },
  { cmd: '/exit', desc: 'Exit Synapse' },
  { cmd: '/clear', desc: 'Clear conversation and start fresh' },
  { cmd: '/model <name>', desc: 'Switch AI model' },
  { cmd: '/memory', desc: 'Memory system overview' },
  { cmd: '/memory browse', desc: 'List all memory files' },
  { cmd: '/memory view <f>', desc: 'View specific memory file' },
  { cmd: '/soul', desc: 'View current agent personality' },
  { cmd: '/soul-edit', desc: 'Edit agent personality' },
  { cmd: '/status', desc: 'System status overview' },
  { cmd: '/config', desc: 'Show current configuration' },
  { cmd: '/cost', desc: 'Token usage and cost estimate' },
  { cmd: '/session', desc: 'Session management' },
  { cmd: '/history', desc: 'List saved sessions' },
  { cmd: '/compact', desc: 'Force context compression' },
  { cmd: '/context', desc: 'View current context size' },
  { cmd: '/diff', desc: 'View file changes this turn' },
  { cmd: '/undo', desc: 'Undo last file edit' },
  { cmd: '/vim <on|off>', desc: 'Toggle Vim mode' },
  { cmd: '/resume', desc: 'Resume previous session' },
  { cmd: '/init', desc: 'Initialize template files' },
  { cmd: '/doctor', desc: 'Diagnostics' },
  { cmd: '/skills', desc: 'List available skills' },
];

function cmdLen(cmd: string): number { return cmd.length + 4; }
const maxLen = COMMANDS.reduce((m, c) => Math.max(m, cmdLen(c.cmd)), 0);

export const helpCommand: SlashCommand = {
  name: 'help',
  aliases: ['h', '?'],
  description: 'Show available commands',
  usage: '/help [command]',
  handler: async (args, _deps) => {
    if (args) {
      for (const c of COMMANDS) {
        if (c.cmd === '/' + args || c.cmd.startsWith('/' + args)) {
          return c.cmd + '  --  ' + c.desc;
        }
      }
      return 'Unknown command: /' + args;
    }
    const lines = ['--- Commands ---', ''];
    for (const c of COMMANDS) {
      const padded = c.cmd + ' '.repeat(maxLen - cmdLen(c.cmd));
      lines.push('  ' + padded + c.desc);
    }
    lines.push('');
    lines.push('Shortcuts: Ctrl+C exit  Ctrl+L clear  Ctrl+U clear input');
    return lines.join('\n');
  },
};
