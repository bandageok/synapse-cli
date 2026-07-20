/** State and command vocabulary for Synapse's prompt-line Vim mode. */

export type Operator = 'delete' | 'change' | 'yank';

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

export const OPERATORS = {
  d: 'delete',
  c: 'change',
  y: 'yank',
} as const satisfies Record<string, Operator>;

export function isOperatorKey(key: string): key is keyof typeof OPERATORS {
  return Object.prototype.hasOwnProperty.call(OPERATORS, key);
}

export const SIMPLE_MOTIONS = new Set([
  'h', 'l', 'j', 'k',
  'w', 'b', 'e',
  '0', '^', '$',
]);

export const MAX_VIM_COUNT = 10_000;

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
