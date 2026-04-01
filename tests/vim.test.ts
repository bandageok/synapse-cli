/**
 * Vim Mode Tests
 *
 * Tests the state machine transitions and basic operations.
 */

import { describe, it, expect } from 'vitest';
import { transition } from '../src/vim/transitions.js';
import { resolveMotion } from '../src/vim/motions.js';
import { executeX, executeOperatorMotion, executeLineOp } from '../src/vim/operators.js';
import { createInitialVimState, createInitialPersistentState } from '../src/vim/types.js';
import type { CommandState, RecordedChange } from '../src/vim/types.js';

function makeCtx(text: string, cursor: number = 0) {
  let currentText = text;
  let currentCursor = cursor;
  let register = '';
  let registerLinewise = false;
  let lastChange: RecordedChange | null = null;
  let mode: 'NORMAL' | 'INSERT' = 'NORMAL';

  return {
    get text() { return currentText; },
    setText: (t: string) => { currentText = t; },
    get cursor() { return currentCursor; },
    setCursor: (o: number) => { currentCursor = o; },
    enterInsert: (_o: number) => { mode = 'INSERT'; },
    getRegister: () => register,
    setRegister: (c: string, l: boolean) => { register = c; registerLinewise = l; },
    recordChange: (c: RecordedChange) => { lastChange = c; },
    onUndo: () => {},
    onDotRepeat: () => {},
    // Test helpers
    get _text() { return currentText; },
    get _cursor() { return currentCursor; },
    get _register() { return register; },
    get _registerLinewise() { return registerLinewise; },
    get _lastChange() { return lastChange; },
    get _mode() { return mode; },
  };
}

describe('Vim State Machine', () => {
  describe('Mode transitions', () => {
    it('starts in INSERT mode', () => {
      const state = createInitialVimState();
      expect(state.mode).toBe('INSERT');
    });

    it('INSERT + Escape → NORMAL idle', () => {
      const state: CommandState = { type: 'idle' };
      expect(state.type).toBe('idle');
    });
  });

  describe('Motions', () => {
    it('h moves left', () => {
      expect(resolveMotion('h', 5, 'hello world', 1)).toBe(4);
    });

    it('h at start stays at 0', () => {
      expect(resolveMotion('h', 0, 'hello', 1)).toBe(0);
    });

    it('l moves right', () => {
      expect(resolveMotion('l', 0, 'hello', 1)).toBe(1);
    });

    it('l at end stays', () => {
      expect(resolveMotion('l', 5, 'hello', 1)).toBe(5);
    });

    it('w moves to next word', () => {
      expect(resolveMotion('w', 0, 'hello world', 1)).toBe(6);
    });

    it('b moves to previous word', () => {
      expect(resolveMotion('b', 6, 'hello world', 1)).toBe(0);
    });

    it('e moves to end of word', () => {
      expect(resolveMotion('e', 0, 'hello world', 1)).toBe(4);
    });

    it('0 moves to start of line', () => {
      expect(resolveMotion('0', 5, 'hello\nworld', 1)).toBe(0);
    });

    it('$ moves to end of line', () => {
      expect(resolveMotion('$', 0, 'hello\nworld', 1)).toBe(5);
    });

    it('count + motion: 3l', () => {
      expect(resolveMotion('l', 0, 'hello', 3)).toBe(3);
    });

    it('j moves down', () => {
      const text = 'hello\nworld';
      const result = resolveMotion('j', 2, text, 1);
      expect(result).toBe(8); // 'wo|' at position 2 of 'world'
    });

    it('k moves up', () => {
      const text = 'hello\nworld';
      const result = resolveMotion('k', 7, text, 1);
      expect(result).toBe(1); // column 1 of 'hello' (offset 7 = 'o' = col 1 of 'world')
    });
  });

  describe('State transitions', () => {
    it('idle + digit → count state', () => {
      const ctx = makeCtx('hello');
      const result = transition({ type: 'idle' }, '3', ctx);
      expect(result.next).toEqual({ type: 'count', digits: '3' });
    });

    it('idle + d → operator state', () => {
      const ctx = makeCtx('hello');
      const result = transition({ type: 'idle' }, 'd', ctx);
      expect(result.next).toEqual({ type: 'operator', op: 'delete', count: 1 });
    });

    it('idle + h → cursor moves left', () => {
      const ctx = makeCtx('hello', 3);
      const result = transition({ type: 'idle' }, 'h', ctx);
      result.execute?.();
      expect(ctx._cursor).toBe(2);
    });

    it('idle + x → delete char', () => {
      const ctx = makeCtx('hello', 0);
      const result = transition({ type: 'idle' }, 'x', ctx);
      result.execute?.();
      expect(ctx._text).toBe('ello');
    });

    it('operator + same key → line op (dd)', () => {
      const ctx = makeCtx('hello\nworld', 0);
      const result = transition(
        { type: 'operator', op: 'delete', count: 1 },
        'd',
        ctx,
      );
      result.execute?.();
      expect(ctx._text).toBe('world');
    });

    it('operator + motion → executeOperatorMotion (dw)', () => {
      const ctx = makeCtx('hello world', 0);
      const result = transition(
        { type: 'operator', op: 'delete', count: 1 },
        'w',
        ctx,
      );
      result.execute?.();
      expect(ctx._text).toBe('world');
    });

    it('idle + i → enter insert', () => {
      const ctx = makeCtx('hello', 0);
      const result = transition({ type: 'idle' }, 'i', ctx);
      result.execute?.();
      expect(ctx._mode).toBe('INSERT');
    });

    it('idle + o → open line below', () => {
      const ctx = makeCtx('hello', 0);
      const result = transition({ type: 'idle' }, 'o', ctx);
      result.execute?.();
      expect(ctx._text).toBe('hello\n');
      expect(ctx._mode).toBe('INSERT');
    });
  });

  describe('Operators', () => {
    it('delete word (dw)', () => {
      const ctx = makeCtx('hello world', 0);
      executeOperatorMotion('delete', 'w', 1, ctx);
      expect(ctx._text).toBe('world');
    });

    it('delete line (dd)', () => {
      const ctx = makeCtx('hello\nworld', 0);
      executeLineOp('delete', 1, ctx);
      expect(ctx._text).toBe('world');
    });

    it('delete char (x)', () => {
      const ctx = makeCtx('hello', 0);
      executeX(1, ctx);
      expect(ctx._text).toBe('ello');
    });

    it('yank word (yw)', () => {
      const ctx = makeCtx('hello world', 0);
      executeOperatorMotion('yank', 'w', 1, ctx);
      expect(ctx._register).toBe('hello ');
      expect(ctx._text).toBe('hello world'); // text unchanged
    });

    it('change word (cw)', () => {
      const ctx = makeCtx('hello world', 0);
      executeOperatorMotion('change', 'w', 1, ctx);
      expect(ctx._text).toBe('world');
      expect(ctx._mode).toBe('INSERT');
    });
  });

  describe('Count prefix', () => {
    it('3x deletes 3 chars', () => {
      const ctx = makeCtx('hello', 0);
      executeX(3, ctx);
      expect(ctx._text).toBe('lo');
    });

    it('2dw deletes 2 words', () => {
      const ctx = makeCtx('one two three', 0);
      executeOperatorMotion('delete', 'w', 2, ctx);
      expect(ctx._text).toBe('three');
    });
  });
});
