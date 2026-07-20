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

export function virtualizeText(content: string, maxLines: number, columns = 100): string {
  if (maxLines < 3 || columns < 20) return content.slice(-Math.max(100, columns * maxLines));
  const scanBudget = Math.max(4_000, maxLines * columns * 4);
  let source = content;
  let omittedCharacters = 0;
  if (content.length > scanBudget) {
    const headCharacters = Math.floor(scanBudget * 0.35);
    const tailCharacters = scanBudget - headCharacters;
    omittedCharacters = content.length - headCharacters - tailCharacters;
    source = `${content.slice(0, headCharacters)}\n... [${omittedCharacters} rendered characters omitted] ...\n${content.slice(-tailCharacters)}`;
  }
  const logical: string[] = [];
  for (const line of source.split('\n')) {
    if (!line) {
      logical.push('');
      continue;
    }
    for (let offset = 0; offset < line.length; offset += columns) logical.push(line.slice(offset, offset + columns));
  }
  if (logical.length <= maxLines) return source;
  const headCount = Math.max(1, Math.floor(maxLines * 0.35));
  const tailCount = Math.max(1, maxLines - headCount - 1);
  const omitted = logical.length - headCount - tailCount;
  const marker = omittedCharacters > 0
    ? `... [${omitted} rendered lines and ${omittedCharacters} characters omitted] ...`
    : `... [${omitted} rendered lines omitted] ...`;
  return [...logical.slice(0, headCount), marker, ...logical.slice(-tailCount)].join('\n');
}
