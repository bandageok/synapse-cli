import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { ActivityRail, Timeline, buildActivityRailEntries } from '../src/ui/components/Timeline.js';
import type { DisplayItem, ToolDisplayItem } from '../src/ui/timeline.js';

function tool(index: number, status: ToolDisplayItem['status'], output = 'ok'): ToolDisplayItem {
  return {
    id: `display-${index}`,
    kind: 'tool',
    toolUseId: `call-${index}`,
    name: index % 2 ? 'PowerShell' : 'WebFetch',
    input: { command: `echo ${index}` },
    output,
    status,
    durationMs: index * 100,
    timestamp: index,
  };
}

describe('Timeline UI', () => {
  it('renders user and assistant content as separate semantic regions', () => {
    const items: DisplayItem[] = [
      { id: 'user', kind: 'user', content: 'Fix the layout', timestamp: 1 },
      { id: 'assistant', kind: 'assistant', content: '## Done\n- clean output', streaming: false, timestamp: 2 },
    ];
    const view = render(React.createElement(Timeline, { items, detailsMode: 'compact', maxAnswerLines: 20 }));
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('› Fix the layout');
    expect(frame).toContain('Fix the layout');
    expect(frame).toContain('Synapse');
    expect(frame).toContain('Done');
    expect(frame).toContain('• clean output');
  });

  it('preserves CJK text in streamed conversation content', () => {
    const items: DisplayItem[] = [
      { id: 'user-zh', kind: 'user', content: '帮我检查这个项目', timestamp: 1 },
      {
        id: 'assistant-zh',
        kind: 'assistant',
        content: '## 检查结果\n- 工具链已压缩\n- 失败信息仍可见',
        streaming: false,
        timestamp: 2,
      },
    ];

    const view = render(React.createElement(Timeline, { items, detailsMode: 'compact', maxAnswerLines: 20 }));
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('帮我检查这个项目');
    expect(frame).toContain('检查结果');
    expect(frame).toContain('工具链已压缩');
    expect(frame).toContain('失败信息仍可见');
  });

  it('folds completed work to one summary and keeps only an actionable failure line', () => {
    const items: DisplayItem[] = [
      tool(1, 'success'), tool(2, 'success'), tool(3, 'success'), tool(4, 'success'),
      tool(5, 'success'), tool(6, 'error', '\u001b[31mTraceback\nboom\u001b[0m'),
    ];
    const view = render(React.createElement(Timeline, { items, detailsMode: 'compact', maxAnswerLines: 20 }));
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('Worked 6 steps');
    expect(frame).toContain('1 issue');
    expect(frame).toContain('× WebFetch');
    expect(frame).toContain('boom');
    expect(frame).not.toContain('Traceback');
    expect(frame).not.toContain('PowerShell');
    expect(frame).not.toContain('\u001b');
  });

  it('renders repeated failures once with the original failure count', () => {
    const repeated = [1, 2, 3].map(index => ({
      ...tool(index, 'error', "Error: EPERM scandir '.pytest_cache'"),
      name: 'Glob',
      turnId: 'turn-1',
    }));
    const frame = render(React.createElement(Timeline, {
      items: repeated,
      detailsMode: 'compact',
      maxAnswerLines: 20,
    })).lastFrame() ?? '';
    expect(frame).toContain('3 issues');
    expect(frame).toContain('Glob ×3');
    expect(frame.match(/EPERM/g)).toHaveLength(1);
  });

  it('shows only the current action while a compact tool run is active', () => {
    const items = [
      tool(1, 'success', 'first result'),
      { ...tool(2, 'running', ''), input: { command: 'npm test' } },
    ];
    const frame = render(React.createElement(Timeline, {
      items, detailsMode: 'compact', maxAnswerLines: 20,
    })).lastFrame() ?? '';
    expect(frame).toContain('Running WebFetch');
    expect(frame).toContain('npm test');
    expect(frame).not.toContain('first result');
  });

  it('keeps the failure count intact in a narrow terminal', () => {
    const repeated = [1, 2, 3].map(index => ({
      ...tool(index, 'error', "Error: EPERM scandir 'C:\\Users\\demo\\.pytest_cache'"),
      name: 'Glob', turnId: 'turn-1',
    }));
    const frame = render(React.createElement(Timeline, {
      items: repeated, detailsMode: 'compact', maxAnswerLines: 20, columns: 56,
    })).lastFrame() ?? '';
    expect(frame).toContain('Glob ×3');
    expect(frame).toContain("EPERM scandir '.pytest_cache'");
  });

  it('shows inputs and successful outputs in expanded mode', () => {
    const view = render(React.createElement(Timeline, {
      items: [tool(1, 'success', 'all good')],
      detailsMode: 'expanded',
      maxAnswerLines: 20,
    }));
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('┌');
    expect(frame).toContain('└');
    expect(frame).toContain('input  echo 1');
    expect(frame).toContain('all good');
  });

  it('sanitizes control sequences in every non-tool text region', () => {
    const items: DisplayItem[] = [
      { id: 'user-ansi', kind: 'user', content: '\u001b[31muser\u001b[0m text', timestamp: 1 },
      {
        id: 'notice-ansi', kind: 'notice', tone: 'warning', title: '\u001b[33mwarning\u001b[0m',
        detail: '\u001b]0;changed-title\u0007detail', timestamp: 2,
      },
    ];
    const frame = render(React.createElement(Timeline, {
      items, detailsMode: 'compact', maxAnswerLines: 20,
    })).lastFrame() ?? '';
    expect(frame).toContain('user text');
    expect(frame).toContain('warning');
    expect(frame).toContain('detail');
    expect(frame).not.toContain('\u001b');
    expect(frame).not.toContain('changed-title');
  });

  it('renders a real latest-turn timeline rail and groups repeated failures', () => {
    const items: DisplayItem[] = [
      { ...tool(1, 'success'), turnId: 'turn-1' },
      { ...tool(2, 'success'), turnId: 'turn-2' },
      { ...tool(3, 'error', 'EPERM'), name: 'Glob', turnId: 'turn-2' },
      { ...tool(4, 'error', 'EPERM'), name: 'Glob', turnId: 'turn-2' },
    ];
    expect(buildActivityRailEntries(items)).toHaveLength(2);
    const frame = render(React.createElement(ActivityRail, { items, width: 28, height: 12 })).lastFrame() ?? '';
    expect(frame).toContain('Timeline');
    expect(frame).toContain('WebFetch');
    expect(frame).toContain('Glob ×2');
    expect(frame).toContain('2 issues');
    expect(frame).not.toContain('PowerShell');
  });
});
