import React from 'react';
import { Box, Text } from 'ink';
import { virtualizeText } from '../streaming.js';
import { stripAnsi } from '../timeline.js';

export interface PermissionDialogProps {
  tool: string;
  input: unknown;
  columns?: number;
}

export type PermissionPromptAction = 'allow-once' | 'deny' | 'full-access';

export function permissionPromptAction(char: string): PermissionPromptAction | null {
  const key = char.toLowerCase();
  if (key === 'a' || key === '1') return 'allow-once';
  if (key === 'f' || key === 'y' || key === '2') return 'full-access';
  if (key === 'd' || key === '3') return 'deny';
  return null;
}

export function applyPermissionPromptAction(
  action: PermissionPromptAction,
  handlers: { resolve: (allowed: boolean) => void; setFullAccess: () => void },
): void {
  if (action === 'full-access') handlers.setFullAccess();
  handlers.resolve(action !== 'deny');
}

export function PermissionDialog({ tool, input, columns = 100 }: PermissionDialogProps) {
  const serialized = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
  const value = stripAnsi(serialized ?? String(input));
  const preview = virtualizeText(value, 4, Math.max(20, columns - 6));
  const inputText = preview.truncated
    ? preview.text.replace(/\u2026 \d+ rendered lines hidden \u2026/, '... input truncated; inspect carefully ...')
    : preview.text;
  return React.createElement(Box, {
    flexDirection: 'column', borderStyle: 'single', borderColor: 'yellow', paddingX: 1,
  },
    React.createElement(Text, { bold: true, color: 'yellow' }, `? ${tool} requires approval`),
    React.createElement(Text, { color: 'gray', dimColor: true }, inputText),
    React.createElement(Text, { bold: true }, 'Apply this action?'),
    React.createElement(Text, { color: 'green' }, '● 1. Allow once (A)'),
    React.createElement(Text, null, '  2. Enable full access for this session (F)'),
    React.createElement(Text, null, '  3. Deny (D)'),
    React.createElement(Text, { color: 'red', dimColor: true }, 'Full access disables prompts and strict shell isolation for this session.'),
    React.createElement(Text, { color: 'gray', dimColor: true }, 'Waiting for confirmation...'),
  );
}
