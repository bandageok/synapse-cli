// tests/vim.test.ts
// Vim mode: types and transition tests
import { describe, it, expect } from 'vitest';
import { createInitialVimState, createInitialPersistentState, OPERATORS, isOperatorKey } from '../src/vim/types.js';

describe('Vim types', () => {
  it('creates initial state with INSERT mode', () => {
    const state = createInitialVimState();
    expect(state.mode).toBe('INSERT');
    expect(state.insertedText).toBe('');
  });

  it('creates initial persistent state', () => {
    const ps = createInitialPersistentState();
    expect(ps.register).toBe('');
    expect(ps.registerIsLinewise).toBe(false);
    expect(ps.lastChange).toBeNull();
  });

  it('defines operator keys', () => {
    expect(OPERATORS.d).toBe('delete');
    expect(OPERATORS.c).toBe('change');
    expect(OPERATORS.y).toBe('yank');
    expect(OPERATORS).not.toHaveProperty('i');
  });

  it('detects operator keys', () => {
    expect(isOperatorKey('d')).toBe(true);
    expect(isOperatorKey('x')).toBe(false);
  });
});
