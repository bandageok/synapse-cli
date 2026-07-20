export type DetailsMode = 'compact' | 'expanded';

interface BaseDisplayItem {
  id: string;
  timestamp: number;
}

export interface UserDisplayItem extends BaseDisplayItem {
  kind: 'user';
  content: string;
}

export interface AssistantDisplayItem extends BaseDisplayItem {
  kind: 'assistant';
  content: string;
  streaming: boolean;
}

export interface ToolDisplayItem extends BaseDisplayItem {
  kind: 'tool';
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
  output: string;
  status: 'running' | 'success' | 'error';
  durationMs?: number;
}

export interface NoticeDisplayItem extends BaseDisplayItem {
  kind: 'notice';
  tone: 'muted' | 'info' | 'warning' | 'error';
  title: string;
  detail?: string;
}

export interface ToolSummaryDisplayItem extends BaseDisplayItem {
  kind: 'tool-summary';
  count: number;
  tools: string;
}

export type DisplayItem = UserDisplayItem | AssistantDisplayItem | ToolDisplayItem | NoticeDisplayItem;
export type RenderableDisplayItem = DisplayItem | ToolSummaryDisplayItem;

const ANSI_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function summarizeToolInput(input: Record<string, unknown>, maxLength = 96): string {
  const preferredKeys = ['command', 'file_path', 'path', 'url', 'query', 'question', 'pattern'];
  const key = preferredKeys.find(candidate => typeof input[candidate] === 'string');
  const raw = key ? String(input[key]) : JSON.stringify(input);
  const compact = stripAnsi(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > maxLength ? compact.slice(0, Math.max(1, maxLength - 1)) + '…' : compact;
}

export function previewToolOutput(output: string, maxLines = 6, maxCharacters = 1_200): string {
  const clean = stripAnsi(output).trim();
  if (!clean) return '(no output)';
  const bounded = clean.length > maxCharacters
    ? clean.slice(0, Math.floor(maxCharacters * 0.6)) + '\n… output shortened …\n' + clean.slice(-Math.floor(maxCharacters * 0.3))
    : clean;
  const lines = bounded.split('\n');
  if (lines.length <= maxLines) return bounded;
  const headCount = Math.max(1, Math.ceil((maxLines - 1) / 2));
  const tailCount = Math.max(1, maxLines - headCount - 1);
  return [...lines.slice(0, headCount), `… ${lines.length - headCount - tailCount} lines hidden …`, ...lines.slice(-tailCount)].join('\n');
}

export function startTool(items: DisplayItem[], item: Omit<ToolDisplayItem, 'kind' | 'output' | 'status'>): DisplayItem[] {
  return [...items, { ...item, kind: 'tool', output: '', status: 'running' }];
}

export function finishTool(
  items: DisplayItem[],
  result: { toolUseId: string; name: string; output: string; isError: boolean; durationMs: number; timestamp: number; id: string },
): DisplayItem[] {
  const index = items.findIndex(item => item.kind === 'tool' && item.toolUseId === result.toolUseId);
  const completed: ToolDisplayItem = {
    id: index >= 0 ? items[index].id : result.id,
    kind: 'tool',
    toolUseId: result.toolUseId,
    name: result.name,
    input: index >= 0 && items[index].kind === 'tool' ? items[index].input : {},
    output: stripAnsi(result.output),
    status: result.isError ? 'error' : 'success',
    durationMs: result.durationMs,
    timestamp: index >= 0 ? items[index].timestamp : result.timestamp,
  };
  if (index < 0) return [...items, completed];
  return [...items.slice(0, index), completed, ...items.slice(index + 1)];
}

export function appendAssistantText(items: DisplayItem[], text: string, id: string, timestamp: number): DisplayItem[] {
  const last = items.at(-1);
  if (last?.kind === 'assistant' && last.streaming) {
    return [...items.slice(0, -1), { ...last, content: last.content + text }];
  }
  return [...items, { id, kind: 'assistant', content: text, streaming: true, timestamp }];
}

export function finishAssistantStreams(items: DisplayItem[]): DisplayItem[] {
  return items.map(item => item.kind === 'assistant' && item.streaming ? { ...item, streaming: false } : item);
}

export function compactTimeline(items: DisplayItem[], mode: DetailsMode, keepRecentTools = 3): RenderableDisplayItem[] {
  if (mode === 'expanded') return items;
  const result: RenderableDisplayItem[] = [];
  let index = 0;
  while (index < items.length) {
    if (items[index].kind !== 'tool') {
      result.push(items[index]);
      index++;
      continue;
    }
    const run: ToolDisplayItem[] = [];
    while (index < items.length && items[index].kind === 'tool') {
      run.push(items[index] as ToolDisplayItem);
      index++;
    }
    const mustShow = new Set<ToolDisplayItem>(run.filter(item => item.status !== 'success'));
    for (const item of run.slice(-keepRecentTools)) mustShow.add(item);
    const hidden = run.filter(item => !mustShow.has(item));
    if (hidden.length > 0) {
      const counts = new Map<string, number>();
      for (const item of hidden) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
      const tools = [...counts.entries()].map(([name, count]) => count > 1 ? `${name} ×${count}` : name).join(', ');
      result.push({
        id: `summary-${hidden[0].id}`,
        kind: 'tool-summary',
        count: hidden.length,
        tools,
        timestamp: hidden[0].timestamp,
      });
    }
    result.push(...run.filter(item => mustShow.has(item)));
  }
  return result;
}
