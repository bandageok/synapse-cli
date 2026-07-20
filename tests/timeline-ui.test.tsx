import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { Timeline } from '../src/ui/components/Timeline.js';
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
    expect(frame).toContain('You');
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

  it('folds old successes, keeps failures open, and strips terminal color escapes', () => {
    const items: DisplayItem[] = [
      tool(1, 'success'), tool(2, 'success'), tool(3, 'success'), tool(4, 'success'),
      tool(5, 'success'), tool(6, 'error', '\u001b[31mTraceback\nboom\u001b[0m'),
    ];
    const view = render(React.createElement(Timeline, { items, detailsMode: 'compact', maxAnswerLines: 20 }));
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('3 completed');
    expect(frame).toContain('× WebFetch');
    expect(frame).toContain('Traceback');
    expect(frame).toContain('boom');
    expect(frame).not.toContain('\u001b');
  });

  it('shows inputs and successful outputs in expanded mode', () => {
    const view = render(React.createElement(Timeline, {
      items: [tool(1, 'success', 'all good')],
      detailsMode: 'expanded',
      maxAnswerLines: 20,
    }));
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('input  echo 1');
    expect(frame).toContain('all good');
  });
});
