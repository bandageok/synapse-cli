import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { Divider, Footer, StatusBar, formatStatusLine } from '../src/ui/REPL.js';

const statusProps = {
  providerName: 'openrouter',
  model: 'company-model',
  tokens: 20_000,
  msgs: 12,
  vimMode: false,
  sessionTitle: 'Refactor the terminal interface',
  activeSkills: ['ui', 'testing'],
  turnCount: 4,
  permissionMode: 'ask' as const,
};

describe('REPL chrome', () => {
  it('shows operational context without splitting flex fragments', () => {
    const frame = render(React.createElement(StatusBar, { ...statusProps, columns: 100 })).lastFrame() ?? '';
    expect(frame).toContain('Synapse · openrouter · company-model');
    expect(frame).toContain('12 msgs · turn 4 · ask');
    expect(frame).toContain('ctx 10%');
    expect(frame).not.toContain('\n');
  });

  it('removes secondary status noise in a narrow terminal', () => {
    const frame = render(React.createElement(StatusBar, { ...statusProps, columns: 60 })).lastFrame() ?? '';
    expect(frame).toContain('Synapse · company-model · turn 4 · ask · ctx 10%');
    expect(frame).not.toContain('openrouter');
    expect(frame).not.toContain('12 msgs');
    expect(frame).not.toContain('Refactor the terminal interface');
  });

  it('adds skills and session title only when the terminal is genuinely wide', () => {
    const line = formatStatusLine({ ...statusProps, columns: 140 });
    expect(line).toContain('2 skills');
    expect(line).toContain('Refactor the terminal interface');
  });

  it('keeps dividers and shortcut hints responsive', () => {
    const divider = render(React.createElement(Divider, { columns: 40 })).lastFrame() ?? '';
    expect(divider).toHaveLength(39);
    const compactFooter = render(React.createElement(Footer, {
      vimMode: false, scrollPos: 0, maxScroll: 0, detailsMode: 'compact', columns: 60,
    })).lastFrame() ?? '';
    expect(compactFooter).toContain('compact · Ctrl+O details · Enter send');
    expect(compactFooter).not.toContain('/help');
  });
});
