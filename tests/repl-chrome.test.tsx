import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { VERSION } from '../src/version.js';
import {
  Composer, Divider, Footer, QueuePreview, StatusBar, WelcomeBanner, appendQueuedInput,
  busySubmissionAction, engineErrorNotice, formatStatusLine, welcomeBannerRows,
  shouldUseAlternateScreen,
} from '../src/ui/REPL.js';

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
  cwd: 'C:/repo/synapse-cli',
  working: false,
};

describe('REPL chrome', () => {
  it('shows operational context without splitting flex fragments', () => {
    const frame = render(React.createElement(StatusBar, { ...statusProps, columns: 100 })).lastFrame() ?? '';
    expect(frame).toContain('Synapse · Ready');
    expect(frame).not.toContain('company-model');
    expect(frame).not.toContain('ctx 10%');
    expect(frame).not.toContain('12 msgs');
    expect(frame).not.toContain('turn 4');
    expect(frame).not.toContain('\n');
  });

  it('removes secondary status noise in a narrow terminal', () => {
    const frame = render(React.createElement(StatusBar, { ...statusProps, columns: 60 })).lastFrame() ?? '';
    expect(frame).toContain('Synapse · Ready');
    expect(frame).not.toContain('openrouter');
    expect(frame).not.toContain('12 msgs');
    expect(frame).not.toContain('Refactor the terminal interface');
  });

  it('adds active skill count but omits the session title even when wide', () => {
    const line = formatStatusLine({ ...statusProps, columns: 140 });
    expect(line).toContain('2 skills');
    expect(line).not.toContain('Refactor the terminal interface');
  });

  it('keeps dividers and shortcut hints responsive', () => {
    const divider = render(React.createElement(Divider, { columns: 40 })).lastFrame() ?? '';
    expect(divider).toHaveLength(39);
    const compactFooter = render(React.createElement(Footer, {
      vimMode: false,
      permissionMode: 'auto',
      rowsAbove: 18,
      rowsBelow: 0,
      detailsMode: 'compact',
      failureCount: 3,
      columns: 60,
      cwd: 'C:/repo/synapse-cli',
      model: 'company-model',
      contextPercent: 10,
    })).lastFrame() ?? '';
    expect(compactFooter).toContain('synapse-cli · ↑ 18');
    expect(compactFooter).toContain('auto · 3 issues');
    expect(compactFooter).toContain('company-model · ctx 10%');
    expect(compactFooter).not.toContain('compact');
    expect(compactFooter).not.toContain('Ctrl+O');
    expect(compactFooter).not.toContain('Enter');
  });

  it('surfaces the active operation in the header without inventing metrics', () => {
    const line = formatStatusLine({ ...statusProps, columns: 120, working: true, activity: 'FileEdit' });
    expect(line).toContain('Working: FileEdit');
    expect(line).not.toContain('$');
  });

  it('uses a branded wide welcome and a compact narrow fallback with stable heights', () => {
    const wide = render(React.createElement(WelcomeBanner, {
      providerName: 'openrouter', model: 'company-model', columns: 100, cwd: 'C:/repo/synapse-cli',
    })).lastFrame() ?? '';
    expect(wide).toContain('██████ ██  ██');
    expect(wide).toContain('openrouter / company-model');
    expect(welcomeBannerRows(100)).toBe(8);
    const narrow = render(React.createElement(WelcomeBanner, {
      providerName: 'openrouter', model: 'company-model', columns: 60, cwd: 'C:/repo/synapse-cli',
    })).lastFrame() ?? '';
    expect(narrow).toContain(`SYNAPSE v${VERSION}`);
    expect(narrow).not.toContain('██████ ██  ██');
    expect(welcomeBannerRows(60)).toBe(4);
  });

  it('bounds long composer input while retaining the newest text', () => {
    const input = 'old '.repeat(100) + 'latest request';
    const frame = render(React.createElement(Composer, {
      input, normalMode: false, columns: 20,
    })).lastFrame() ?? '';
    expect(frame).toContain('latest');
    expect(frame).toContain('request');
    expect(frame).not.toContain('old '.repeat(30));
    expect(frame.split('\n').length).toBeLessThanOrEqual(6);
    expect(frame.split('\n').every(line => line.length <= 20)).toBe(true);
  });

  it('keeps queued follow-ups ordered, bounded, and visible outside the transcript', () => {
    const queue = appendQueuedInput(appendQueuedInput([], ' first '), 'second');
    expect(queue).toEqual(['first', 'second']);
    expect(appendQueuedInput(queue, 'third', 2)).toBe(queue);
    const frame = render(React.createElement(QueuePreview, { items: queue, columns: 60 })).lastFrame() ?? '';
    expect(frame).toContain('2 queued');
    expect(frame).toContain('first');
    expect(frame).not.toContain('second');
  });

  it.each([
    { input: '  ', count: 0, expected: 'ignore' },
    { input: '/model next', count: 0, expected: 'reject-command' },
    { input: 'follow up', count: 8, expected: 'reject-full' },
    { input: 'follow up', count: 7, expected: 'queue' },
  ])('classifies busy submission $expected', ({ input, count, expected }) => {
    expect(busySubmissionAction(input, count)).toBe(expected);
  });

  it('renders cancellation as neutral state while preserving real provider errors', () => {
    expect(engineErrorNotice('Request cancelled.')).toEqual({ tone: 'muted', title: 'Turn cancelled' });
    expect(engineErrorNotice('Provider unavailable')).toEqual({ tone: 'error', title: 'Provider unavailable' });
  });

  it('uses alternate screen only for interactive terminals with an explicit escape hatch', () => {
    expect(shouldUseAlternateScreen(true)).toBe(true);
    expect(shouldUseAlternateScreen(false)).toBe(false);
    expect(shouldUseAlternateScreen(true, '1')).toBe(false);
    expect(shouldUseAlternateScreen(true, 'true')).toBe(false);
    expect(shouldUseAlternateScreen(true, '0')).toBe(true);
  });
});
