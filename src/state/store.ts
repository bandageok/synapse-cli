// src/state/store.ts
import { create } from 'zustand';
import type { Message } from '../core/types.js';

export interface AppState {
  sessionId: string;
  messages: Message[];
  isThinking: boolean;
  model: string;
  output: string[];
  turnCount: number;

  addOutput: (line: string) => void;
  clearOutput: () => void;
  setThinking: (v: boolean) => void;
  setModel: (model: string) => void;
  addMessage: (msg: Message) => void;
  incrementTurn: () => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  sessionId: `session-${Date.now()}`,
  messages: [],
  isThinking: false,
  model: 'xiaomi/mimo-v2-pro',
  output: [],
  turnCount: 0,

  addOutput: (line) => set((s) => ({ output: [...s.output.slice(-50), line] })),
  clearOutput: () => set({ output: [] }),
  setThinking: (v) => set({ isThinking: v }),
  setModel: (model) => set({ model }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  incrementTurn: () => set((s) => ({ turnCount: s.turnCount + 1 })),
  reset: () => set({ messages: [], turnCount: 0, output: [] }),
}));
