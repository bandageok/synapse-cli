import { describe, expect, it } from 'vitest';
import {
  appendAssistantText,
  compactTimeline,
  latestTurnId,
  preserveScrollOffset,
  sliceTimelineByRows,
  finishAssistantStreams,
  finishTool,
  previewToolOutput,
  summarizeToolError,
  startTool,
  stripAnsi,
  summarizeToolInput,
  wrappedRows,
  type DisplayItem,
  type ToolDisplayItem,
} from '../src/ui/timeline.js';

function tool(index: number, status: ToolDisplayItem['status'] = 'success', name = 'PowerShell'): ToolDisplayItem {
  return {
    id: `display-${index}`,
    kind: 'tool',
    toolUseId: `tool-${index}`,
    name,
    input: { command: `echo ${index}` },
    output: status === 'error' ? 'failed' : 'ok',
    status,
    durationMs: index * 10,
    timestamp: index,
  };
}

describe('terminal timeline model', () => {
  it('removes ANSI state so tool output cannot recolor the rest of the terminal', () => {
    expect(stripAnsi('\u001b[32mgreen\u001b[0m plain')).toBe('green plain');
  });

  it('summarizes recognizable tool inputs without dumping JSON', () => {
    expect(summarizeToolInput({ command: 'npm test\n-- --runInBand' })).toBe('npm test -- --runInBand');
    expect(summarizeToolInput({ file_path: 'C:/repo/src/index.ts' })).toBe('C:/repo/src/index.ts');
    expect(summarizeToolInput({ value: 'x'.repeat(200) }, 24)).toHaveLength(24);
  });

  it('keeps the head and tail of long output and reports omitted lines', () => {
    const output = Array.from({ length: 12 }, (_, index) => `line-${index + 1}`).join('\n');
    const preview = previewToolOutput(output, 5);
    expect(preview).toContain('line-1');
    expect(preview).toContain('8 lines hidden');
    expect(preview).toContain('line-12');
  });

  it('updates tools by stable tool-use id and preserves a real error flag', () => {
    const started = startTool([], {
      id: 'display-1', toolUseId: 'call-1', name: 'Bash', input: { command: 'echo ok' }, timestamp: 1,
    });
    const finished = finishTool(started, {
      id: 'fallback', toolUseId: 'call-1', name: 'Bash', output: '\u001b[31mboom\u001b[0m',
      isError: true, durationMs: 42, timestamp: 2,
    });
    expect(finished).toEqual([expect.objectContaining({
      id: 'display-1', status: 'error', output: 'boom', durationMs: 42,
    })]);
  });

  it('folds an entire tool run into one stable activity item', () => {
    const items: DisplayItem[] = [
      ...Array.from({ length: 7 }, (_, index) => tool(index + 1, 'success', index < 5 ? 'PowerShell' : 'WebFetch')),
      tool(8, 'error'),
      tool(9, 'running'),
    ];
    const compact = compactTimeline(items, 'compact');
    expect(compact).toHaveLength(1);
    expect(compact[0]).toMatchObject({
      kind: 'activity', total: 9, succeeded: 7, failed: 1, running: 1,
      current: expect.objectContaining({ id: 'display-9' }),
    });
    expect(compactTimeline(items, 'expanded')).toEqual(items);
  });

  it('groups repeated failures in compact mode without deleting expanded audit events', () => {
    const items: DisplayItem[] = [
      { ...tool(1, 'error', 'Glob'), output: "Error: EPERM scandir '.pytest_cache'", turnId: 'turn-1' },
      { ...tool(2, 'error', 'Glob'), output: "Error: EPERM scandir '.pytest_cache'", turnId: 'turn-1' },
      { ...tool(3, 'error', 'Glob'), output: "Error: EPERM scandir '.pytest_cache'", turnId: 'turn-1' },
    ];
    const compact = compactTimeline(items, 'compact');
    expect(compact).toHaveLength(1);
    expect(compact[0]).toMatchObject({
      kind: 'activity', failed: 3, turnId: 'turn-1',
      failures: [expect.objectContaining({ count: 3 })],
    });
    expect(compactTimeline(items, 'expanded')).toEqual(items);
  });

  it('keeps one selected turn expanded while compacting other turns', () => {
    const items: DisplayItem[] = Array.from({ length: 8 }, (_, index) => ({
      ...tool(index + 1),
      turnId: index < 4 ? 'turn-1' : 'turn-2',
    }));
    const compact = compactTimeline(items, 'compact', 'turn-1');
    expect(compact.filter(item => item.turnId === 'turn-1')).toHaveLength(4);
    expect(compact.filter(item => item.turnId === 'turn-2')).toHaveLength(1);
    expect(compact.find(item => item.turnId === 'turn-2')).toMatchObject({ kind: 'activity', total: 4 });
    expect(latestTurnId(items)).toBe('turn-2');
  });

  it('extracts one actionable error line instead of a traceback', () => {
    const output = "Traceback (most recent call last):\n  at worker.ts:12\nError: EPERM scandir 'C:\\Users\\demo\\.pytest_cache'";
    expect(summarizeToolError(output)).toBe("EPERM scandir '.pytest_cache'");
    expect(summarizeToolError('')).toBe('No error details');
  });

  it('uses terminal display width for CJK row estimates and slices by rows', () => {
    expect(wrappedRows('中文中文', 4)).toBe(2);
    const items: DisplayItem[] = [
      { id: 'u1', kind: 'user', content: 'first', timestamp: 1, turnId: 'turn-1' },
      { id: 'a1', kind: 'assistant', content: '中文'.repeat(20), streaming: false, timestamp: 2, turnId: 'turn-1' },
      { id: 'u2', kind: 'user', content: 'latest', timestamp: 3, turnId: 'turn-2' },
    ];
    const window = sliceTimelineByRows(items, 6, 20, 'compact', 20);
    expect(window.totalRows).toBeGreaterThan(items.length);
    expect(window.items.at(-1)).toMatchObject({ id: 'u2' });
    expect(window.rowsAbove).toBeGreaterThan(0);
  });

  it('preserves the viewed history position when streamed rows are appended', () => {
    expect(preserveScrollOffset(12, 100, 107)).toBe(19);
    expect(preserveScrollOffset(0, 100, 107)).toBe(0);
    expect(preserveScrollOffset(12, 100, 98)).toBe(12);
  });

  it('streams into the current assistant item and seals it at turn end', () => {
    const first = appendAssistantText([], 'hello', 'assistant-1', 1, 'turn-1');
    const second = appendAssistantText(first, ' world', 'unused', 2, 'turn-1');
    expect(second).toEqual([expect.objectContaining({ content: 'hello world', streaming: true })]);
    expect(finishAssistantStreams(second)).toEqual([expect.objectContaining({ streaming: false })]);
  });
});
