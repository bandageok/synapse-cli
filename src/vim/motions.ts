/**
 * Vim Motion Functions (C.C.Claw MVP)
 *
 * Pure functions for resolving vim motions to cursor offset positions.
 * Works with plain strings (no Cursor class dependency).
 */

/**
 * Resolve a motion key to a new offset position.
 */
export function resolveMotion(
  key: string,
  offset: number,
  text: string,
  count: number,
): number {
  let result = offset;
  for (let i = 0; i < count; i++) {
    const next = applySingleMotion(key, result, text);
    if (next === result) break;
    result = next;
  }
  return result;
}

function applySingleMotion(key: string, offset: number, text: string): number {
  switch (key) {
    case 'h':
      return offset > 0 ? offset - 1 : offset;
    case 'l':
      return offset < text.length ? offset + 1 : offset;
    case 'j':
      return moveLine(text, offset, 1);
    case 'k':
      return moveLine(text, offset, -1);
    case 'w':
      return nextWordStart(text, offset);
    case 'b':
      return prevWordStart(text, offset);
    case 'e':
      return endOfWord(text, offset);
    case '0':
      return startOfLine(text, offset);
    case '^':
      return firstNonBlank(text, offset);
    case '$':
      return endOfLine(text, offset);
    default:
      return offset;
  }
}

// ============================================================================
// Line motions
// ============================================================================

function startOfLine(text: string, offset: number): number {
  const prevNewline = text.lastIndexOf('\n', offset - 1);
  return prevNewline === -1 ? 0 : prevNewline + 1;
}

function endOfLine(text: string, offset: number): number {
  const nextNewline = text.indexOf('\n', offset);
  return nextNewline === -1 ? text.length : nextNewline;
}

function firstNonBlank(text: string, offset: number): number {
  const sol = startOfLine(text, offset);
  const eol = endOfLine(text, offset);
  let i = sol;
  while (i < eol && (text[i] === ' ' || text[i] === '\t')) i++;
  return i < eol ? i : sol;
}

function moveLine(text: string, offset: number, direction: number): number {
  const lines = text.split('\n');
  let col = 0;
  let currentLine = 0;
  let pos = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineLen = lines[i]!.length;
    if (pos + lineLen >= offset) {
      currentLine = i;
      col = offset - pos;
      break;
    }
    pos += lineLen + 1;
  }

  const targetLine = currentLine + direction;
  if (targetLine < 0 || targetLine >= lines.length) return offset;

  let targetOffset = 0;
  for (let i = 0; i < targetLine; i++) {
    targetOffset += lines[i]!.length + 1;
  }
  const targetLineLen = lines[targetLine]!.length;
  targetOffset += Math.min(col, targetLineLen);
  return targetOffset;
}

// ============================================================================
// Word motions
// ============================================================================

function isWordChar(ch: string): boolean {
  return /[a-zA-Z0-9_]/.test(ch);
}

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

function nextWordStart(text: string, offset: number): number {
  let i = offset;
  // Skip current word chars
  while (i < text.length && isWordChar(text[i]!)) i++;
  // Skip non-word non-space chars (punctuation)
  while (i < text.length && !isWordChar(text[i]!) && !isWhitespace(text[i]!)) i++;
  // Skip whitespace
  while (i < text.length && isWhitespace(text[i]!)) i++;
  return i < text.length ? i : text.length;
}

function prevWordStart(text: string, offset: number): number {
  if (offset <= 0) return 0;
  let i = offset - 1;
  // Skip whitespace
  while (i > 0 && isWhitespace(text[i]!)) i--;
  // Skip word or non-word chars
  const isWord = isWordChar(text[i]!);
  while (i > 0) {
    const prev = i - 1;
    if (isWord && !isWordChar(text[prev]!)) break;
    if (!isWord && (isWordChar(text[prev]!) || isWhitespace(text[prev]!))) break;
    i = prev;
  }
  return i;
}

function endOfWord(text: string, offset: number): number {
  if (offset >= text.length - 1) return text.length;
  let i = offset + 1;
  // Skip whitespace
  while (i < text.length && isWhitespace(text[i]!)) i++;
  if (i >= text.length) return text.length - 1;
  // Move to end of word/non-word
  const isWord = isWordChar(text[i]!);
  while (i < text.length - 1) {
    const next = i + 1;
    if (isWord && !isWordChar(text[next]!)) break;
    if (!isWord && (isWordChar(text[next]!) || isWhitespace(text[next]!))) break;
    i = next;
  }
  return i;
}

// ============================================================================
// Helpers for operators
// ============================================================================

export function isInclusiveMotion(key: string): boolean {
  return 'e$'.includes(key);
}

export function isLinewiseMotion(key: string): boolean {
  return 'jk'.includes(key);
}
