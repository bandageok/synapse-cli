/**
 * Vim Mode for C.C.Claw REPL
 *
 * Exports useVimInput hook that wraps the vim state machine
 * for use with Ink's useInput.
 */

import { useState, useCallback, useRef } from 'react';
import type { VimState, PersistentState, RecordedChange } from './types.js';
import { createInitialVimState, createInitialPersistentState } from './types.js';
import { transition } from './transitions.js';

export interface VimResult {
  vimState: VimState;
  handleKey: (char: string, key: any) => { handled: boolean };
  isNormalMode: boolean;
  toggleVim: () => void;
  enabled: boolean;
}

export function useVimInput(
  input: string,
  setInput: (v: string) => void,
): VimResult {
  const [enabled, setEnabled] = useState(false);
  const [vimState, setVimState] = useState<VimState>(createInitialVimState());
  const persistentRef = useRef<PersistentState>(createInitialPersistentState());
  const lastChangeRef = useRef<RecordedChange | null>(null);
  const cursorRef = useRef(0);

  const toggleVim = useCallback(() => {
    setEnabled(prev => !prev);
    setVimState(createInitialVimState());
  }, []);

  const handleKey = useCallback(
    (char: string, key: any) => {
      if (!enabled) return { handled: false };

      // INSERT mode
      if (vimState.mode === 'INSERT') {
        if (key.escape) {
          // Save inserted text for dot repeat
          if (vimState.insertedText) {
            lastChangeRef.current = { type: 'insert', text: vimState.insertedText };
          }
          setVimState({ mode: 'NORMAL', command: { type: 'idle' } });
          return { handled: true };
        }
        // Track inserted text for dot-repeat
        if (!key.ctrl && !key.meta && char && !key.return && !key.backspace) {
          setVimState(prev =>
            prev.mode === 'INSERT'
              ? { ...prev, insertedText: prev.insertedText + char }
              : prev,
          );
        } else if (key.backspace) {
          setVimState(prev =>
            prev.mode === 'INSERT'
              ? { ...prev, insertedText: prev.insertedText.slice(0, -1) }
              : prev,
          );
        }
        // Let normal input handling work in insert mode
        return { handled: false };
      }

      // NORMAL mode
      if (key.return || key.backspace || key.delete || key.tab) return { handled: false };
      if (key.ctrl || key.meta) return { handled: false };
      if (!char || char.length !== 1) return { handled: false };

      cursorRef.current = input.length; // Simplified: cursor at end

      const ctx = {
        text: input,
        setText: setInput,
        cursor: cursorRef.current,
        setCursor: (offset: number) => {
          cursorRef.current = offset;
        },
        enterInsert: (_offset: number) => {
          setVimState({ mode: 'INSERT', insertedText: '' });
        },
        getRegister: () => persistentRef.current.register,
        setRegister: (content: string, linewise: boolean) => {
          persistentRef.current.register = content;
          persistentRef.current.registerIsLinewise = linewise;
        },
        recordChange: (change: RecordedChange) => {
          persistentRef.current.lastChange = change;
          lastChangeRef.current = change;
        },
        onUndo: () => {
          // Simple undo: not fully implemented for MVP
          // Could integrate with a history stack
        },
        onDotRepeat: () => {
          const last = lastChangeRef.current;
          if (!last) return;
          if (last.type === 'insert' && last.text) {
            setInput(input + last.text);
          } else if (last.type === 'x') {
            const pos = cursorRef.current;
            if (pos < input.length) {
              setInput(input.slice(0, pos) + input.slice(pos + last.count));
            }
          }
        },
      };

      const result = transition(vimState.command, char, ctx);

      if (result.execute) {
        result.execute();
      }

      if (result.next) {
        setVimState({ mode: 'NORMAL', command: result.next });
      } else if (!result.execute) {
        // Unrecognized input in normal mode — reset to idle
        setVimState({ mode: 'NORMAL', command: { type: 'idle' } });
      }

      return { handled: true };
    },
    [enabled, vimState, input, setInput],
  );

  return {
    vimState,
    handleKey,
    isNormalMode: enabled && vimState.mode === 'NORMAL',
    toggleVim,
    enabled,
  };
}
