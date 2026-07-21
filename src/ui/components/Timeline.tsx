import React from 'react';
import { Box, Text } from 'ink';
import { MarkdownRenderer } from '../MarkdownRenderer.js';
import {
  compactTimeline,
  latestTurnId,
  previewToolOutput,
  stripAnsi,
  summarizeToolError,
  summarizeToolInput,
  toolErrorFingerprint,
  type ActivityDisplayItem,
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
  columns?: number;
  expandedTurnId?: string | null;
}

export interface TimelineViewProps {
  items: RenderableDisplayItem[];
  detailsMode: DetailsMode;
  maxAnswerLines: number;
  columns?: number;
  expandedTurnId?: string | null;
}

export interface ActivityRailEntry {
  id: string;
  name: string;
  status: ToolDisplayItem['status'];
  count: number;
  durationMs: number;
}

export function buildActivityRailEntries(items: DisplayItem[]): ActivityRailEntry[] {
  const currentTurn = latestTurnId(items);
  const tools = items.filter((item): item is ToolDisplayItem =>
    item.kind === 'tool' && (!currentTurn || item.turnId === currentTurn),
  );
  const entries: ActivityRailEntry[] = [];
  const repeatedFailures = new Map<string, ActivityRailEntry>();
  for (const item of tools) {
    if (item.status === 'error') {
      const fingerprint = toolErrorFingerprint(item);
      const existing = repeatedFailures.get(fingerprint);
      if (existing) {
        existing.count += 1;
        existing.durationMs += item.durationMs ?? 0;
        continue;
      }
      const entry = {
        id: item.id,
        name: stripAnsi(item.name),
        status: item.status,
        count: 1,
        durationMs: item.durationMs ?? 0,
      };
      repeatedFailures.set(fingerprint, entry);
      entries.push(entry);
      continue;
    }
    entries.push({
      id: item.id,
      name: stripAnsi(item.name),
      status: item.status,
      count: 1,
      durationMs: item.durationMs ?? 0,
    });
  }
  return entries;
}

export function ActivityRail({ items, width, height }: { items: DisplayItem[]; width: number; height: number }): React.ReactElement {
  const allEntries = buildActivityRailEntries(items);
  const visibleEntries = allEntries.slice(-Math.max(1, height - 4));
  const failed = allEntries.reduce((count, entry) => count + (entry.status === 'error' ? entry.count : 0), 0);
  return React.createElement(Box, {
    width,
    height,
    flexDirection: 'column',
    paddingLeft: 1,
    paddingRight: 1,
    borderStyle: 'single',
    borderTop: false,
    borderBottom: false,
    borderLeft: false,
    borderColor: 'gray',
  },
    React.createElement(Box, null,
      React.createElement(Text, { color: 'cyan', bold: true }, 'Timeline'),
      allEntries.length > 0 ? React.createElement(Text, { color: 'gray', dimColor: true }, `  ${allEntries.length}`) : null,
    ),
    React.createElement(Text, { color: 'gray', dimColor: true }, '─'.repeat(Math.max(4, width - 4))),
    ...(visibleEntries.length > 0
      ? visibleEntries.map(entry => {
          const icon = entry.status === 'running' ? '●' : entry.status === 'error' ? '×' : '✓';
          const color = entry.status === 'running' ? 'cyan' : entry.status === 'error' ? 'red' : 'green';
          const count = entry.count > 1 ? ` ×${entry.count}` : '';
          const duration = entry.durationMs > 0 ? `  ${formatDuration(entry.durationMs)}` : '';
          return React.createElement(Text, { key: entry.id, wrap: 'truncate-end' },
            React.createElement(Text, { color, bold: entry.status !== 'success' }, `${icon} `),
            React.createElement(Text, { bold: entry.status === 'running' }, entry.name),
            count ? React.createElement(Text, { color: 'red' }, count) : null,
            duration ? React.createElement(Text, { color: 'gray', dimColor: true }, duration) : null,
          );
        })
      : [React.createElement(Text, { key: 'empty', color: 'gray', dimColor: true }, 'No activity yet')]),
    React.createElement(Box, { flexGrow: 1 }),
    failed > 0
      ? React.createElement(Text, { color: 'red' }, `${failed} issue${failed === 1 ? '' : 's'}`)
      : allEntries.length > 0
        ? React.createElement(Text, { color: 'green', dimColor: true }, 'No issues')
        : null,
  );
}

interface ActivityStats {
  total: number;
  succeeded: number;
  failed: number;
  running: number;
}

function formatDuration(durationMs?: number): string {
  if (durationMs === undefined) return '';
  return durationMs < 1_000 ? `${durationMs}ms` : `${(durationMs / 1_000).toFixed(1)}s`;
}

function activityStats(items: RenderableDisplayItem[]): ActivityStats {
  const stats: ActivityStats = { total: 0, succeeded: 0, failed: 0, running: 0 };
  for (const item of items) {
    if (item.kind !== 'tool') continue;
    stats.total += 1;
    if (item.status === 'success') stats.succeeded += 1;
    else if (item.status === 'error') stats.failed += 1;
    else stats.running += 1;
  }
  return stats;
}

function ActivityHeader({ items }: { items: RenderableDisplayItem[] }): React.ReactElement {
  const stats = activityStats(items);
  return React.createElement(Box, { marginTop: 1 },
    React.createElement(Text, { bold: true }, ' Activity'),
    React.createElement(Text, { color: 'gray', dimColor: true }, ` · ${stats.total} call${stats.total === 1 ? '' : 's'}`),
    stats.succeeded > 0 ? React.createElement(Text, { color: 'green' }, ` · ${stats.succeeded} passed`) : null,
    stats.failed > 0 ? React.createElement(Text, { color: 'red', bold: true }, ` · ${stats.failed} failed`) : null,
    stats.running > 0 ? React.createElement(Text, { color: 'cyan' }, ` · ${stats.running} running`) : null,
  );
}

function ActivitySummary({ item, columns }: { item: ActivityDisplayItem; columns: number }): React.ReactElement {
  const duration = formatDuration(item.totalDurationMs);
  const runningInput = item.current ? summarizeToolInput(item.current.input, 72) : '';
  if (item.running > 0 && item.current) {
    return React.createElement(Box, { key: item.id, marginTop: 1 },
      React.createElement(Text, { color: 'cyan', bold: true }, ' ● '),
      React.createElement(Text, { bold: true }, `Running ${stripAnsi(item.current.name)}`),
      runningInput ? React.createElement(Text, { color: 'gray', dimColor: true, wrap: 'truncate-end' }, ` · ${runningInput}`) : null,
    );
  }

  return React.createElement(Box, { key: item.id, flexDirection: 'column', marginTop: 1 },
    React.createElement(Box, null,
      React.createElement(Text, { color: item.failed > 0 ? 'yellow' : 'green', bold: true }, ' • '),
      React.createElement(Text, { color: 'gray' }, `Worked ${item.total} step${item.total === 1 ? '' : 's'}`),
      duration ? React.createElement(Text, { color: 'gray', dimColor: true }, ` · ${duration}`) : null,
      item.failed > 0
        ? React.createElement(Text, { color: 'red', bold: true }, ` · ${item.failed} issue${item.failed === 1 ? '' : 's'}`)
        : null,
    ),
    ...item.failures.map((failure, index) => columns < 72
      ? React.createElement(Box, { key: `${item.id}-failure-${index}`, flexDirection: 'column', paddingLeft: 3 },
          React.createElement(Text, { color: 'red', bold: true },
            `× ${stripAnsi(failure.item.name)}${failure.count > 1 ? ` ×${failure.count}` : ''}`,
          ),
          React.createElement(Box, { paddingLeft: 2 },
            React.createElement(Text, { color: 'gray', wrap: 'truncate-end' }, summarizeToolError(failure.item.output)),
          ),
        )
      : React.createElement(Box, { key: `${item.id}-failure-${index}`, paddingLeft: 3 },
          React.createElement(Text, { color: 'red', bold: true },
            `× ${stripAnsi(failure.item.name)}${failure.count > 1 ? ` ×${failure.count}` : ''}`,
          ),
          React.createElement(Text, { color: 'gray', wrap: 'truncate-end' }, ` · ${summarizeToolError(failure.item.output)}`),
        )),
  );
}

function ToolItem({ item }: { item: ToolDisplayItem }): React.ReactElement {
  const icon = item.status === 'running' ? '●' : item.status === 'error' ? '×' : '✓';
  const color = item.status === 'running' ? 'cyan' : item.status === 'error' ? 'red' : 'green';
  const duration = formatDuration(item.durationMs);
  const input = summarizeToolInput(item.input);
  const output = item.output ? previewToolOutput(item.output, 14) : '';

  const borderColor = item.status === 'running' ? 'yellow' : item.status === 'error' ? 'red' : 'gray';
  return React.createElement(Box, {
    key: item.id,
    flexDirection: 'column',
    borderStyle: 'single',
    borderColor,
    paddingX: 1,
    marginTop: 1,
  },
    React.createElement(Box, null,
      React.createElement(Text, { color, bold: item.status !== 'success' }, `${icon} `),
      React.createElement(Text, { bold: item.status === 'running' }, stripAnsi(item.name)),
      duration ? React.createElement(Text, { color: 'gray', dimColor: true }, ` · ${duration}`) : null,
    ),
    input ? React.createElement(Box, { paddingLeft: 2 },
      React.createElement(Text, { color: 'gray', dimColor: true, wrap: 'wrap' }, `input  ${input}`),
    ) : null,
    output ? React.createElement(Box, { flexDirection: 'column', paddingLeft: 2 },
      ...output.split('\n').map((line, index) => React.createElement(Box, { key: `${item.id}-output-${index}` },
        React.createElement(Text, { color: 'gray', dimColor: true }, '│ '),
        React.createElement(Text, { color: item.status === 'error' ? 'red' : undefined, wrap: 'wrap' }, line || ' '),
      )),
    ) : null,
  );
}

function NoticeItem({ item }: { item: NoticeDisplayItem }): React.ReactElement {
  const color = item.tone === 'error' ? 'red' : item.tone === 'warning' ? 'yellow' : item.tone === 'info' ? 'cyan' : 'gray';
  const icon = item.tone === 'error' ? '×' : item.tone === 'warning' ? '!' : item.tone === 'info' ? 'i' : '·';
  return React.createElement(Box, { key: item.id, flexDirection: 'column' },
    React.createElement(Text, { color, dimColor: item.tone === 'muted' }, ` ${icon} ${stripAnsi(item.title)}`),
    item.detail ? React.createElement(Text, { color: 'gray', dimColor: true }, `   ${stripAnsi(item.detail)}`) : null,
  );
}

function renderItem(
  item: RenderableDisplayItem,
  maxAnswerLines: number,
  columns: number,
): React.ReactElement {
  if (item.kind === 'user') {
    return React.createElement(Box, { key: item.id, marginTop: 1 },
      React.createElement(Text, { color: 'cyan', bold: true }, ' › '),
      React.createElement(Text, { bold: true, wrap: 'wrap' }, stripAnsi(item.content)),
    );
  }
  if (item.kind === 'assistant') {
    return React.createElement(Box, { key: item.id, flexDirection: 'column', marginTop: 1 },
      React.createElement(Text, { color: 'cyan', bold: true }, ' Synapse'),
      React.createElement(Box, { paddingLeft: 3 },
        React.createElement(MarkdownRenderer, { text: item.content, maxLines: maxAnswerLines, columns }),
      ),
    );
  }
  if (item.kind === 'activity') return React.createElement(ActivitySummary, { key: item.id, item, columns });
  if (item.kind === 'tool') return React.createElement(ToolItem, { key: item.id, item });
  return React.createElement(NoticeItem, { key: item.id, item });
}

export function TimelineView({
  items,
  detailsMode,
  maxAnswerLines,
  columns = 100,
}: TimelineViewProps): React.ReactElement {
  const elements: React.ReactElement[] = [];
  const expanded = detailsMode === 'expanded' || items.some(item => item.kind === 'tool');
  let activityHeaderKey: string | undefined;
  for (const item of items) {
    const turnKey = item.turnId ?? 'legacy';
    if (expanded && item.kind === 'tool' && activityHeaderKey !== turnKey) {
      const turnActivity = items.filter(candidate => candidate.kind === 'tool' && (candidate.turnId ?? 'legacy') === turnKey);
      elements.push(React.createElement(ActivityHeader, { key: `activity-${turnKey}`, items: turnActivity }));
      activityHeaderKey = turnKey;
    }
    elements.push(renderItem(item, maxAnswerLines, columns));
  }
  return React.createElement(Box, { flexDirection: 'column' }, ...elements);
}

export function Timeline({ items, detailsMode, maxAnswerLines, columns = 100, expandedTurnId }: TimelineProps): React.ReactElement {
  return React.createElement(TimelineView, {
    items: compactTimeline(items, detailsMode, expandedTurnId),
    detailsMode,
    maxAnswerLines,
    columns,
    expandedTurnId,
  });
}
