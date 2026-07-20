// src/ui/components/ToolDetailPanel.tsx
// Expandable tool-call details for the Synapse terminal timeline.
import React, { useState } from 'react';
import { Text, Box } from 'ink';

interface ToolCallData {
  name: string;
  input: string;
  output: string;
  error: boolean;
  duration?: string;
}

function ToolDetailPanel({ calls }: { calls: ToolCallData[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpand = (idx: number) => {
    const next = new Set(expanded);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setExpanded(next);
  };

  return React.createElement(Box, { flexDirection: 'column' as const },
    calls.map((call, i) => {
      const isExpanded = expanded.has(i);
      const statusIcon = call.error ? '❌' : '✅';
      const arrow = isExpanded ? '▼' : '▶';

      return React.createElement(Box, {
        key: `tool-${i}`,
        flexDirection: 'column' as const,
        marginTop: i > 0 ? 0 : 0,
      },
        // Header line (always visible)
        React.createElement(Text, {
          bold: true,
          color: call.error ? 'red' as const : 'yellow' as const,
        }, `  ${arrow} ${statusIcon} ${call.name}${call.duration ? ' (' + call.duration + ')' : ''}`),

        // Expanded content
        isExpanded && React.createElement(Box, {
          flexDirection: 'column' as const,
          paddingLeft: 2,
        },
          // Input
          call.input && React.createElement(Box, { flexDirection: 'column' as const },
            React.createElement(Text, { color: 'gray' as const, bold: true }, '  Input:'),
            React.createElement(Text, { color: 'gray' as const, dimColor: true },
              '    ' + call.input.slice(0, 200) + (call.input.length > 200 ? '...' : '')
            ),
          ),
          // Output
          call.output && React.createElement(Box, { flexDirection: 'column' as const },
            React.createElement(Text, {
              color: call.error ? 'red' as const : 'green' as const,
              bold: true,
            }, '  ' + (call.error ? 'Error' : 'Output') + ':'),
            React.createElement(Text, {
              color: call.error ? 'red' as const : 'green' as const,
              dimColor: true,
            },
              '    ' + call.output.slice(0, 500) + (call.output.length > 500 ? '...' : '')
            ),
          ),
        ),
        // Collapse hint
        !isExpanded && (call.input || call.output) && React.createElement(Text, {
          dimColor: true,
          color: 'gray' as const,
        }, '    (use arrow key to expand)'),
      );
    }),
  );
}
