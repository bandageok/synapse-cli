import React from 'react';
import { Box, Text } from 'ink';
import type { SlashCommand } from '../../commands/registry.js';

export function filterSlashCommands(commands: SlashCommand[], input: string, limit = 5): SlashCommand[] {
  if (!input.startsWith('/') || input.slice(1).includes(' ')) return [];
  const query = input.slice(1).toLowerCase();
  return commands
    .filter(command => command.name.toLowerCase().startsWith(query)
      || (command.aliases ?? []).some(alias => alias.toLowerCase().startsWith(query)))
    .sort((left, right) => {
      if (left.name === query) return -1;
      if (right.name === query) return 1;
      return left.name.localeCompare(right.name);
    })
    .slice(0, Math.max(1, limit));
}

export function CommandPalette({ commands, selectedIndex, columns }: {
  commands: SlashCommand[]; selectedIndex: number; columns: number;
}): React.ReactElement | null {
  if (commands.length === 0) return null;
  const selected = Math.min(Math.max(0, selectedIndex), commands.length - 1);
  return React.createElement(Box, {
    flexDirection: 'column',
    marginX: 1,
    paddingX: 1,
    width: Math.max(20, columns - 2),
    borderStyle: 'single',
    borderColor: '#5f87ff',
  },
    ...commands.map((command, index) => React.createElement(Box, { key: command.name },
      React.createElement(Text, { color: index === selected ? '#87d787' : 'gray', bold: index === selected },
        `${index === selected ? '●' : ' '} /${command.name}`,
      ),
      React.createElement(Text, { color: 'gray', dimColor: true, wrap: 'truncate-end' }, `  ${command.description}`),
    )),
  );
}
