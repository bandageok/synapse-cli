// src/ui/REPL.tsx
// Synapse REPL: structured activity timeline, responsive chrome, and streamed answers.
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
  diffCommand, undoCommand, contextCommand, permissionsCommand,
  detailsCommand,
} from '../commands/builtin/index.js';
import { statusCommand } from '../commands/builtin/status.js';
import { skillsCommand } from '../commands/builtin/skills.js';
import { useVimInput } from '../vim/index.js';
import { SkillAutoLoader } from '../skills/AutoLoader.js';
import { VERSION } from '../version.js';
import { TokenRenderBuffer } from './streaming.js';
import { TimelineView } from './components/Timeline.js';
import {
  PermissionDialog,
  applyPermissionPromptAction,
  permissionPromptAction,
} from './components/PermissionDialog.js';
import {
  appendAssistantText,
  compactTimeline,
  finishAssistantStreams,
  finishTool,
  startTool,
  type DetailsMode,
  type DisplayItem,
} from './timeline.js';

import type { Message, PermissionMode, PermissionModeInput } from '../core/types.js';
import type { Provider } from '../providers/base.js';
import type { ToolRegistry } from '../core/ToolRegistry.js';
import type { ContextBuilder } from '../core/Context.js';
import type { Compressor } from '../core/Compressor.js';
import type { HookSystem } from '../core/HookSystem.js';
import type { ErrorRecovery } from '../core/ErrorRecovery.js';
import type { DynamicReminder } from '../soul/DynamicReminder.js';
import type { Heartbeat } from '../soul/Heartbeat.js';
import type { MemoryMaintenance } from '../soul/MemoryMaintenance.js';
import type { FakeExecutionWatchdog } from '../soul/FakeExecutionWatchdog.js';
import type { SelfImprovement } from '../soul/SelfImprovement.js';
import type { Logger } from '../core/Logger.js';
import type { SessionStore } from '../core/SessionStore.js';
import type { PermissionManager } from '../core/PermissionManager.js';

// ============================================================
// Constants
// ============================================================
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
  memoryMaintenance?: MemoryMaintenance;
  watchdog?: FakeExecutionWatchdog;
  selfImprovement?: SelfImprovement;
  logger?: Logger;
  dataDir: string;
  sessionStore?: SessionStore;
  skillLoader?: SkillAutoLoader;
  initialMessages?: Message[];
  initialSessionId?: string;
  permissionManager: PermissionManager;
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

export function WelcomeBanner({ providerName, model }: { providerName: string; model: string }) {
  return React.createElement(Box, { flexDirection: 'column' as const, marginBottom: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' as const }, '  Synapse v' + VERSION),
    React.createElement(Text, { color: 'gray' as const }, '  ' + (BADGE[providerName] || '\u25CF') + ' ' + providerName + ' / ' + model),
    React.createElement(Text, { color: 'gray' as const, dimColor: true }, '  /help: commands'),
  );
}

export function StatusBar({ providerName, model, tokens, msgs, vimMode, sessionTitle, activeSkills, turnCount, permissionMode, columns }: {
  providerName: string; model: string; tokens: number; msgs: number;
  vimMode: boolean; sessionTitle?: string; activeSkills: string[]; turnCount: number; permissionMode: PermissionMode; columns: number;
}) {
  const pct = Math.min(100, Math.round((tokens / CONTEXT_WINDOW) * 100));
  const color = pct < 60 ? 'green' as const : pct < 85 ? 'yellow' as const : 'red' as const;
  const line = formatStatusLine({
    providerName, model, msgs, sessionTitle, activeSkills, turnCount, permissionMode, columns,
  });
  return React.createElement(Box, { paddingX: 1 },
    React.createElement(Text, { wrap: 'truncate-end' },
      React.createElement(Text, { color: 'cyan' as const, bold: true }, 'Synapse'),
      React.createElement(Text, { color: 'gray' as const, dimColor: true }, line),
      React.createElement(Text, { color }, ` · ctx ${pct}%`),
      vimMode ? React.createElement(Text, { color: 'yellow' as const, bold: true }, ' NORMAL') : null,
    ),
  );
}

export function formatStatusLine(input: {
  providerName: string;
  model: string;
  msgs: number;
  sessionTitle?: string;
  activeSkills: string[];
  turnCount: number;
  permissionMode: PermissionMode;
  columns: number;
}): string {
  const compact = input.columns < 84;
  const parts = compact
    ? [input.model, `turn ${input.turnCount}`, input.permissionMode]
    : [input.providerName, input.model, `${input.msgs} msgs`, `turn ${input.turnCount}`, input.permissionMode];
  if (input.columns >= 110 && input.activeSkills.length > 0) parts.push(`${input.activeSkills.length} skills`);
  if (input.columns >= 140 && input.sessionTitle) parts.push(input.sessionTitle);
  return ' · ' + parts.join(' · ');
}

export function Divider({ columns }: { columns: number }) {
  return React.createElement(Text, { color: 'gray' as const, dimColor: true },
    ' ' + '\u2500'.repeat(Math.max(20, columns - 2))
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
    React.createElement(Text, { color: 'cyan' as const }, ' ' + SPINNER[tick] + ' Working'),
    label ? React.createElement(Text, { color: 'gray' as const }, ' · ' + label) : null,
    React.createElement(Text, { color: 'gray' as const, dimColor: true }, ' · ' + elapsed),
  );
}

export function Footer({ vimMode, scrollPos, maxScroll, detailsMode, columns }: {
  vimMode: boolean; scrollPos: number; maxScroll: number; detailsMode: DetailsMode; columns: number;
}) {
  const scrollInfo = maxScroll > 0 ? ' PgUp/Dn:scroll ' + (scrollPos + 1) + '/' + (maxScroll + 1) : ' ';
  if (columns < 72) {
    return React.createElement(Text, { color: 'gray' as const, dimColor: true },
      ` ${detailsMode} · Ctrl+O details · Enter send${scrollInfo}`,
    );
  }
  return React.createElement(Text, { color: 'gray' as const, dimColor: true },
    vimMode
      ? ` ${detailsMode} · Ctrl+O:details · i:insert · esc:normal · PgUp/Dn:scroll · Ctrl+C:cancel/exit${scrollInfo}`
      : ` ${detailsMode} · Ctrl+O:details · Enter:send · Ctrl+C:cancel/exit · PgUp/Dn:scroll · /help${scrollInfo}`,
  );
}

// ============================================================
// Main REPL v6
// ============================================================

export function launchREPL(deps: REPLDeps) {
  const {
    provider, tools, context, compressor, hooks, errorRecovery, dataDir,
    sessionStore, heartbeat, watchdog, selfImprovement, logger, permissionManager,
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
    vimCommand, diffCommand, undoCommand, contextCommand, permissionsCommand,
    detailsCommand, statusCommand, skillsCommand,
  ]) {
    registry.register(cmd);
  }

  // Use skillLoader from deps (created in init.ts and injected into ContextBuilder)
  const skillLoader = skillLoaderFromDeps || new SkillAutoLoader(dataDir);

  function REPL() {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
    const [permissionMode, setPermissionModeState] = useState<PermissionMode>(permissionManager.getMode());
    const [displayItems, setDisplayItems] = useState<DisplayItem[]>(() =>
      initialMessages && initialMessages.length > 0
        ? [{
            id: 'resumed-' + Date.now(),
            kind: 'notice' as const,
            tone: 'muted' as const,
            title: `Resumed ${sessionId}`,
            detail: `${initialMessages.length} messages loaded`,
            timestamp: Date.now(),
          }]
        : [],
    );
    const [detailsMode, setDetailsModeState] = useState<DetailsMode>('compact');
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
    const { stdout } = useStdout();
    const rows = stdout.rows;
    const vim = useVimInput(input, setInput);

    const allMessagesRef = useRef<Message[]>(initialMessages ? [...initialMessages] : []);
    const activeRunRef = useRef<AbortController | null>(null);
    const sessionTitleRef = useRef<string>('');
    const activeSkillsRef = useRef<string[]>([]);
    const displaySequenceRef = useRef(0);

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
      activeSkillsRef.current = skillLoader.getActiveNames();
    }

    const nextDisplayId = useCallback((prefix: string) => {
      displaySequenceRef.current += 1;
      return `${prefix}-${displaySequenceRef.current}`;
    }, []);

    const addItem = useCallback((item: DisplayItem) => {
      setDisplayItems(prev => [...prev, item]);
    }, []);

    const addNoticeText = useCallback((output: string, tone: 'muted' | 'info' | 'warning' | 'error' = 'info') => {
      const [title = '', ...detailLines] = output.split('\n');
      addItem({
        id: nextDisplayId('notice'),
        kind: 'notice',
        tone,
        title: title || '(no output)',
        detail: detailLines.length ? detailLines.join('\n') : undefined,
        timestamp: Date.now(),
      });
    }, [addItem, nextDisplayId]);

    const runEngine = useCallback(async (allMessages: Message[]) => {
      const controller = new AbortController();
      activeRunRef.current = controller;
      const renderBuffer = new TokenRenderBuffer(batch => {
        setDisplayItems(prev => appendAssistantText(prev, batch, nextDisplayId('assistant'), Date.now()));
      });

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
        engineOptions.signal = controller.signal;

        for await (const event of createEngine(
          allMessages, provider, tools, context, hooks, compressor, errorRecovery,
          engineOptions,
        )) {
          switch (event.type) {
            case 'token':
              await renderBuffer.push(event.text);
              break;

            case 'tool_use':
              renderBuffer.flush();
              setThinkingLabel(event.tool);
              setDisplayItems(prev => startTool(prev, {
                id: nextDisplayId('tool'),
                toolUseId: event.toolUseId,
                name: event.tool,
                input: event.input,
                timestamp: Date.now(),
              }));
              break;

            case 'tool_result': {
              setDisplayItems(prev => finishTool(prev, {
                id: nextDisplayId('tool-result'),
                toolUseId: event.toolUseId,
                name: event.tool,
                output: event.output,
                isError: event.isError,
                durationMs: event.durationMs,
                timestamp: Date.now(),
              }));
              setThinkingLabel('');
              break;
            }

            case 'compressed':
              addItem({
                id: nextDisplayId('compressed'),
                kind: 'notice',
                tone: 'info',
                title: 'Context compressed',
                detail: `${event.tokensBefore.toLocaleString()} → ${event.tokensAfter.toLocaleString()} tokens`,
                timestamp: Date.now(),
              });
              break;

            case 'end_turn': {
              renderBuffer.flush();
              setDisplayItems(finishAssistantStreams);
              const lastMsg = allMessages[allMessages.length - 1];
              const lastText = lastMsg && typeof lastMsg.content === 'string' ? lastMsg.content : '';
              skillLoader.autoMatch(lastText, process.cwd());
              activeSkillsRef.current = skillLoader.getActiveNames();
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
            }

            case 'error':
              renderBuffer.flush();
              setDisplayItems(finishAssistantStreams);
              addItem({
                id: nextDisplayId('error'),
                kind: 'notice',
                tone: 'error',
                title: event.error,
                timestamp: Date.now(),
              });
              setIsThinking(false);
              setThinkingLabel('');
              break;
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setDisplayItems(finishAssistantStreams);
        addItem({ id: nextDisplayId('error'), kind: 'notice', tone: 'error', title: msg, timestamp: Date.now() });
        setIsThinking(false);
        setThinkingLabel('');
      } finally {
        renderBuffer.close();
        if (activeRunRef.current === controller) activeRunRef.current = null;
        setIsThinking(false);
      }
    }, [addItem, nextDisplayId]);

    useInput(async (char, key) => {
      // Ctrl+C must remain available while a provider request is in flight.
      if (key.ctrl && char === 'c') {
        if (isThinking && activeRunRef.current) {
          activeRunRef.current.abort(new Error('Cancelled by user'));
          if (pendingPermission) {
            pendingPermission.resolve(false);
            setPendingPermission(null);
          }
          setThinkingLabel('cancelling');
          return;
        }
        exit();
        return;
      }

      if (pendingPermission) {
        const action = permissionPromptAction(char);
        if (action) {
          applyPermissionPromptAction(action, {
            resolve: pendingPermission.resolve,
            setFullAccess: () => {
              tools.setPermissionMode('full-access');
              setPermissionModeState('full-access');
            },
          });
          const title = action === 'deny'
            ? `Denied ${pendingPermission.tool}`
            : action === 'full-access'
              ? `Enabled full access and allowed ${pendingPermission.tool}`
              : `Allowed ${pendingPermission.tool} once`;
          addItem({
            id: `permission-${pendingPermission.toolUseId}-${action}`,
            kind: 'notice',
            tone: action === 'deny' ? 'warning' : 'info',
            title,
            timestamp: Date.now(),
          });
          setPendingPermission(null);
          return;
        }
        return;
      }

      if (key.ctrl && char === 'o') {
        setDetailsModeState(previous => previous === 'compact' ? 'expanded' : 'compact');
        setScrollPos(0);
        return;
      }

      if (isThinking) return;
      if (vim.handleKey(char, key).handled) return;

      const maxScroll = Math.max(0, compactTimeline(displayItems, detailsMode).length - terminalRows + 4);

      if (key.pageUp || (key.upArrow && scrollPos > 0)) {
        setScrollPos(prev => Math.min(maxScroll, prev + terminalRows - 4));
        return;
      }
      if (key.pageDown || (key.downArrow && scrollPos < maxScroll)) {
        setScrollPos(prev => Math.max(0, prev - terminalRows + 4));
        return;
      }

      if (key.ctrl && char === 'l') { setDisplayItems([]); setScrollPos(0); setShowWelcome(true); return; }
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
            clearOutput: () => { setDisplayItems([]); setScrollPos(0); setShowWelcome(true); },
            addOutput: (line: string) => addNoticeText(line),
            messages: allMessagesRef.current,
            resetMessages: () => { allMessagesRef.current = []; setMessages([]); setDisplayItems([]); setScrollPos(0); setShowWelcome(true); },
            setMessages: (msgs: Message[]) => { allMessagesRef.current = msgs; setMessages(msgs); },
            clearMemoryCache: () => context.clearMemoryCache(),
            turnCount: messages.filter(m => m.role === 'user').length,
            permissionMode,
            setPermissionMode: (mode: PermissionModeInput) => {
              const next = tools.setPermissionMode(mode);
              setPermissionModeState(next);
              return next;
            },
            detailsMode,
            setDetailsMode: (next: DetailsMode) => {
              setDetailsModeState(next);
              setScrollPos(0);
              return next;
            },
          };
          const result = await registry.execute(trimmed, commandDeps);
          if (result.output) addNoticeText(result.output);
          return;
        }

        setShowWelcome(false);
        if (!sessionTitleRef.current) {
          sessionTitleRef.current = trimmed.length > 50 ? trimmed.slice(0, 50) + '...' : trimmed;
        }
        addItem({ id: nextDisplayId('user'), kind: 'user', content: trimmed, timestamp: Date.now() });
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
      } else if (!key.ctrl && !key.meta && char) {
        setInput(prev => prev + char);
      }
    });

    const terminalColumns = Math.max(40, Number(stdout.columns) || 100);
    const renderableItems = compactTimeline(displayItems, detailsMode);
    const maxScroll = Math.max(0, renderableItems.length - terminalRows + 4);
    const visibleStart = Math.max(0, renderableItems.length - terminalRows + 4 - scrollPos);
    const visibleEnd = renderableItems.length - scrollPos;
    const visibleItems = renderableItems.slice(visibleStart, visibleEnd);

    const tokens = estTokens(allMessagesRef.current);
    const msgCount = allMessagesRef.current.length;
    const turnCount = allMessagesRef.current.filter(m => m.role === 'user').length;
    const latestDisplayItem = displayItems.at(-1);
    const showWorkingIndicator = isThinking && !(
      (latestDisplayItem?.kind === 'assistant' && latestDisplayItem.streaming)
      || (latestDisplayItem?.kind === 'tool' && latestDisplayItem.status === 'running')
    );

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
        permissionMode,
        columns: terminalColumns,
      }),
      React.createElement(Divider, { columns: terminalColumns }),
      scrollHint,
      React.createElement(TimelineView, {
        items: visibleItems,
        detailsMode,
        maxAnswerLines: Math.max(10, terminalRows - 10),
      }),
      pendingPermission && React.createElement(PermissionDialog, {
        tool: pendingPermission.tool,
        input: pendingPermission.input,
      }),
      showWorkingIndicator && React.createElement(ThinkingSpinner, { label: thinkingLabel }),
      React.createElement(Box, { flexGrow: 1 } as any),
      React.createElement(Divider, { columns: terminalColumns }),
      React.createElement(Box, { paddingX: 1 },
        React.createElement(Text, {
          color: vim.enabled && vim.isNormalMode ? 'yellow' as const : 'cyan' as const,
          bold: true,
        }, vim.enabled && vim.isNormalMode ? 'N ' : '❯ '),
        React.createElement(Text, null, input),
        React.createElement(Text, { color: 'gray' as const }, '\u2588'),
      ),
      React.createElement(Footer, { vimMode: vim.enabled, scrollPos, maxScroll, detailsMode, columns: terminalColumns }),
    );
  }

  const { waitUntilExit } = render(React.createElement(REPL));
  return waitUntilExit();
}
