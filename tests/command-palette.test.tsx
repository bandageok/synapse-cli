import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { CommandPalette, filterSlashCommands } from '../src/ui/components/CommandPalette.js';
import type { SlashCommand } from '../src/commands/registry.js';

const handler = async () => undefined;
const commands: SlashCommand[] = [
  { name: 'model', aliases: ['m'], description: 'View or switch model', usage: '/model [name]', handler },
  { name: 'memory', description: 'Inspect memory', usage: '/memory', handler },
  { name: 'permissions', aliases: ['permission'], description: 'Change permission mode', usage: '/permissions [mode]', handler },
];

describe('command palette', () => {
  it('filters command names and aliases without matching argument text', () => {
    expect(filterSlashCommands(commands, '/mo').map(command => command.name)).toEqual(['model']);
    expect(filterSlashCommands(commands, '/m').map(command => command.name)).toEqual(['memory', 'model']);
    expect(filterSlashCommands(commands, '/permission').map(command => command.name)).toEqual(['permissions']);
    expect(filterSlashCommands(commands, '/model other')).toEqual([]);
    expect(filterSlashCommands(commands, 'model')).toEqual([]);
  });

  it('renders real descriptions with one selected candidate', () => {
    const frame = render(React.createElement(CommandPalette, {
      commands, selectedIndex: 1, columns: 60,
    })).lastFrame() ?? '';
    expect(frame).toContain('/model');
    expect(frame).toContain('/memory');
    expect(frame).toContain('Inspect memory');
    expect(frame.match(/●/g)).toHaveLength(1);
    expect(frame.split('\n').length).toBe(commands.length + 2);
  });

  it('limits candidates so the palette cannot consume the viewport', () => {
    const many = Array.from({ length: 12 }, (_, index): SlashCommand => ({
      name: `command-${index}`, description: 'test', handler,
    }));
    expect(filterSlashCommands(many, '/', 5)).toHaveLength(5);
  });
});
