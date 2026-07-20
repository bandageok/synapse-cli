import { describe, it, expect } from 'vitest';
import {
  createInitialPersistentState,
  createInitialVimState,
  isOperatorKey,
  MAX_VIM_COUNT,
  OPERATORS,
  type RecordedChange,
} from '../src/vim/types.js';
import { transition, type TransitionContext } from '../src/vim/transitions.js';

describe('Vim state model', () => {
  it('starts in insert mode with an empty insert buffer', () => {
    expect(createInitialVimState()).toEqual({ mode: 'INSERT', insertedText: '' });
  });

  it('creates isolated persistent state', () => {
    const first = createInitialPersistentState();
    const second = createInitialPersistentState();
    first.register = 'changed';
    expect(second).toEqual({ lastChange: null, register: '', registerIsLinewise: false });
  });

  it('recognizes only own operator keys', () => {
    expect(OPERATORS).toEqual({ d: 'delete', c: 'change', y: 'yank' });
    expect(isOperatorKey('d')).toBe(true);
    expect(isOperatorKey('toString')).toBe(false);
  });
});

describe('Vim command transitions', () => {
  it('collects and clamps a normal-mode count', () => {
    const { ctx } = createContext('abcdef', 0);
    const start = transition({ type: 'idle' }, '9', ctx);
    expect(start.next).toEqual({ type: 'count', digits: '9' });
    const clamped = transition({ type: 'count', digits: '9999' }, '9', ctx);
    expect(clamped.next).toEqual({ type: 'count', digits: String(MAX_VIM_COUNT) });
  });

  it('moves the cursor and explicitly returns to idle', () => {
    const state = createContext('alpha beta', 0);
    const result = transition({ type: 'count', digits: '2' }, 'l', state.ctx);
    result.execute?.();
    expect(state.cursor()).toBe(2);
    expect(result.next).toEqual({ type: 'idle' });
  });

  it('treats zero after an operator as a motion, not a count', () => {
    const state = createContext('abc\ndef', 6);
    const result = transition({ type: 'operator', op: 'delete', count: 1 }, '0', state.ctx);
    result.execute?.();
    expect(state.text()).toBe('abc\nf');
    expect(result.next).toEqual({ type: 'idle' });
  });

  it('executes repeated operators linewise and resets', () => {
    const state = createContext('one\ntwo\nthree', 4);
    const result = transition({ type: 'operator', op: 'delete', count: 1 }, 'd', state.ctx);
    result.execute?.();
    expect(state.text()).toBe('one\nthree');
    expect(state.register()).toBe('two\n');
    expect(result.next).toEqual({ type: 'idle' });
  });

  it('keeps change commands in insert mode instead of overwriting the mode change', () => {
    const state = createContext('one\ntwo', 0);
    const result = transition({ type: 'operator', op: 'change', count: 1 }, 'c', state.ctx);
    result.execute?.();
    expect(state.insertOffset()).toBe(0);
    expect(result.next).toBeUndefined();
  });

  it('multiplies operator counts and caps the effective count', () => {
    const state = createContext('abcdef', 0);
    const result = transition(
      { type: 'operatorCount', op: 'delete', count: MAX_VIM_COUNT, digits: '9' },
      'l',
      state.ctx,
    );
    result.execute?.();
    expect(state.text()).toBe('');
    expect(state.changes()[0]).toMatchObject({ count: MAX_VIM_COUNT });
  });

  it('resets an invalid partial command', () => {
    const { ctx } = createContext('abc', 0);
    expect(transition({ type: 'operator', op: 'delete', count: 1 }, '?', ctx).next)
      .toEqual({ type: 'idle' });
  });

  it('enters insert mode at the first non-blank position', () => {
    const state = createContext('  value', 5);
    const result = transition({ type: 'idle' }, 'I', state.ctx);
    result.execute?.();
    expect(state.insertOffset()).toBe(2);
    expect(result.next).toBeUndefined();
  });
});

function createContext(initialText: string, initialCursor: number): {
  ctx: TransitionContext;
  text: () => string;
  cursor: () => number;
  register: () => string;
  changes: () => RecordedChange[];
  insertOffset: () => number | null;
} {
  let text = initialText;
  let cursor = initialCursor;
  let register = '';
  let insertOffset: number | null = null;
  const changes: RecordedChange[] = [];

  const ctx: TransitionContext = {
    text,
    cursor,
    setText: value => {
      text = value;
      ctx.text = value;
    },
    setCursor: value => {
      cursor = value;
      ctx.cursor = value;
    },
    enterInsert: value => {
      insertOffset = value;
    },
    getRegister: () => register,
    setRegister: value => {
      register = value;
    },
    recordChange: change => {
      changes.push(change);
    },
  };

  return {
    ctx,
    text: () => text,
    cursor: () => cursor,
    register: () => register,
    changes: () => changes,
    insertOffset: () => insertOffset,
  };
}
