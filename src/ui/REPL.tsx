// src/ui/REPL.tsx
// C.C.Claw REPL v5 -- Full-featured CLI (对标 Claude Code)
// Status bar + session title + context bar + markdown renderer + virtual scroll
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { render, Text, Box, useInput, useApp, useStdout } from 'ink';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createEngine } from '../core/Engine.js';
import { CommandRegistry } from '../commands/registry.js';
import {
  helpCommand, exitCommand, clearCommand, modelCommand,
  memoryCommand, soulCommand, doctorCommand, configCommand,
  sessionCommand, costCommand, compactCommand, initCommand,
  resumeCommand, historyCommand, soulEditCommand, vimCommand,
  diffCommand, undoCommand, contextCommand,
} from '../commands/builtin/index.js';
import { statusCommand } from '../commands/builtin/status.js';
import { skillsCommand } from '../commands/builtin/skills.js';
import { useVimInput } from '../vim/index.js';
import type { Message } from '../core/types.js';
import type { Provider } from '../providers/base.js';
import type { ToolRegistry } from '../core/ToolRegistry.js';
import type { ContextBuilder } from '../core/Context.js';
import type { Compressor } from '../core/Compressor.js';
import type { HookSystem } from '../core/HookSystem.js';
import type { ErrorRecovery } from '../core/ErrorRecovery.js';
import type { DynamicReminder } from '../soul/DynamicReminder.js';
import type { Heartbeat } from '../soul/Heartbeat.js';
import type { Dream } from '../soul/Dream.js';
import type { FakeExecutionWatchdog } from '../soul/FakeExecutionWatchdog.js';
import type { SelfImprovement } from '../soul/SelfImprovement.js';
import type { Logger } from '../core/Logger.js';
import type { SessionStore } from '../core/SessionStore.js';

const VERSION = '0.2.0';
const CONTEXT_WINDOW = 200_000;
const MAX_OUTPUT = 100;    // 虚拟滚动窗口上限（对标 Claude Code 视口裁剪）
const HIDDEN_COUNT = 50;   // 超出 MAX_OUTPUT 时显示提示
const SPINNER = ['\u280b','\u2819','\u2839','\u2838','\u283c','\u2834','\u2826','\u2827','\u2807','\u280f'];

interface REPLDeps {
  provider: Provider;
  tools: ToolRegistry;
  context: ContextBuilder;
  compressor: Compressor;
  hooks: HookSystem;
  errorRecovery: ErrorRecovery;
  dynamicReminder: DynamicReminder;
  heartbeat?: Heartbeat;
  dream?: Dream;
  watchdog?: FakeExecutionWatchdog;
  selfImprovement?: SelfImprovement;
  logger?: Logger;
  dataDir: string;
  sessionStore?: SessionStore;
}

interface DisplayMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function estTokens(msgs: Message[]): number {
  let t = 0;
  for (const m of msgs) {
    const s = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    t += s.length / 4;
  }
  return Math.round(t);
}

function getInitialModel(dataDir: string): string {
  try {
    const p = join(dataDir, '.cclaw.json');
    if (existsSync(p)) {
      const c = JSON.parse(readFileSync(p, 'utf-8'));
      if (c.model && c.model.trim()) return c.model.trim();
    }
  } catch {}
  return 'claude-sonnet-4-20250514';
}

// --- Components ---

function WelcomeBanner({ providerName, model }: { providerName: string; model: string }) {
  return React.createElement(Box, { flexDirection: 'column', marginBottom: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' }, ' C.C.Claw v' + VERSION),
    React.createElement(Text, { color: 'gray' }, '  ' + providerName + ' / ' + model),
  );
}

function StatusBar({ providerName, model, tokens, msgs, vimMode, sessionTitle }: {
  providerName: string; model: string; tokens: number; msgs: number;
  vimMode: boolean; sessionTitle?: string;
}) {
  const pct = Math.min(100, Math.round((tokens / CONTEXT_WINDOW) * 100));
  const filled = Math.round((pct / 100) * 20);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(20 - filled);
  const color = pct < 60 ? 'green' : pct < 85 ? 'yellow' : 'red';
  return React.createElement(Box, null,
    React.createElement(Text, { color: 'gray' },
      ' ' + providerName + ' ' + model
    ),
    sessionTitle ? React.createElement(Text, { color: 'gray', dimColor: true },
      ' -- ' + sessionTitle
    ) : null,
    React.createElement(Text, { color: 'gray' }, ' ' + msgs + ' msgs'),
    React.createElement(Text, { color }, ' | ' + bar + ' ' + pct + '%'),
    vimMode ? React.createElement(Text, { color: 'yellow', bold: true }, ' NORMAL') : null,
  );
}

function Divider() {
  return React.createElement(Text, { color: 'gray' },
    ' ' + '\u2500'.repeat(60)
  );
}

// Thinking spinner with elapsed time
function ThinkingSpinner({ label }: { label: string }) {
  const t0 = Date.now();
  const [tick, setTick] = useState(0);
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => (t + 1) % SPINNER.length);
      setElapsed(((Date.now() - t0) / 1000).toFixed(1) + 's');
    }, 80);
    return () => clearInterval(timer);
  }, []);
  return React.createElement(Box, null,
    React.createElement(Text, { color: 'cyan' }, ' ' + SPINNER[tick] + ' '),
    React.createElement(Text, { color: 'yellow' }, label || 'thinking'),
    React.createElement(Text, { color: 'gray', dimColor: true }, ' ' + elapsed),
  );
}

// Permission dialog
function PermissionDialog({ tool, input }: { tool: string; input: unknown }) {
  const inputStr = typeof input === 'string' ? input.slice(0, 100) : JSON.stringify(input).slice(0, 100);
  return React.createElement(Box, {
    flexDirection: 'column',
    paddingX: 1,
    borderStyle: 'single',
    borderColor: 'yellow',
  },
    React.createElement(Text, { bold: true, color: 'yellow' }, ' Permission: ' + tool),
    React.createElement(Text, { color: 'gray' }, '   ' + inputStr),
    React.createElement(Text, null, '   [A] allow   [D] deny'),
  );
}

function Footer({ vimMode }: { vimMode: boolean }) {
  return React.createElement(Text, { color: 'gray' },
    vimMode
      ? ' i:insert  esc:normal  h/j/k/l:move  ctrl+c:exit'
      : ' enter:send  ctrl+c:exit  ctrl+l:clear  ctrl+u:clear  /help:cmds'
  );
}

// --- Main REPL ---

export function launchREPL(deps: REPLDeps) {
  const { provider, tools, context, compressor, hooks, errorRecovery, dataDir, sessionStore, heartbeat, watchdog, selfImprovement, logger } = deps;
  const sessionId = 'session-' + Date.now();
  const initialModel = getInitialModel(dataDir);

  if (heartbeat) heartbeat.start();

  const registry = new CommandRegistry();
  for (const cmd of [
    helpCommand, exitCommand, clearCommand, modelCommand, memoryCommand,
    soulCommand, doctorCommand, configCommand, sessionCommand, costCommand,
    compactCommand, initCommand, resumeCommand, historyCommand, soulEditCommand,
    vimCommand, diffCommand, undoCommand, contextCommand,
    statusCommand, skillsCommand,
  ]) {
    registry.register(cmd);
  }

  function REPL() {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [displayMessages, setDisplayMessages] = useState<DisplayMsg[]>([]);
    const [isThinking, setIsThinking] = useState(false);
    const [thinkingLabel, setThinkingLabel] = useState('');
    const [model, setModelState] = useState(initialModel);
    const [showWelcome, setShowWelcome] = useState(true);
    const [pendingPermission, setPendingPermission] = useState<
      { tool: string; input: unknown; toolUseId: string; resolve: (v: boolean) => void } | null
    >(null);
    const allMessagesRef = useRef<Message[]>([]);
    const sessionTitleRef = useRef<string>('');
    const { exit } = useApp();
    const vim = useVimInput(input, setInput);
    useStdout();

    const addDisplay = useCallback((msg: DisplayMsg) => {
      setDisplayMessages(prev => [...prev.slice(-MAX_OUTPUT), msg]);
    }, []);

    const runEngine = useCallback(async (allMessages: Message[]) => {
      let responseText = '';

      try {
        const engineOptions: Record<string, unknown> = {
          onPermissionAsk: (tool: string, input: unknown, toolUseId: string) =>
            new Promise<boolean>(resolve => {
              setPendingPermission({ tool, input, toolUseId, resolve });
            }),
        };
        if (watchdog) engineOptions.watchdog = watchdog;
        if (selfImprovement) engineOptions.selfImprovement = selfImprovement;
        if (logger) engineOptions.logger = logger;

        for await (const event of createEngine(
          allMessages, provider, tools, context, hooks, compressor, errorRecovery,
          engineOptions,
        )) {
          switch (event.type) {
            case 'token':
              responseText += event.text;
              setDisplayMessages(prev => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'assistant') {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...last, content: responseText };
                  return updated;
                }
                return [...prev, { id: 'msg-' + Date.now(), role: 'assistant', content: responseText }];
              });
              break;

            case 'tool_use':
              setThinkingLabel(event.tool);
              addDisplay({
                id: 'tool-' + Date.now(),
                role: 'assistant',
                content: '  [' + event.tool + '] calling...',
              });
              break;

            case 'tool_result':
              const isError = typeof event.output === 'string' && event.output.startsWith('Error:');
              addDisplay({
                id: 'result-' + Date.now(),
                role: 'assistant',
                content: isError
                  ? '  X ' + event.tool + ' failed: ' + event.output.slice(0, 150)
                  : '  [ok] ' + event.tool + ' -- ' + event.output.slice(0, 120),
              });
              setThinkingLabel('');
              break;

            case 'compressed':
              addDisplay({
                id: 'comp-' + Date.now(),
                role: 'assistant',
                content: '  [compress] ' + event.tokensBefore + ' -> ' + event.tokensAfter + ' tokens',
              });
              break;

            case 'end_turn':
              setIsThinking(false);
              setThinkingLabel('');
              if (sessionStore) {
                const turns = allMessagesRef.current.filter(m => m.role === 'user').length;
                sessionStore.save(sessionId, allMessagesRef.current, {
                  id: sessionId, model,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  tokenUsage: 0, turnCount: turns,
                }).catch(() => {});
              }
              break;

            case 'error':
              addDisplay({ id: 'err-' + Date.now(), role: 'assistant', content: 'X ' + event.error });
              setIsThinking(false);
              setThinkingLabel('');
              break;
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addDisplay({ id: 'err-' + Date.now(), role: 'assistant', content: 'X ' + msg });
        setIsThinking(false);
        setThinkingLabel('');
      }
    }, [addDisplay]);

    useInput(async (char, key) => {
      if (pendingPermission) {
        if (char === 'a' || char === 'A') {
          pendingPermission.resolve(true);
          addDisplay({ id: 'perm-ok', role: 'assistant', content: '  [allowed] ' + pendingPermission.tool });
          setPendingPermission(null);
          return;
        }
        if (char === 'd' || char === 'D') {
          pendingPermission.resolve(false);
          addDisplay({ id: 'perm-deny', role: 'assistant', content: '  [denied] ' + pendingPermission.tool });
          setPendingPermission(null);
          return;
        }
        return;
      }

      if (isThinking) return;
      if (vim.handleKey(char, key).handled) return;
      if (key.ctrl && char === 'l') { setDisplayMessages([]); setShowWelcome(true); return; }
      if (key.ctrl && char === 'u') { setInput(''); return; }
      if (key.ctrl && char === 'w') {
        setInput(prev => { const t = prev.trimEnd(); const i = t.lastIndexOf(' '); return i === -1 ? '' : t.slice(0, i + 1); });
        return;
      }

      if (key.return) {
        const trimmed = input.trim();
        if (!trimmed) return;
        setInput('');

        if (trimmed.startsWith('/')) {
          setShowWelcome(false);
          const commandDeps = {
            dataDir, model,
            setModel: (m: string) => setModelState(m),
            clearOutput: () => { setDisplayMessages([]); setShowWelcome(true); },
            addOutput: (line: string) => addDisplay({ id: 'cmd-' + Date.now(), role: 'assistant', content: line }),
            messages: allMessagesRef.current,
            resetMessages: () => { allMessagesRef.current = []; setMessages([]); setDisplayMessages([]); setShowWelcome(true); },
            setMessages: (msgs: Message[]) => { allMessagesRef.current = msgs; setMessages(msgs); },
            turnCount: messages.filter(m => m.role === 'user').length,
          };
          const result = await registry.execute(trimmed, commandDeps);
          if (result.output) {
            for (const line of result.output.split('\n')) {
              addDisplay({ id: 'cmd-' + Date.now() + '-' + line.slice(0, 20), role: 'assistant', content: line });
            }
          }
          return;
        }

        setShowWelcome(false);
        // Auto-generate session title from first user message
        if (!sessionTitleRef.current) {
          const title = trimmed.length > 50 ? trimmed.slice(0, 50) + '...' : trimmed;
          sessionTitleRef.current = title;
        }
        addDisplay({ id: 'user-' + Date.now(), role: 'user', content: '> ' + trimmed });
        const userMsg: Message = { role: 'user', content: trimmed };
        setMessages(prev => {
          const all = [...prev, userMsg];
          allMessagesRef.current = all;
          runEngine(all);
          return all;
        });
        setIsThinking(true);
        setThinkingLabel('');
      } else if (key.backspace || key.delete) {
        setInput(prev => prev.slice(0, -1));
      } else if (key.ctrl && char === 'c') {
        exit();
      } else if (!key.ctrl && !key.meta && char) {
        setInput(prev => prev + char);
      }
    });

    const tokens = estTokens(allMessagesRef.current);
    const msgCount = allMessagesRef.current.length;

    return React.createElement(Box, { flexDirection: 'column', height: '100%' },
      // Welcome banner (shown once)
      showWelcome && React.createElement(WelcomeBanner, { providerName: provider.name, model }),

      // Status bar with session title and context progress
      React.createElement(StatusBar, {
        providerName: provider.name,
        model,
        tokens,
        msgs: msgCount,
        vimMode: vim.enabled,
        sessionTitle: sessionTitleRef.current,
      }),

      // Divider
      React.createElement(Divider),

      // Messages
      ...displayMessages.slice(-MAX_OUTPUT).map((msg) => {
        if (msg.role === 'user') {
          return React.createElement(Text, { key: msg.id }, msg.content);
        }
        // Assistant messages: check for special prefixes
        if (msg.content.startsWith('  [')) {
          return React.createElement(Text, { key: msg.id, color: 'yellow' }, msg.content);
        }
        if (msg.content.startsWith('  [ok]')) {
          return React.createElement(Text, { key: msg.id, color: 'green' }, msg.content);
        }
        if (msg.content.startsWith('  X ')) {
          return React.createElement(Text, { key: msg.id, color: 'red' }, msg.content);
        }
        if (msg.content.startsWith('  [compress]')) {
          return React.createElement(Text, { key: msg.id, color: 'blue' }, msg.content);
        }
        if (msg.content.startsWith('  [allowed]')) {
          return React.createElement(Text, { key: msg.id, color: 'green' }, msg.content);
        }
        if (msg.content.startsWith('  [denied]')) {
          return React.createElement(Text, { key: msg.id, color: 'red' }, msg.content);
        }
        return React.createElement(Text, { key: msg.id, color: 'white' }, msg.content);
      }),

      // Permission overlay
      pendingPermission && React.createElement(PermissionDialog, {
        tool: pendingPermission.tool,
        input: pendingPermission.input,
      }),

      // Thinking spinner
      isThinking && React.createElement(ThinkingSpinner, { label: thinkingLabel }),

      // Spacer (pushes input to bottom)
      React.createElement(Box, { flexGrow: 1 }),

      // Input prompt
      React.createElement(Box, null,
        React.createElement(Text, {
          color: vim.enabled && vim.isNormalMode ? 'yellow' : 'green',
          bold: true,
        }, vim.enabled && vim.isNormalMode ? 'N ' : '> '),
        React.createElement(Text, null, input),
        React.createElement(Text, { color: 'gray' }, '\u2588'),
      ),

      // Footer shortcuts
      React.createElement(Footer, { vimMode: vim.enabled }),
    );
  }

  const { waitUntilExit } = render(React.createElement(REPL));
  return waitUntilExit();
}
