/**
 * Vim State Transition Table (Synapse MVP)
 *
 * Simplified from Claude Code's transitions.ts.
 * Handles: idle, count, operator, operatorCount states.
 */

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

export function transition(
  state: CommandState,
  input: string,
  ctx: TransitionContext,
): TransitionResult {
  switch (state.type) {
    case 'idle':
      return fromIdle(input, ctx);
    case 'count':
      return fromCount(state, input, ctx);
    case 'operator':
      return fromOperator(state, input, ctx);
    case 'operatorCount':
      return fromOperatorCount(state, input, ctx);
  }
}

// ============================================================================
// Shared Input Handling
// ============================================================================

function handleNormalInput(
  input: string,
  count: number,
  ctx: TransitionContext,
): TransitionResult | null {
  if (isOperatorKey(input)) {
    return { next: { type: 'operator', op: OPERATORS[input], count } };
  }

  if (SIMPLE_MOTIONS.has(input)) {
    return {
      execute: () => {
        const target = resolveMotion(input, ctx.cursor, ctx.text, count);
        ctx.setCursor(target);
      },
    };
  }

  if (input === 'x') {
    return { execute: () => executeX(count, ctx) };
  }

  if (input === 'u') {
    return { execute: () => ctx.onUndo?.() };
  }

  if (input === 'i') {
    return { execute: () => ctx.enterInsert(ctx.cursor) };
  }

  if (input === 'a') {
    return {
      execute: () => {
        const newOffset = ctx.cursor < ctx.text.length ? ctx.cursor + 1 : ctx.cursor;
        ctx.enterInsert(newOffset);
      },
    };
  }

  if (input === 'I') {
    return {
      execute: () => {
        const sol = ctx.text.lastIndexOf('\n', ctx.cursor - 1) + 1;
        const eol = ctx.text.indexOf('\n', ctx.cursor);
        const lineEnd = eol === -1 ? ctx.text.length : eol;
        let i = sol;
        while (i < lineEnd && (ctx.text[i] === ' ' || ctx.text[i] === '\t')) i++;
        ctx.enterInsert(i < lineEnd ? i : sol);
      },
    };
  }

  if (input === 'A') {
    return {
      execute: () => {
        const eol = ctx.text.indexOf('\n', ctx.cursor);
        ctx.enterInsert(eol === -1 ? ctx.text.length : eol);
      },
    };
  }

  if (input === 'o') {
    return { execute: () => executeOpenLine('below', ctx) };
  }

  if (input === 'O') {
    return { execute: () => executeOpenLine('above', ctx) };
  }

  if (input === '.') {
    return { execute: () => ctx.onDotRepeat?.() };
  }

  return null;
}

function handleOperatorInput(
  op: Operator,
  count: number,
  input: string,
  ctx: TransitionContext,
): TransitionResult | null {
  if (SIMPLE_MOTIONS.has(input)) {
    return { execute: () => executeOperatorMotion(op, input, count, ctx) };
  }
  return null;
}

// ============================================================================
// Transition Functions
// ============================================================================

function fromIdle(input: string, ctx: TransitionContext): TransitionResult {
  if (/[1-9]/.test(input)) {
    return { next: { type: 'count', digits: input } };
  }
  if (input === '0') {
    return {
      execute: () => {
        const prevNewline = ctx.text.lastIndexOf('\n', ctx.cursor - 1);
        ctx.setCursor(prevNewline === -1 ? 0 : prevNewline + 1);
      },
    };
  }

  const result = handleNormalInput(input, 1, ctx);
  if (result) return result;
  return {};
}

function fromCount(
  state: { type: 'count'; digits: string },
  input: string,
  ctx: TransitionContext,
): TransitionResult {
  if (/[0-9]/.test(input)) {
    const newDigits = state.digits + input;
    const count = Math.min(parseInt(newDigits, 10), MAX_VIM_COUNT);
    return { next: { type: 'count', digits: String(count) } };
  }

  const count = parseInt(state.digits, 10);
  const result = handleNormalInput(input, count, ctx);
  if (result) return result;
  return { next: { type: 'idle' } };
}

function fromOperator(
  state: { type: 'operator'; op: Operator; count: number },
  input: string,
  ctx: TransitionContext,
): TransitionResult {
  // dd, cc, yy = line operation
  if (input === state.op[0]) {
    return { execute: () => executeLineOp(state.op, state.count, ctx) };
  }

  if (/[0-9]/.test(input)) {
    return {
      next: {
        type: 'operatorCount',
        op: state.op,
        count: state.count,
        digits: input,
      },
    };
  }

  const result = handleOperatorInput(state.op, state.count, input, ctx);
  if (result) return result;
  return { next: { type: 'idle' } };
}

function fromOperatorCount(
  state: { type: 'operatorCount'; op: Operator; count: number; digits: string },
  input: string,
  ctx: TransitionContext,
): TransitionResult {
  if (/[0-9]/.test(input)) {
    const newDigits = state.digits + input;
    const parsedDigits = Math.min(parseInt(newDigits, 10), MAX_VIM_COUNT);
    return { next: { ...state, digits: String(parsedDigits) } };
  }

  const motionCount = parseInt(state.digits, 10);
  const effectiveCount = state.count * motionCount;
  const result = handleOperatorInput(state.op, effectiveCount, input, ctx);
  if (result) return result;
  return { next: { type: 'idle' } };
}
