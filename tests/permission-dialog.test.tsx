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
    ['d', 'deny'], ['D', 'deny'],
    ['f', 'full-access'], ['F', 'full-access'],
    ['y', 'full-access'], ['Y', 'full-access'],
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
    expect(frame).toContain('Permission: Bash');
    expect(frame).toContain('echo test');
    expect(frame).toContain('[A] allow once');
    expect(frame).toContain('[D] deny');
    expect(frame).toContain('[F/Y] full access + allow');
    expect(frame).toContain('disables prompts and strict shell isolation');
  });

  it('truncates oversized tool input without hiding the decision controls', () => {
    const view = render(React.createElement(PermissionDialog, {
      tool: 'Bash',
      input: 'x'.repeat(5_000),
    }));
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('[truncated; deny and narrow the request]');
    expect(frame).toContain('[F/Y] full access + allow');
    expect(frame.match(/x/g)?.length).toBeLessThanOrEqual(4_000);
  });
});
