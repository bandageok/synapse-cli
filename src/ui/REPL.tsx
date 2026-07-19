// src/ui/REPL.tsx
// Synapse REPL v6 -- Complete: virtual scroll + tool detail + skills auto-load + message timeline
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
import { SkillAutoLoader } from '../skills/AutoLoader.js';

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

// ============================================================
// Constants
// ============================================================
const VERSION = '0.2.0';
const CONTEXT_WINDOW = 200_000;
const SCROLL_MARGIN = 5;
const SPINNER = ['\u280B','\u2819','\u2839','\u2838','\u283C','\u2834','\u2826','\u2827','\u2807','\u280F'];
const BADGE: Record<string, string> = {
  anthropic: '\u25C6',
  openrouter: '\u25C7',
  minimax: '\u25B2',
};

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
  skillLoader?: SkillAutoLoader;
  initialMessages?: Message[];
  initialSessionId?: string;
}

interface DisplayMsg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolName?: string;
  toolOutput?: string;
  toolError?: boolean;
  collapsed?: boolean;
  timestamp: number;
}

// ============================================================
// Utilities
// ============================================================
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
    const p = join(dataDir, '.synapse.json');
    if (existsSync(p)) {
      const c = JSON.parse(readFileSync(p, 'utf-8'));
      if (c.model && c.model.trim()) return c.model.trim();
    }
  } catch {}
  return 'claude-sonnet-4-20250514';
}

// ============================================================
// UI Components
// ============================================================

function WelcomeBanner({ providerName, model }: { providerName: string; model: string }) {
  return React.createElement(Box, { flexDirection: 'column' as const, marginBottom: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' as const }, '  Synapse v' + VERSION),
    React.createElement(Text, { color: 'gray' as const }, '  ' + (BADGE[providerName] || '\u25CF') + ' ' + providerName + ' / ' + model),
    React.createElement(Text, { color: 'gray' as const, dimColor: true }, '  /help: commands'),
  );
}

function StatusBar({ providerName, model, tokens, msgs, vimMode, sessionTitle, activeSkills, turnCount }: {
  providerName: string; model: string; tokens: number; msgs: number;
  vimMode: boolean; sessionTitle?: string; activeSkills: string[]; turnCount: number;
}) {
  const pct = Math.min(100, Math.round((tokens / CONTEXT_WINDOW) * 100));
  const filled = Math.round((pct / 100) * 20);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(20 - filled);
  const color = pct < 60 ? 'green' as const : pct < 85 ? 'yellow' as const : 'red' as const;
  const skillBadge = activeSkills.length > 0 ? ' | \u{1F9E9} ' + activeSkills.length : '';
  return React.createElement(Box, null,
    React.createElement(Text, { color: 'gray' as const },
      ' ' + providerName + ' ' + model
    ),
    sessionTitle ? React.createElement(Text, { color: 'gray' as const, dimColor: true },
      ' \u2014 ' + sessionTitle
    ) : null,
    React.createElement(Text, { color: 'gray' as const },
      ' \u00B7 ' + msgs + ' msgs \u00B7 turn ' + turnCount + skillBadge
    ),
    React.createElement(Text, { color },
      ' | ' + bar + ' ' + pct + '%'
    ),
    vimMode ? React.createElement(Text, { color: 'yellow' as const, bold: true }, ' NORMAL') : null,
  );
}

function Divider() {
  return React.createElement(Text, { color: 'gray' as const, dimColor: true },
    ' ' + '\u2500'.repeat(60)
  );
}

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
    React.createElement(Text, { color: 'cyan' as const }, ' ' + SPINNER[tick] + ' '),
    React.createElement(Text, { color: 'yellow' as const }, label || 'thinking'),
    React.createElement(Text, { color: 'gray' as const, dimColor: true }, ' ' + elapsed),
  );
}

function PermissionDialog({ tool, input }: { tool: string; input: unknown }) {
  const inputStr = typeof input === 'string' ? input.slice(0, 100) : JSON.stringify(input).slice(0, 100);
  return React.createElement(Box, {
    flexDirection: 'column' as const,
    paddingX: 1,
    borderStyle: 'single' as const,
    borderColor: 'yellow' as const,
  },
    React.createElement(Text, { bold: true, color: 'yellow' as const }, ' \u26A0 Permission: ' + tool),
    React.createElement(Text, { color: 'gray' as const }, '   ' + inputStr),
    React.createElement(Text, null, '   [A] allow   [D] deny'),
  );
}

function Footer({ vimMode, scrollPos, maxScroll }: { vimMode: boolean; scrollPos: number; maxScroll: number }) {
  const scrollInfo = maxScroll > 0 ? ' PgUp/Dn:scroll ' + (scrollPos + 1) + '/' + (maxScroll + 1) : ' ';
  return React.createElement(Text, { color: 'gray' as const, dimColor: true },
    vimMode
      ? ' i:insert  esc:normal  h/j/k/l:move PgUp/Dn:scroll ctrl+c:exit'
      : ' Enter:send  Ctrl+C:exit  Ctrl+L:clear  Ctrl+U:clear  PgUp/Dn:scroll  /help:cmds'
  );
}

// ============================================================
// Main REPL v6
// ============================================================

export function launchREPL(deps: REPLDeps) {
  const {
    provider, tools, context, compressor, hooks, errorRecovery, dataDir,
    sessionStore, heartbeat, watchdog, selfImprovement, logger,
    skillLoader: skillLoaderFromDeps, initialMessages, initialSessionId,
  } = deps;
  const sessionId = initialSessionId ?? 'session-' + Date.now();
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

  // Use skillLoader from deps (created in init.ts and injected into ContextBuilder)
  const skillLoader = skillLoaderFromDeps || new SkillAutoLoader(dataDir);

  function REPL() {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
    const [displayMessages, setDisplayMessages] = useState<DisplayMsg[]>(() =>
      initialMessages && initialMessages.length > 0
        ? [{
            id: 'resumed-' + Date.now(),
            role: 'system' as const,
            content: `  [resumed] ${sessionId} (${initialMessages.length} messages loaded)`,
            timestamp: Date.now(),
          }]
        : [],
    );
    const [isThinking, setIsThinking] = useState(false);
    const [thinkingLabel, setThinkingLabel] = useState('');
    const [model, setModelState] = useState(initialModel);
    const [showWelcome, setShowWelcome] = useState(true);
    const [pendingPermission, setPendingPermission] = useState<
      { tool: string; input: unknown; toolUseId: string; resolve: (v: boolean) => void } | null
    >(null);
    const [scrollPos, setScrollPos] = useState(0);
    const [terminalRows, setTerminalRows] = useState(40);
    const { exit } = useApp();
    const stdout = useStdout();
    const rows = (stdout as any).rows;
    const vim = useVimInput(input, setInput);

    const allMessagesRef = useRef<Message[]>(initialMessages ? [...initialMessages] : []);
    const sessionTitleRef = useRef<string>('');
    const activeSkillsRef = useRef<string[]>([]);

    useEffect(() => {
      if (rows) setTerminalRows(Math.max(10, rows - SCROLL_MARGIN));
    }, [rows]);

    // Discover skills on mount (may already be discovered by init.ts)
    useEffect(() => {
      const cwd = process.cwd();
      if (!skillLoader.list().length || !skillLoaderFromDeps) {
        skillLoader.rebuild(cwd);
      }
      autoActivateSkills(cwd);
    }, []);

    function autoActivateSkills(cwd: string) {
      const skills = skillLoader.list();
      for (const s of skills) {
        skillLoader.autoMatch(s.manifest.name, cwd);
      }
      activeSkillsRef.current = skillLoader.getActiveNames();
    }

    const addDisplay = useCallback((msg: DisplayMsg) => {
      setDisplayMessages(prev => {
        const next = [...prev, msg];
        const visibleLimit = Math.max(20, terminalRows - 4);
        if (next.length > visibleLimit * 2) {
          return next.slice(-visibleLimit * 2);
        }
        return next;
      });
    }, [terminalRows]);

    const runEngine = useCallback(async (allMessages: Message[]) => {
      let responseText = '';
      let currentToolName = '';

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
                  return [...prev.slice(0, -1), { ...last, content: responseText }];
                }
                return [...prev, {
                  id: 'msg-' + Date.now(),
                  role: 'assistant' as const,
                  content: responseText,
                  timestamp: Date.now(),
                }];
              });
              break;

            case 'tool_use':
              currentToolName = event.tool;
              setThinkingLabel(event.tool);
              addDisplay({
                id: 'toolhdr-' + Date.now(),
                role: 'system' as const,
                content: '  [\u25B2 ' + event.tool + '] running...',
                timestamp: Date.now(),
              });
              break;

            case 'tool_result': {
              const isError = typeof event.output === 'string' && event.output.startsWith('Error:');
              addDisplay({
                id: 'result-' + Date.now(),
                role: 'assistant' as const,
                content: isError
                  ? '  [\u00D7] ' + currentToolName + ' failed: ' + event.output.slice(0, 150)
                  : '  [\u2713] ' + currentToolName + ' -- ' + event.output.slice(0, 120),
                toolName: currentToolName,
                toolOutput: event.output.slice(0, 500),
                toolError: isError,
                collapsed: true,
                timestamp: Date.now(),
              });
              setThinkingLabel('');
              break;
            }

            case 'compressed':
              addDisplay({
                id: 'comp-' + Date.now(),
                role: 'system' as const,
                content: '  [\u{1F4C6}] Compressed ' + event.tokensBefore.toLocaleString() + ' \u2192 ' + event.tokensAfter.toLocaleString() + ' tokens',
                timestamp: Date.now(),
              });
              break;

            case 'end_turn': {
              const lastMsg = allMessages[allMessages.length - 1];
              const lastText = lastMsg && typeof lastMsg.content === 'string' ? lastMsg.content : '';
              skillLoader.autoMatch(lastText, process.cwd());
              activeSkillsRef.current = skillLoader.getActiveNames();
              setIsThinking(false);
              setThinkingLabel('');
              currentToolName = '';
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
            }

            case 'error':
              addDisplay({
                id: 'err-' + Date.now(),
                role: 'system' as const,
                content: 'X ' + event.error,
                timestamp: Date.now(),
              });
              setIsThinking(false);
              setThinkingLabel('');
              break;
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addDisplay({ id: 'err-' + Date.now(), role: 'system' as const, content: 'X ' + msg, timestamp: Date.now() });
        setIsThinking(false);
        setThinkingLabel('');
      }
    }, [addDisplay]);

    useInput(async (char, key) => {
      if (pendingPermission) {
        if (char === 'a' || char === 'A') {
          pendingPermission.resolve(true);
          addDisplay({ id: 'perm-ok', role: 'assistant' as const, content: '  [allowed] ' + pendingPermission.tool, timestamp: Date.now() });
          setPendingPermission(null);
          return;
        }
        if (char === 'd' || char === 'D') {
          pendingPermission.resolve(false);
          addDisplay({ id: 'perm-deny', role: 'assistant' as const, content: '  [denied] ' + pendingPermission.tool, timestamp: Date.now() });
          setPendingPermission(null);
          return;
        }
        return;
      }

      if (isThinking) return;
      if (vim.handleKey(char, key).handled) return;

      const maxScroll = Math.max(0, displayMessages.length - terminalRows + 4);

      if (key.pageUp || (key.upArrow && scrollPos > 0)) {
        setScrollPos(prev => Math.min(maxScroll, prev + terminalRows - 4));
        return;
      }
      if (key.pageDown || (key.downArrow && scrollPos < maxScroll)) {
        setScrollPos(prev => Math.max(0, prev - terminalRows + 4));
        return;
      }

      if (key.ctrl && char === 'l') { setDisplayMessages([]); setScrollPos(0); setShowWelcome(true); return; }
      if (key.ctrl && char === 'u') { setInput(''); return; }
      if (key.ctrl && char === 'w') {
        setInput(prev => { const t = prev.trimEnd(); const i = t.lastIndexOf(' '); return i === -1 ? '' : t.slice(0, i + 1); });
        return;
      }

      if (key.return) {
        const trimmed = input.trim();
        if (!trimmed) return;
        setInput('');
        setScrollPos(0);

        if (trimmed.startsWith('/')) {
          setShowWelcome(false);
          skillLoader.rebuild(process.cwd());
          const commandDeps = {
            dataDir, model,
            setModel: (m: string) => setModelState(m),
            clearOutput: () => { setDisplayMessages([]); setScrollPos(0); setShowWelcome(true); },
            addOutput: (line: string) => addDisplay({ id: 'cmd-' + Date.now(), role: 'assistant' as const, content: line, timestamp: Date.now() }),
            messages: allMessagesRef.current,
            resetMessages: () => { allMessagesRef.current = []; setMessages([]); setDisplayMessages([]); setScrollPos(0); setShowWelcome(true); },
            setMessages: (msgs: Message[]) => { allMessagesRef.current = msgs; setMessages(msgs); },
            clearMemoryCache: () => context.clearMemoryCache(),
            turnCount: messages.filter(m => m.role === 'user').length,
          };
          const result = await registry.execute(trimmed, commandDeps);
          if (result.output) {
            for (const line of result.output.split('\n')) {
              addDisplay({ id: 'cmd-' + Date.now() + '-' + line.slice(0, 20), role: 'assistant' as const, content: line, timestamp: Date.now() });
            }
          }
          return;
        }

        setShowWelcome(false);
        if (!sessionTitleRef.current) {
          sessionTitleRef.current = trimmed.length > 50 ? trimmed.slice(0, 50) + '...' : trimmed;
        }
        addDisplay({ id: 'user-' + Date.now(), role: 'user', content: '> ' + trimmed, timestamp: Date.now() });
        const userMsg: Message = { role: 'user', content: trimmed };
        setMessages(prev => {
          const all = [...prev, userMsg];
          allMessagesRef.current = all;
          runEngine(all);
          return all;
        });
        setIsThinking(true);
        setThinkingLabel('');

        // Auto-match skills and inject into context
        skillLoader.autoMatch(trimmed, process.cwd());
        activeSkillsRef.current = skillLoader.getActiveNames();
        // Inject active skills into context for next turn
        const activeContents = skillLoader.getActiveContents();
        if (activeContents.trim() && (context as any).injectSkills) {
          (context as any).injectSkills(activeContents);
        }
      } else if (key.backspace || key.delete) {
        setInput(prev => prev.slice(0, -1));
      } else if (key.ctrl && char === 'c') {
        exit();
      } else if (!key.ctrl && !key.meta && char) {
        setInput(prev => prev + char);
      }
    });

    // Virtual scroll window calculation
    const visibleStart = Math.max(0, displayMessages.length - terminalRows + 4 - scrollPos);
    const visibleEnd = displayMessages.length - scrollPos;
    const visibleMessages = displayMessages.slice(visibleStart, visibleEnd);

    const tokens = estTokens(allMessagesRef.current);
    const msgCount = allMessagesRef.current.length;
    const turnCount = allMessagesRef.current.filter(m => m.role === 'user').length;

    // Render
    const msgElements: React.ReactElement[] = [];
    for (const msg of visibleMessages) {
      if (msg.role === 'user') {
        msgElements.push(React.createElement(Text, { key: msg.id }, msg.content));
      } else if (msg.role === 'system') {
        msgElements.push(React.createElement(Text, { key: msg.id, color: 'gray' as const, dimColor: true }, msg.content));
      } else if (msg.content) {
        if (msg.content.startsWith('  [\u25B2 ')) {
          msgElements.push(React.createElement(Text, { key: msg.id, color: 'yellow' as const, bold: true }, msg.content));
        } else if (msg.content.startsWith('  [\u00D7]')) {
          msgElements.push(React.createElement(Text, { key: msg.id, color: 'red' as const }, msg.content));
        } else if (msg.content.startsWith('  [\u2713]')) {
          msgElements.push(React.createElement(Text, { key: msg.id, color: 'green' as const }, msg.content));
        } else if (msg.content.startsWith('  [\u{1F4C6}]')) {
          msgElements.push(React.createElement(Text, { key: msg.id, color: 'blue' as const }, msg.content));
        } else {
          msgElements.push(React.createElement(Text, { key: msg.id, color: 'white' as const }, msg.content));
        }
      }
    }

    const scrollHint = scrollPos > 0
      ? React.createElement(Text, { color: 'gray' as const, dimColor: true },
          ' \u21D1 ' + scrollPos + ' more above (PgUp)'
        )
      : null;

    return React.createElement(Box, { flexDirection: 'column' as const, height: '100%' as const },
      showWelcome && React.createElement(WelcomeBanner, { providerName: provider.name, model }),
      React.createElement(StatusBar, {
        providerName: provider.name,
        model,
        tokens,
        msgs: msgCount,
        vimMode: vim.enabled,
        sessionTitle: sessionTitleRef.current,
        activeSkills: activeSkillsRef.current,
        turnCount,
      }),
      React.createElement(Divider),
      scrollHint,
      React.createElement(Box, { flexDirection: 'column' as const }, ...msgElements),
      pendingPermission && React.createElement(PermissionDialog, {
        tool: pendingPermission.tool,
        input: pendingPermission.input,
      }),
      isThinking && React.createElement(ThinkingSpinner, { label: thinkingLabel }),
      React.createElement(Box, { flexGrow: 1 } as any),
      React.createElement(Box, null,
        React.createElement(Text, {
          color: vim.enabled && vim.isNormalMode ? 'yellow' as const : 'green' as const,
          bold: true,
        }, vim.enabled && vim.isNormalMode ? 'N ' : '> '),
        React.createElement(Text, null, input),
        React.createElement(Text, { color: 'gray' as const }, '\u2588'),
      ),
      React.createElement(Footer, { vimMode: vim.enabled, scrollPos, maxScroll: Math.max(0, displayMessages.length - terminalRows + 4) }),
    );
  }

  const { waitUntilExit } = render(React.createElement(REPL));
  return waitUntilExit();
}
