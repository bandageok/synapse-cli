// src/ui/components/PermissionDialog.tsx
import React from 'react';
import { Text, Box } from 'ink';

export interface PermissionDialogProps {
  tool: string;
  input: string;
  onAllow: () => void;
  onDeny: () => void;
}

export function PermissionDialog({ tool, input, onAllow, onDeny }: PermissionDialogProps) {
  return React.createElement(Box, { flexDirection: 'column', borderStyle: 'round', borderColor: 'yellow', padding: 1 },
    React.createElement(Text, { bold: true, color: 'yellow' }, `⚠️  Permission Request`),
    React.createElement(Text, null, `Tool: ${tool}`),
    React.createElement(Text, { dimColor: true }, `Input: ${input.slice(0, 100)}`),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, '[A]llow once  [D]eny'),
  );
}
