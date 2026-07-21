import stringWidth from 'string-width';

export type DetailsMode = 'compact' | 'expanded';

interface BaseDisplayItem {
  id: string;
  timestamp: number;
  /** Optional for display items restored from releases before v0.5.0. */
  turnId?: string;
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

export interface ActivityFailureGroup {
  item: ToolDisplayItem;
  count: number;
  totalDurationMs: number;
}

export interface ActivityDisplayItem extends BaseDisplayItem {
  kind: 'activity';
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  totalDurationMs: number;
  failures: ActivityFailureGroup[];
  current?: ToolDisplayItem;
}

export type DisplayItem = UserDisplayItem | AssistantDisplayItem | ToolDisplayItem | NoticeDisplayItem;
export type RenderableDisplayItem = DisplayItem | ActivityDisplayItem;

export interface TimelineWindow {
  items: RenderableDisplayItem[];
  totalRows: number;
  rowsAbove: number;
  rowsBelow: number;
  maxScrollRows: number;
}

const ANSI_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function summarizeToolInput(input: Record<string, unknown>, maxLength = 96): string {
  const preferredKeys = ['command', 'file_path', 'path', 'url', 'query', 'question', 'pattern', 'action'];
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

export function summarizeToolError(output: string, maxLength = 140): string {
  const lines = stripAnsi(output)
    .split('\n')
    .map(line => line.replace(/^\s*[|>`-]+\s*/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (lines.length === 0) return 'No error details';
  const preferred = lines.find(line => /\b(error|failed|failure|denied|eperm|enoent|timeout|exception)\b/i.test(line));
  const summary = (preferred ?? lines.at(-1) ?? lines[0])
    .replace(/^error:\s*/i, '')
    .replace(/[A-Za-z]:\\(?:[^\\\s'"`]+\\)*([^\\\s'"`]+)/g, '$1');
  return summary.length > maxLength ? summary.slice(0, Math.max(1, maxLength - 1)) + '…' : summary;
}

export function startTool(items: DisplayItem[], item: Omit<ToolDisplayItem, 'kind' | 'output' | 'status'>): DisplayItem[] {
  return [...items, { ...item, kind: 'tool', output: '', status: 'running' }];
}

export function finishTool(
  items: DisplayItem[],
  result: { toolUseId: string; name: string; output: string; isError: boolean; durationMs: number; timestamp: number; id: string; turnId?: string },
): DisplayItem[] {
  const index = items.findIndex(item => item.kind === 'tool' && item.toolUseId === result.toolUseId);
  const started = index >= 0 && items[index].kind === 'tool' ? items[index] as ToolDisplayItem : undefined;
  const completed: ToolDisplayItem = {
    id: started?.id ?? result.id,
    kind: 'tool',
    toolUseId: result.toolUseId,
    name: result.name,
    input: started?.input ?? {},
    output: stripAnsi(result.output),
    status: result.isError ? 'error' : 'success',
    durationMs: result.durationMs,
    timestamp: started?.timestamp ?? result.timestamp,
    turnId: started?.turnId ?? result.turnId,
  };
  if (index < 0) return [...items, completed];
  return [...items.slice(0, index), completed, ...items.slice(index + 1)];
}

export function appendAssistantText(
  items: DisplayItem[],
  text: string,
  id: string,
  timestamp: number,
  turnId?: string,
): DisplayItem[] {
  const last = items.at(-1);
  if (last?.kind === 'assistant' && last.streaming && last.turnId === turnId) {
    return [...items.slice(0, -1), { ...last, content: last.content + text }];
  }
  return [...items, { id, kind: 'assistant', content: text, streaming: true, timestamp, turnId }];
}

export function finishAssistantStreams(items: DisplayItem[]): DisplayItem[] {
  return items.map(item => item.kind === 'assistant' && item.streaming ? { ...item, streaming: false } : item);
}

export function toolErrorFingerprint(item: ToolDisplayItem): string {
  const output = stripAnsi(item.output).replace(/\s+/g, ' ').trim().slice(0, 800);
  return `${item.name}\u0000${output}`;
}

function compactToolRun(run: ToolDisplayItem[]): RenderableDisplayItem[] {
  const errorGroups = new Map<string, ToolDisplayItem[]>();
  for (const item of run) {
    if (item.status !== 'error') continue;
    const fingerprint = toolErrorFingerprint(item);
    const group = errorGroups.get(fingerprint) ?? [];
    group.push(item);
    errorGroups.set(fingerprint, group);
  }

  const failures = [...errorGroups.values()].map(group => ({
    item: group[0],
    count: group.length,
    totalDurationMs: group.reduce((sum, entry) => sum + (entry.durationMs ?? 0), 0),
  }));
  return [{
    id: `activity-${run[0].id}`,
    kind: 'activity',
    total: run.length,
    succeeded: run.filter(item => item.status === 'success').length,
    failed: run.filter(item => item.status === 'error').length,
    running: run.filter(item => item.status === 'running').length,
    totalDurationMs: run.reduce((sum, item) => sum + (item.durationMs ?? 0), 0),
    failures,
    current: [...run].reverse().find(item => item.status === 'running'),
    timestamp: run[0].timestamp,
    turnId: run[0].turnId,
  }];
}

export function compactTimeline(
  items: DisplayItem[],
  mode: DetailsMode,
  expandedTurnId?: string | null,
): RenderableDisplayItem[] {
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
    const runTurnId = items[index].turnId;
    while (index < items.length && items[index].kind === 'tool' && items[index].turnId === runTurnId) {
      run.push(items[index] as ToolDisplayItem);
      index++;
    }
    if (expandedTurnId && run.some(item => item.turnId === expandedTurnId)) result.push(...run);
    else result.push(...compactToolRun(run));
  }
  return result;
}

export function latestTurnId(items: DisplayItem[]): string | undefined {
  for (let index = items.length - 1; index >= 0; index--) {
    if (items[index].turnId) return items[index].turnId;
  }
  return undefined;
}

export function countFailures(items: RenderableDisplayItem[]): number {
  return items.reduce((count, item) => {
    if (item.kind === 'activity') return count + item.failed;
    if (item.kind === 'tool' && item.status === 'error') return count + 1;
    if (item.kind === 'notice' && item.tone === 'error') return count + 1;
    return count;
  }, 0);
}

export function wrappedRows(value: string, columns: number): number {
  const width = Math.max(1, columns);
  return stripAnsi(value).split('\n').reduce((rows, line) => rows + Math.max(1, Math.ceil(stringWidth(line) / width)), 0);
}

export function estimateDisplayItemRows(
  item: RenderableDisplayItem,
  columns: number,
  detailsMode: DetailsMode,
  maxAnswerLines: number,
  expandedTurnId?: string | null,
): number {
  const contentColumns = Math.max(20, columns - 4);
  if (item.kind === 'user') return 1 + wrappedRows(item.content, contentColumns);
  if (item.kind === 'assistant') return 2 + Math.min(maxAnswerLines, wrappedRows(item.content, contentColumns));
  if (item.kind === 'notice') return 1 + (item.detail ? wrappedRows(item.detail, contentColumns) : 0);
  if (item.kind === 'activity') return 1 + item.failures.length * (columns < 72 ? 2 : 1);
  const expanded = detailsMode === 'expanded' || (!!expandedTurnId && item.turnId === expandedTurnId);
  let rows = expanded ? 4 : 1;
  if (expanded && summarizeToolInput(item.input)) rows += wrappedRows(summarizeToolInput(item.input), contentColumns);
  if ((expanded || item.status === 'error') && item.output) {
    rows += wrappedRows(previewToolOutput(item.output, expanded ? 14 : 6), contentColumns);
  }
  return rows;
}

export function sliceTimelineByRows(
  items: RenderableDisplayItem[],
  rowBudget: number,
  columns: number,
  detailsMode: DetailsMode,
  maxAnswerLines: number,
  scrollRows = 0,
  expandedTurnId?: string | null,
): TimelineWindow {
  const budget = Math.max(1, rowBudget);
  const heights = items.map(item => estimateDisplayItemRows(item, columns, detailsMode, maxAnswerLines, expandedTurnId));
  const totalRows = heights.reduce((sum, height) => sum + height, 0);
  const maxScrollRows = Math.max(0, totalRows - budget);
  const targetScroll = Math.min(Math.max(0, scrollRows), maxScrollRows);

  let end = items.length;
  let rowsBelow = 0;
  while (end > 0 && rowsBelow < targetScroll) {
    rowsBelow += heights[end - 1];
    end--;
  }

  let start = end;
  let visibleRows = 0;
  while (start > 0 && visibleRows < budget) {
    visibleRows += heights[start - 1];
    start--;
  }

  const rowsAbove = heights.slice(0, start).reduce((sum, height) => sum + height, 0);
  return {
    items: items.slice(start, end),
    totalRows,
    rowsAbove,
    rowsBelow,
    maxScrollRows,
  };
}

export function preserveScrollOffset(scrollRows: number, previousTotalRows: number, nextTotalRows: number): number {
  if (scrollRows <= 0 || nextTotalRows <= previousTotalRows) return scrollRows;
  return scrollRows + nextTotalRows - previousTotalRows;
}
