import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import {
  PermissionDialog,
  applyPermissionPromptAction,
  permissionPromptAction,
} from '../src/ui/components/PermissionDialog.js';

describe('permission dialog', () => {
  it.each([
    ['a', 'allow-once'], ['A', 'allow-once'],
    ['1', 'allow-once'],
    ['d', 'deny'], ['D', 'deny'],
    ['3', 'deny'],
    ['f', 'full-access'], ['F', 'full-access'],
    ['y', 'full-access'], ['Y', 'full-access'],
    ['2', 'full-access'],
  ] as const)('maps %s to %s', (key, expected) => {
    expect(permissionPromptAction(key)).toBe(expected);
  });

  it.each(['', 'x', '/', 'Enter'])('ignores unsupported input %j', key => {
    expect(permissionPromptAction(key)).toBeNull();
  });

  it.each([
    ['allow-once', ['resolve:true']],
    ['deny', ['resolve:false']],
    ['full-access', ['mode:full-access', 'resolve:true']],
  ] as const)('applies %s in a deterministic order', (action, expected) => {
    const calls: string[] = [];
    applyPermissionPromptAction(action, {
      resolve: allowed => calls.push(`resolve:${allowed}`),
      setFullAccess: () => calls.push('mode:full-access'),
    });
    expect(calls).toEqual(expected);
  });

  it('renders the tool, input, and all available actions', () => {
    const view = render(React.createElement(PermissionDialog, {
      tool: 'Bash',
      input: { command: 'echo test' },
    }));
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('Bash requires approval');
    expect(frame).toContain('echo test');
    expect(frame).toContain('1. Allow once');
    expect(frame).toContain('2. Enable full access');
    expect(frame).toContain('3. Deny');
    expect(frame).toContain('disables prompts and strict shell isolation');
  });

  it('truncates oversized tool input without hiding the decision controls', () => {
    const view = render(React.createElement(PermissionDialog, {
      tool: 'Bash',
      input: 'x'.repeat(5_000),
    }));
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('input truncated; inspect carefully');
    expect(frame).toContain('2. Enable full access');
    expect(frame.split('\n').length).toBeLessThanOrEqual(13);
    expect(frame.match(/x/g)?.length).toBeLessThan(500);
  });

  it('strips terminal control sequences from approval input', () => {
    const frame = render(React.createElement(PermissionDialog, {
      tool: 'Bash', input: '\u001b[31mecho danger\u001b[0m', columns: 60,
    })).lastFrame() ?? '';
    expect(frame).toContain('echo danger');
    expect(frame).not.toContain('\u001b');
  });
});
