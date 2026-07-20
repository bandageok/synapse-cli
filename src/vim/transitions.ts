/** Pure command parser for Synapse's prompt-line Vim mode. */

import { resolveMotion } from './motions.js';
import {
  executeLineOp,
  executeOpenLine,
  executeOperatorMotion,
  executeX,
  type OperatorContext,
} from './operators.js';
import {
  type CommandState,
  isOperatorKey,
  MAX_VIM_COUNT,
  OPERATORS,
  type Operator,
  SIMPLE_MOTIONS,
} from './types.js';

export type TransitionContext = OperatorContext & {
  onUndo?: () => void;
  onDotRepeat?: () => void;
};

export type TransitionResult = {
  next?: CommandState;
  execute?: () => void;
};

const OPERATOR_KEYS: Record<Operator, keyof typeof OPERATORS> = {
  delete: 'd',
  change: 'c',
  yank: 'y',
};

export function transition(
  state: CommandState,
  input: string,
  ctx: TransitionContext,
): TransitionResult {
  if (input.length !== 1) return reset();

  switch (state.type) {
    case 'idle':
      return transitionIdle(input, ctx);
    case 'count':
      return transitionCount(state.digits, input, ctx);
    case 'operator':
      return transitionOperator(state.op, state.count, input, ctx);
    case 'operatorCount':
      return transitionOperatorCount(state, input, ctx);
  }
}

function transitionIdle(input: string, ctx: TransitionContext): TransitionResult {
  if (isNonZeroDigit(input)) return { next: { type: 'count', digits: input } };
  if (input === '0') return motion('0', 1, ctx);
  return normalCommand(input, 1, ctx);
}

function transitionCount(
  digits: string,
  input: string,
  ctx: TransitionContext,
): TransitionResult {
  if (isDigit(input)) return { next: { type: 'count', digits: appendCount(digits, input) } };
  return normalCommand(input, parseCount(digits), ctx);
}

function transitionOperator(
  operator: Operator,
  count: number,
  input: string,
  ctx: TransitionContext,
): TransitionResult {
  if (input === OPERATOR_KEYS[operator]) return lineOperator(operator, count, ctx);
  if (input === '0') return operatorMotion(operator, '0', count, ctx);
  if (isNonZeroDigit(input)) {
    return { next: { type: 'operatorCount', op: operator, count, digits: input } };
  }
  return operatorCommand(operator, count, input, ctx);
}

function transitionOperatorCount(
  state: Extract<CommandState, { type: 'operatorCount' }>,
  input: string,
  ctx: TransitionContext,
): TransitionResult {
  if (isDigit(input)) {
    return { next: { ...state, digits: appendCount(state.digits, input) } };
  }

  const effectiveCount = clampCount(state.count * parseCount(state.digits));
  if (input === OPERATOR_KEYS[state.op]) return lineOperator(state.op, effectiveCount, ctx);
  return operatorCommand(state.op, effectiveCount, input, ctx);
}

function normalCommand(
  input: string,
  count: number,
  ctx: TransitionContext,
): TransitionResult {
  if (isOperatorKey(input)) {
    return { next: { type: 'operator', op: OPERATORS[input], count } };
  }
  if (SIMPLE_MOTIONS.has(input)) return motion(input, count, ctx);

  switch (input) {
    case 'x':
      return executeAndReset(() => executeX(count, ctx));
    case 'u':
      return executeAndReset(() => ctx.onUndo?.());
    case '.':
      return executeAndReset(() => ctx.onDotRepeat?.());
    case 'i':
      return { execute: () => ctx.enterInsert(ctx.cursor) };
    case 'a':
      return {
        execute: () => ctx.enterInsert(
          ctx.cursor < ctx.text.length ? ctx.cursor + 1 : ctx.cursor,
        ),
      };
    case 'I':
      return { execute: () => ctx.enterInsert(firstNonBlankOffset(ctx.text, ctx.cursor)) };
    case 'A':
      return { execute: () => ctx.enterInsert(lineEndOffset(ctx.text, ctx.cursor)) };
    case 'o':
      return { execute: () => executeOpenLine('below', ctx) };
    case 'O':
      return { execute: () => executeOpenLine('above', ctx) };
    default:
      return reset();
  }
}

function operatorCommand(
  operator: Operator,
  count: number,
  input: string,
  ctx: TransitionContext,
): TransitionResult {
  if (!SIMPLE_MOTIONS.has(input)) return reset();
  return operatorMotion(operator, input, count, ctx);
}

function motion(input: string, count: number, ctx: TransitionContext): TransitionResult {
  return executeAndReset(() => {
    ctx.setCursor(resolveMotion(input, ctx.cursor, ctx.text, count));
  });
}

function lineOperator(
  operator: Operator,
  count: number,
  ctx: TransitionContext,
): TransitionResult {
  const execute = () => executeLineOp(operator, count, ctx);
  return operator === 'change' ? { execute } : executeAndReset(execute);
}

function operatorMotion(
  operator: Operator,
  input: string,
  count: number,
  ctx: TransitionContext,
): TransitionResult {
  const execute = () => executeOperatorMotion(operator, input, count, ctx);
  return operator === 'change' ? { execute } : executeAndReset(execute);
}

function executeAndReset(execute: () => void): TransitionResult {
  return { next: { type: 'idle' }, execute };
}

function reset(): TransitionResult {
  return { next: { type: 'idle' } };
}

function appendCount(digits: string, nextDigit: string): string {
  return String(clampCount(Number.parseInt(`${digits}${nextDigit}`, 10)));
}

function parseCount(digits: string): number {
  return clampCount(Number.parseInt(digits, 10));
}

function clampCount(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(Math.floor(value), MAX_VIM_COUNT);
}

function isDigit(input: string): boolean {
  return input >= '0' && input <= '9';
}

function isNonZeroDigit(input: string): boolean {
  return input >= '1' && input <= '9';
}

function lineEndOffset(text: string, cursor: number): number {
  const end = text.indexOf('\n', cursor);
  return end === -1 ? text.length : end;
}

function firstNonBlankOffset(text: string, cursor: number): number {
  const start = text.lastIndexOf('\n', cursor - 1) + 1;
  const end = lineEndOffset(text, cursor);
  let offset = start;
  while (offset < end && (text[offset] === ' ' || text[offset] === '\t')) offset++;
  return offset < end ? offset : start;
}
