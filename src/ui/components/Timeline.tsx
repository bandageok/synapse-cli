import React from 'react';
import { Box, Text } from 'ink';
import { MarkdownRenderer } from '../MarkdownRenderer.js';
import {
  compactTimeline,
  previewToolOutput,
  summarizeToolInput,
  type DetailsMode,
  type DisplayItem,
  type NoticeDisplayItem,
  type RenderableDisplayItem,
  type ToolDisplayItem,
} from '../timeline.js';

export interface TimelineProps {
  items: DisplayItem[];
  detailsMode: DetailsMode;
  maxAnswerLines: number;
}

export interface TimelineViewProps {
  items: RenderableDisplayItem[];
  detailsMode: DetailsMode;
  maxAnswerLines: number;
}

function formatDuration(durationMs?: number): string {
  if (durationMs === undefined) return '';
  return durationMs < 1_000 ? `${durationMs}ms` : `${(durationMs / 1_000).toFixed(1)}s`;
}

function ToolItem({ item, detailsMode }: { item: ToolDisplayItem; detailsMode: DetailsMode }): React.ReactElement {
  const icon = item.status === 'running' ? '●' : item.status === 'error' ? '×' : '✓';
  const color = item.status === 'running' ? 'cyan' : item.status === 'error' ? 'red' : 'green';
  const duration = formatDuration(item.durationMs);
  const input = summarizeToolInput(item.input);
  const showOutput = detailsMode === 'expanded' || item.status === 'error';
  const output = showOutput ? previewToolOutput(item.output, detailsMode === 'expanded' ? 14 : 6) : '';

  return React.createElement(Box, { key: item.id, flexDirection: 'column' },
    React.createElement(Box, null,
      React.createElement(Text, { color: 'gray', dimColor: true }, ' │ '),
      React.createElement(Text, { color, bold: item.status !== 'success' }, icon + ' '),
      React.createElement(Text, { bold: item.status === 'running' }, item.name),
      duration ? React.createElement(Text, { color: 'gray', dimColor: true }, ` · ${duration}`) : null,
      detailsMode === 'compact' && input
        ? React.createElement(Text, { color: 'gray', dimColor: true, wrap: 'truncate-end' }, ` · ${input}`)
        : null,
    ),
    detailsMode === 'expanded' && input
      ? React.createElement(Box, { paddingLeft: 3 },
          React.createElement(Text, { color: 'gray', dimColor: true, wrap: 'wrap' }, `input  ${input}`),
        )
      : null,
    showOutput && output
      ? React.createElement(Box, { flexDirection: 'column', paddingLeft: 3 },
          ...output.split('\n').map((line, index) => React.createElement(Box, { key: `${item.id}-output-${index}` },
            React.createElement(Text, { color: 'gray', dimColor: true }, '│ '),
            React.createElement(Text, { color: item.status === 'error' ? 'red' : undefined, wrap: 'wrap' }, line || ' '),
          )),
        )
      : null,
  );
}

function NoticeItem({ item }: { item: NoticeDisplayItem }): React.ReactElement {
  const color = item.tone === 'error' ? 'red' : item.tone === 'warning' ? 'yellow' : item.tone === 'info' ? 'cyan' : 'gray';
  const icon = item.tone === 'error' ? '×' : item.tone === 'warning' ? '!' : item.tone === 'info' ? 'i' : '·';
  return React.createElement(Box, { key: item.id, flexDirection: 'column' },
    React.createElement(Text, { color, dimColor: item.tone === 'muted' }, ` ${icon} ${item.title}`),
    item.detail ? React.createElement(Text, { color: 'gray', dimColor: true }, `   ${item.detail}`) : null,
  );
}

export function TimelineView({ items, detailsMode, maxAnswerLines }: TimelineViewProps): React.ReactElement {
  return React.createElement(Box, { flexDirection: 'column' },
    ...items.map(item => {
      if (item.kind === 'user') {
        return React.createElement(Box, { key: item.id, flexDirection: 'column', marginTop: 1 },
          React.createElement(Text, { color: 'cyan', bold: true }, ' You'),
          React.createElement(Box, { paddingLeft: 3 }, React.createElement(Text, { wrap: 'wrap' }, item.content)),
        );
      }
      if (item.kind === 'assistant') {
        return React.createElement(Box, { key: item.id, flexDirection: 'column', marginTop: 1 },
          React.createElement(Text, { color: 'cyan', bold: true }, ' Synapse'),
          React.createElement(Box, { paddingLeft: 3 },
            React.createElement(MarkdownRenderer, { text: item.content, maxLines: maxAnswerLines }),
          ),
        );
      }
      if (item.kind === 'tool') return React.createElement(ToolItem, { key: item.id, item, detailsMode });
      if (item.kind === 'tool-summary') {
        return React.createElement(Text, { key: item.id, color: 'gray', dimColor: true },
          ` │ … ${item.count} completed · ${item.tools}`,
        );
      }
      return React.createElement(NoticeItem, { key: item.id, item });
    }),
  );
}

export function Timeline({ items, detailsMode, maxAnswerLines }: TimelineProps): React.ReactElement {
  return React.createElement(TimelineView, {
    items: compactTimeline(items, detailsMode),
    detailsMode,
    maxAnswerLines,
  });
}
