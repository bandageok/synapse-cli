import React from 'react';
import { Box, Text } from 'ink';

export interface PermissionDialogProps {
  tool: string;
  input: unknown;
}

export type PermissionPromptAction = 'allow-once' | 'deny' | 'full-access';

export function permissionPromptAction(char: string): PermissionPromptAction | null {
  const key = char.toLowerCase();
  if (key === 'a') return 'allow-once';
  if (key === 'd') return 'deny';
  if (key === 'f' || key === 'y') return 'full-access';
  return null;
}

export function applyPermissionPromptAction(
  action: PermissionPromptAction,
  handlers: { resolve: (allowed: boolean) => void; setFullAccess: () => void },
): void {
  if (action === 'full-access') handlers.setFullAccess();
  handlers.resolve(action !== 'deny');
}

export function PermissionDialog({ tool, input }: PermissionDialogProps) {
  const serialized = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
  const value = serialized ?? String(input);
  const inputText = value.length > 4_000
    ? value.slice(0, 4_000) + '\n... [truncated; deny and narrow the request]'
    : value;
  return React.createElement(Box, {
    flexDirection: 'column', borderStyle: 'single', borderColor: 'yellow', paddingX: 1,
  },
    React.createElement(Text, { bold: true, color: 'yellow' }, ` Permission: ${tool}`),
    React.createElement(Text, { color: 'gray' }, '   ' + inputText),
    React.createElement(Text, null, '   [A] allow once   [D] deny   [F/Y] full access + allow'),
    React.createElement(Text, { color: 'red' }, '   Full access disables prompts and strict shell isolation for the rest of this session.'),
  );
}
