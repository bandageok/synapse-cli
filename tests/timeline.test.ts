import { describe, expect, it } from 'vitest';
import {
  appendAssistantText,
  compactTimeline,
  finishAssistantStreams,
  finishTool,
  previewToolOutput,
  startTool,
  stripAnsi,
  summarizeToolInput,
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

  it('folds old successful calls while keeping recent, running, and failed calls visible', () => {
    const items: DisplayItem[] = [
      ...Array.from({ length: 7 }, (_, index) => tool(index + 1, 'success', index < 5 ? 'PowerShell' : 'WebFetch')),
      tool(8, 'error'),
      tool(9, 'running'),
    ];
    const compact = compactTimeline(items, 'compact', 3);
    const summary = compact.find(item => item.kind === 'tool-summary');
    expect(summary).toMatchObject({ kind: 'tool-summary', count: 6 });
    expect(summary && summary.kind === 'tool-summary' ? summary.tools : '').toContain('PowerShell ×5');
    expect(compact.filter(item => item.kind === 'tool')).toHaveLength(3);
    expect(compact.some(item => item.kind === 'tool' && item.status === 'error')).toBe(true);
    expect(compact.some(item => item.kind === 'tool' && item.status === 'running')).toBe(true);
    expect(compactTimeline(items, 'expanded')).toEqual(items);
  });

  it('streams into the current assistant item and seals it at turn end', () => {
    const first = appendAssistantText([], 'hello', 'assistant-1', 1);
    const second = appendAssistantText(first, ' world', 'unused', 2);
    expect(second).toEqual([expect.objectContaining({ content: 'hello world', streaming: true })]);
    expect(finishAssistantStreams(second)).toEqual([expect.objectContaining({ streaming: false })]);
  });
});
