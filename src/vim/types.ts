/**
 * Vim Mode State Machine Types (Synapse MVP)
 *
 * Simplified from Claude Code's vim system.
 * Core: INSERT/NORMAL mode, basic motions, operators, dot-repeat.
 */

// ============================================================================
// Core Types
// ============================================================================

export type Operator = 'delete' | 'change' | 'yank';

// ============================================================================
// State Machine Types
// ============================================================================

export type VimState =
  | { mode: 'INSERT'; insertedText: string }
  | { mode: 'NORMAL'; command: CommandState };

export type CommandState =
  | { type: 'idle' }
  | { type: 'count'; digits: string }
  | { type: 'operator'; op: Operator; count: number }
  | { type: 'operatorCount'; op: Operator; count: number; digits: string };

export type PersistentState = {
  lastChange: RecordedChange | null;
  register: string;
  registerIsLinewise: boolean;
};

export type RecordedChange =
  | { type: 'insert'; text: string }
  | { type: 'operator'; op: Operator; motion: string; count: number }
  | { type: 'x'; count: number }
  | { type: 'openLine'; direction: 'above' | 'below' };

// ============================================================================
// Key Groups
// ============================================================================

export const OPERATORS = {
  d: 'delete',
  c: 'change',
  y: 'yank',
} as const satisfies Record<string, Operator>;

export function isOperatorKey(key: string): key is keyof typeof OPERATORS {
  return key in OPERATORS;
}

export const SIMPLE_MOTIONS = new Set([
  'h', 'l', 'j', 'k',
  'w', 'b', 'e',
  '0', '^', '$',
]);

export const MAX_VIM_COUNT = 10000;

// ============================================================================
// State Factories
// ============================================================================

export function createInitialVimState(): VimState {
  return { mode: 'INSERT', insertedText: '' };
}

export function createInitialPersistentState(): PersistentState {
  return {
    lastChange: null,
    register: '',
    registerIsLinewise: false,
  };
}
