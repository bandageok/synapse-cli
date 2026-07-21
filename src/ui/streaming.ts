export class TokenRenderBuffer {
  private pending = '';
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly onFlush: (text: string) => void,
    private readonly intervalMs = 40,
    private readonly maxPendingChars = 32_768,
  ) {}

  async push(text: string): Promise<void> {
    this.pending += text;
    if (this.pending.length >= this.maxPendingChars) {
      this.flush();
      await new Promise<void>(resolve => setImmediate(resolve));
      return;
    }
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.intervalMs);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.pending) return;
    const batch = this.pending;
    this.pending = '';
    this.onFlush(batch);
  }

  close(): void {
    this.flush();
  }
}

export interface VirtualizedText {
  text: string;
  truncated: boolean;
  omittedRows: number;
}

function lineRows(line: string, columns: number): number {
  return Math.max(1, Math.ceil(stringWidth(line) / Math.max(1, columns)));
}

function takeDisplayWidth(value: string, maxWidth: number, fromEnd = false): string {
  const scanCharacters = Math.max(32, maxWidth * 4);
  const source = fromEnd ? value.slice(-scanCharacters) : value.slice(0, scanCharacters);
  const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(source)].map(entry => entry.segment);
  const selected: string[] = [];
  let width = 0;
  const ordered = fromEnd ? segments.reverse() : segments;
  for (const segment of ordered) {
    const nextWidth = stringWidth(segment);
    if (selected.length > 0 && width + nextWidth > maxWidth) break;
    selected.push(segment);
    width += nextWidth;
  }
  if (fromEnd) selected.reverse();
  return selected.join('');
}

export function tailTextByRows(value: string, columns: number, maxRows: number): string {
  const maxWidth = Math.max(1, columns) * Math.max(1, maxRows);
  if (stringWidth(value) <= maxWidth) return value;
  return '…' + takeDisplayWidth(value, Math.max(1, maxWidth - 1), true);
}

export function virtualizeText(content: string, maxLines: number, columns = 100): VirtualizedText {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const width = Math.max(20, columns);
  const budget = Math.max(3, maxLines);
  const lines = normalized.split('\n');
  const rowCosts = lines.map(line => lineRows(line, width));
  const totalRows = rowCosts.reduce((sum, rows) => sum + rows, 0);
  if (totalRows <= budget) return { text: normalized, truncated: false, omittedRows: 0 };

  const headBudget = Math.max(1, Math.floor((budget - 1) * 0.4));
  const tailBudget = Math.max(1, budget - headBudget - 1);
  if (lines.length === 1) {
    const omittedRows = Math.max(1, totalRows - headBudget - tailBudget);
    return {
      text: `${takeDisplayWidth(normalized, headBudget * width)}\n… ${omittedRows} rendered lines hidden …\n${takeDisplayWidth(normalized, tailBudget * width, true)}`,
      truncated: true,
      omittedRows,
    };
  }
  let headEnd = 0;
  let headRows = 0;
  while (headEnd < lines.length && (headRows === 0 || headRows + rowCosts[headEnd] <= headBudget)) {
    headRows += rowCosts[headEnd];
    headEnd++;
  }

  let tailStart = lines.length;
  let tailRows = 0;
  while (tailStart > headEnd && (tailRows === 0 || tailRows + rowCosts[tailStart - 1] <= tailBudget)) {
    tailStart--;
    tailRows += rowCosts[tailStart];
  }

  const omittedRows = Math.max(1, totalRows - headRows - tailRows);
  const marker = `… ${omittedRows} rendered lines hidden …`;
  return {
    text: [...lines.slice(0, headEnd), marker, ...lines.slice(tailStart)].join('\n'),
    truncated: true,
    omittedRows,
  };
}
import stringWidth from 'string-width';
