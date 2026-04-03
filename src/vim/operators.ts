/**
 * Vim Operator Functions (Synapse MVP)
 *
 * Simplified operators working with plain strings + offsets.
 */

import {
  isInclusiveMotion,
  isLinewiseMotion,
  resolveMotion,
} from './motions.js';
import type { Operator, RecordedChange } from './types.js';

export type OperatorContext = {
  text: string;
  setText: (text: string) => void;
  cursor: number;
  setCursor: (offset: number) => void;
  enterInsert: (offset: number) => void;
  getRegister: () => string;
  setRegister: (content: string, linewise: boolean) => void;
  recordChange: (change: RecordedChange) => void;
};

/**
 * Execute an operator with a simple motion.
 */
export function executeOperatorMotion(
  op: Operator,
  motion: string,
  count: number,
  ctx: OperatorContext,
): void {
  const target = resolveMotion(motion, ctx.cursor, ctx.text, count);
  if (target === ctx.cursor) return;

  const range = getOperatorRange(ctx.cursor, target, motion, ctx.text);
  applyOperator(op, range.from, range.to, ctx, range.linewise);
  ctx.recordChange({ type: 'operator', op, motion, count });
}

/**
 * Execute a line operation (dd, cc, yy).
 */
export function executeLineOp(
  op: Operator,
  count: number,
  ctx: OperatorContext,
): void {
  const text = ctx.text;
  const lines = text.split('\n');
  const currentLine = text.slice(0, ctx.cursor).split('\n').length - 1;
  const linesToAffect = Math.min(count, lines.length - currentLine);

  const lineStart = text.lastIndexOf('\n', ctx.cursor - 1) + 1;
  let lineEnd = lineStart;
  for (let i = 0; i < linesToAffect; i++) {
    const nextNewline = text.indexOf('\n', lineEnd);
    lineEnd = nextNewline === -1 ? text.length : nextNewline + 1;
  }

  let content = text.slice(lineStart, lineEnd);
  if (!content.endsWith('\n')) content += '\n';
  ctx.setRegister(content, true);

  if (op === 'yank') {
    ctx.setCursor(lineStart);
  } else if (op === 'delete') {
    let deleteStart = lineStart;
    if (lineEnd === text.length && deleteStart > 0 && text[deleteStart - 1] === '\n') {
      deleteStart -= 1;
    }
    const newText = text.slice(0, deleteStart) + text.slice(lineEnd);
    ctx.setText(newText);
    ctx.setCursor(Math.min(deleteStart, Math.max(0, newText.length - 1)));
  } else if (op === 'change') {
    if (lines.length === 1) {
      ctx.setText('');
      ctx.enterInsert(0);
    } else {
      const beforeLines = lines.slice(0, currentLine);
      const afterLines = lines.slice(currentLine + linesToAffect);
      const newText = [...beforeLines, '', ...afterLines].join('\n');
      ctx.setText(newText);
      const newOffset = beforeLines.join('\n').length + (currentLine > 0 ? 1 : 0);
      ctx.enterInsert(newOffset);
    }
  }

  ctx.recordChange({ type: 'operator', op, motion: op[0]!, count });
}

/**
 * Execute delete character (x command).
 */
export function executeX(count: number, ctx: OperatorContext): void {
  const from = ctx.cursor;
  if (from >= ctx.text.length) return;

  const to = Math.min(from + count, ctx.text.length);
  const deleted = ctx.text.slice(from, to);
  const newText = ctx.text.slice(0, from) + ctx.text.slice(to);

  ctx.setRegister(deleted, false);
  ctx.setText(newText);
  ctx.setCursor(Math.min(from, Math.max(0, newText.length - 1)));
  ctx.recordChange({ type: 'x', count });
}

/**
 * Execute open line (o/O command).
 */
export function executeOpenLine(
  direction: 'above' | 'below',
  ctx: OperatorContext,
): void {
  const text = ctx.text;
  const lines = text.split('\n');
  const currentLine = text.slice(0, ctx.cursor).split('\n').length - 1;

  const insertLine = direction === 'below' ? currentLine + 1 : currentLine;
  const newLines = [
    ...lines.slice(0, insertLine),
    '',
    ...lines.slice(insertLine),
  ];

  const newText = newLines.join('\n');
  ctx.setText(newText);

  let offset = 0;
  for (let i = 0; i < insertLine; i++) {
    offset += newLines[i]!.length + 1;
  }
  ctx.enterInsert(offset);
  ctx.recordChange({ type: 'openLine', direction });
}

// ============================================================================
// Internal Helpers
// ============================================================================

function getOperatorRange(
  cursor: number,
  target: number,
  motion: string,
  text: string,
): { from: number; to: number; linewise: boolean } {
  let from = Math.min(cursor, target);
  let to = Math.max(cursor, target);
  let linewise = false;

  if (isLinewiseMotion(motion)) {
    linewise = true;
    const nextNewline = text.indexOf('\n', to);
    if (nextNewline === -1) {
      to = text.length;
      if (from > 0 && text[from - 1] === '\n') from -= 1;
    } else {
      to = nextNewline + 1;
    }
  } else if (isInclusiveMotion(motion) && cursor <= target) {
    to = Math.min(to + 1, text.length);
  }

  return { from, to, linewise };
}

function applyOperator(
  op: Operator,
  from: number,
  to: number,
  ctx: OperatorContext,
  linewise: boolean = false,
): void {
  let content = ctx.text.slice(from, to);
  if (linewise && !content.endsWith('\n')) content += '\n';
  ctx.setRegister(content, linewise);

  if (op === 'yank') {
    ctx.setCursor(from);
  } else if (op === 'delete') {
    const newText = ctx.text.slice(0, from) + ctx.text.slice(to);
    ctx.setText(newText);
    ctx.setCursor(Math.min(from, Math.max(0, newText.length - 1)));
  } else if (op === 'change') {
    const newText = ctx.text.slice(0, from) + ctx.text.slice(to);
    ctx.setText(newText);
    ctx.enterInsert(from);
  }
}
