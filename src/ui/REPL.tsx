// src/ui/REPL.tsx
// Synapse REPL: structured activity timeline, responsive chrome, and streamed answers.
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { render, Text, Box, useInput, useApp, useStdout } from 'ink';
import { existsSync, readFileSync } from 'fs';
import { basename, join } from 'path';
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
import { answerSkillInventoryQuery } from '../skills/query.js';
import { VERSION } from '../version.js';
import { tailTextByRows, TokenRenderBuffer } from './streaming.js';
import { ActivityRail, TimelineView } from './components/Timeline.js';
import { CommandPalette, filterSlashCommands } from './components/CommandPalette.js';
import {
  PermissionDialog,
  applyPermissionPromptAction,
  permissionPromptAction,
} from './components/PermissionDialog.js';
import {
  appendAssistantText,
  compactTimeline,
  countFailures,
  finishAssistantStreams,
  finishTool,
  latestTurnId,
  preserveScrollOffset,
  sliceTimelineByRows,
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
import { resolveRateLimitRetries } from '../core/retry.js';
import { switchRuntimeModel } from '../core/RuntimeState.js';

// ============================================================
// Constants
// ============================================================
const CONTEXT_WINDOW = 200_000;
const MAX_QUEUED_INPUTS = 8;
const SPINNER = ['\u280B','\u2819','\u2839','\u2838','\u283C','\u2834','\u2826','\u2827','\u2807','\u280F'];
const ACCENT = {
  cyan: '#5fd7ff',
  blue: '#5f87ff',
  purple: '#af87ff',
  magenta: '#d75f87',
  green: '#87d787',
};
const SYNAPSE_LOGO = [
  ' ██████ ██  ██ ███  ██  ███  █████  ████  █████',
  ' ██      ████   ████ ██ ██ ██ ██  ██ ██    ██   ',
  ' █████    ██    ██ ████ █████ █████   ███  ████ ',
  '     ██   ██    ██  ████ ██ ██ ██      ██ ██   ',
  ' █████    ██    ██   ██ ██ ██ ██     ████  █████',
];
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
  initialPrompt?: string;
  permissionManager: PermissionManager;
}

export function shouldUseAlternateScreen(isTTY: boolean, disabledValue?: string): boolean {
  return isTTY && disabledValue !== '1' && disabledValue?.toLowerCase() !== 'true';
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

export function welcomeBannerRows(columns: number): number {
  return columns >= 82 ? 8 : 4;
}

export function WelcomeBanner({ providerName, model, columns = 100, cwd = process.cwd() }: {
  providerName: string; model: string; columns?: number; cwd?: string;
}) {
  const wide = columns >= 82;
  return React.createElement(Box, { flexDirection: 'column' as const, marginBottom: 1 },
    React.createElement(Text, { color: 'gray' as const, dimColor: true, wrap: 'truncate-end' }, ` ${cwd}`),
    ...(wide
      ? SYNAPSE_LOGO.map((line, index) => React.createElement(Text, {
          key: `logo-${index}`,
          color: [ACCENT.blue, ACCENT.cyan, ACCENT.purple, ACCENT.magenta, ACCENT.purple, ACCENT.blue][index],
          bold: true,
        }, line))
      : [React.createElement(Text, { key: 'compact-logo', color: ACCENT.cyan, bold: true }, ` ◆ SYNAPSE v${VERSION}`)]),
    React.createElement(Text, { color: 'gray' as const },
      ' ' + (BADGE[providerName] || '\u25CF') + ' ',
      React.createElement(Text, { color: ACCENT.purple, bold: true }, providerName),
      React.createElement(Text, { color: 'gray' as const }, ' / '),
      React.createElement(Text, { color: ACCENT.blue }, model),
    ),
  );
}

export function StatusBar({ providerName, model, tokens, msgs, vimMode, sessionTitle, activeSkills, turnCount, permissionMode, columns, cwd, working, activity }: {
  providerName: string; model: string; tokens: number; msgs: number;
  vimMode: boolean; sessionTitle?: string; activeSkills: string[]; turnCount: number; permissionMode: PermissionMode; columns: number;
  cwd?: string; working?: boolean; activity?: string;
}) {
  const status = working ? (activity ? `Working: ${activity}` : 'Working') : 'Ready';
  return React.createElement(Box, { paddingX: 1 },
    React.createElement(Text, { wrap: 'truncate-end' },
      React.createElement(Text, { color: ACCENT.cyan, bold: true }, 'Synapse'),
      React.createElement(Text, { color: working ? 'yellow' as const : ACCENT.green }, ` · ${status}`),
      columns >= 120 && activeSkills.length > 0
        ? React.createElement(Text, { color: 'gray' as const }, ` · ${activeSkills.length} skills`)
        : null,
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
  cwd?: string;
  working?: boolean;
  activity?: string;
}): string {
  const status = input.working ? (input.activity ? `Working: ${input.activity}` : 'Working') : 'Ready';
  const parts = [status];
  if (input.columns >= 120 && input.activeSkills.length > 0) parts.push(`${input.activeSkills.length} skills`);
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

export function Footer({ vimMode, permissionMode, rowsAbove, rowsBelow, detailsMode, failureCount, columns, cwd, model, contextPercent }: {
  vimMode: boolean;
  permissionMode: PermissionMode;
  rowsAbove: number;
  rowsBelow: number;
  detailsMode: DetailsMode | 'current-turn';
  failureCount: number;
  columns: number;
  cwd?: string;
  model?: string;
  contextPercent?: number;
}) {
  const narrow = columns < 84;
  const displayCwd = cwd ? (narrow ? basename(cwd) : cwd) : '';
  const left = [displayCwd, rowsAbove > 0 ? `↑ ${rowsAbove}` : '', rowsBelow > 0 && columns >= 72 ? `↓ ${rowsBelow}` : ''].filter(Boolean).join(' · ');
  const center = [
    permissionMode,
    detailsMode === 'expanded' ? 'details open' : detailsMode === 'current-turn' ? 'turn details' : '',
    failureCount > 0 ? `${failureCount} issue${failureCount === 1 ? '' : 's'}` : '',
    vimMode && columns >= 84 ? 'vim' : '',
  ].filter(Boolean).join(' · ');
  const right = [model ?? '', contextPercent === undefined ? '' : `ctx ${contextPercent}%`].filter(Boolean).join(' · ');
  const modeColor = permissionMode === 'full-access' ? 'red' as const : permissionMode === 'ask' ? 'yellow' as const : ACCENT.green;
  const widths = narrow ? ['32%', '28%', '40%'] : ['34%', '32%', '34%'];
  return React.createElement(Box, { width: columns, paddingX: 1 },
    React.createElement(Box, { width: widths[0] },
      React.createElement(Text, { color: ACCENT.blue, dimColor: true, wrap: 'truncate-end' }, left),
    ),
    React.createElement(Box, { width: widths[1], justifyContent: 'center' },
      React.createElement(Text, { color: modeColor, wrap: 'truncate-end' }, center),
    ),
    React.createElement(Box, { width: widths[2], justifyContent: 'flex-end' },
      React.createElement(Text, { color: ACCENT.purple, wrap: 'truncate-end' }, right),
    ),
  );
}

export function appendQueuedInput(queue: string[], input: string, maxItems = MAX_QUEUED_INPUTS): string[] {
  const normalized = input.trim();
  if (!normalized || queue.length >= maxItems) return queue;
  return [...queue, normalized];
}

export type BusySubmissionAction = 'ignore' | 'queue' | 'reject-command' | 'reject-full';

export function busySubmissionAction(input: string, queuedCount: number, maxItems = MAX_QUEUED_INPUTS): BusySubmissionAction {
  const normalized = input.trim();
  if (!normalized) return 'ignore';
  if (normalized.startsWith('/')) return 'reject-command';
  if (queuedCount >= maxItems) return 'reject-full';
  return 'queue';
}

export function engineErrorNotice(error: string): { tone: 'muted' | 'error'; title: string } {
  return /cancel|abort/i.test(error)
    ? { tone: 'muted', title: 'Turn cancelled' }
    : { tone: 'error', title: error };
}

export function QueuePreview({ items }: { items: string[]; columns: number }) {
  if (items.length === 0) return null;
  const next = items[0].replace(/\s+/g, ' ').trim();
  return React.createElement(Box, { paddingX: 1 },
    React.createElement(Text, { color: 'yellow' as const, wrap: 'truncate-end' },
      `↳ ${items.length} queued · ${next}`,
    ),
  );
}

export function Composer({ input, normalMode, columns, permissionMode, contextLabel }: {
  input: string; normalMode: boolean; columns: number; permissionMode?: PermissionMode; contextLabel?: string;
}) {
  const visibleInput = tailTextByRows(input, Math.max(4, columns - 10), 4);
  const modeColor = permissionMode === 'full-access' ? 'red' as const : permissionMode === 'ask' ? 'yellow' as const : ACCENT.green;
  return React.createElement(Box, { flexDirection: 'column', marginX: 1, width: Math.max(10, columns - 2) },
    permissionMode || contextLabel ? React.createElement(Box, { justifyContent: 'space-between' },
      React.createElement(Text, { color: 'gray', dimColor: true }, contextLabel ?? ''),
      permissionMode ? React.createElement(Text, { color: modeColor, bold: true }, permissionMode) : null,
    ) : null,
    React.createElement(Box, {
      paddingX: 1,
      minHeight: 1,
      borderStyle: 'single',
      borderColor: normalMode ? 'yellow' as const : ACCENT.cyan,
    },
      React.createElement(Text, {
        color: normalMode ? 'yellow' as const : ACCENT.cyan,
        bold: true,
      }, normalMode ? 'N ' : '› '),
      React.createElement(Text, { wrap: 'wrap' }, visibleInput),
      React.createElement(Text, { color: 'gray' as const }, '\u2588'),
    ),
  );
}

// ============================================================
// Main REPL v6
// ============================================================

export function launchREPL(deps: REPLDeps) {
  const {
    provider, tools, context, compressor, hooks, errorRecovery, dataDir,
    sessionStore, heartbeat, watchdog, selfImprovement, logger, permissionManager,
    skillLoader: skillLoaderFromDeps, initialMessages, initialSessionId, initialPrompt,
  } = deps;
  const sessionId = initialSessionId ?? 'session-' + Date.now();
  const initialModel = provider.getModel?.() ?? getInitialModel(dataDir);
  const configuredRateLimitRetries = resolveRateLimitRetries(process.env.SYNAPSE_RATE_LIMIT_RETRIES, -1);

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
    const [expandedTurnId, setExpandedTurnId] = useState<string | null>(null);
    const [isThinking, setIsThinking] = useState(false);
    const [queuedInputs, setQueuedInputs] = useState<string[]>([]);
    const [commandCursor, setCommandCursor] = useState(0);
    const [commandPaletteDismissed, setCommandPaletteDismissed] = useState(false);
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
    const modelRef = useRef(initialModel);
    const sessionCreatedAtRef = useRef(new Date().toISOString());
    const initialPromptSubmittedRef = useRef(false);
    const activeRunRef = useRef<AbortController | null>(null);
    const sessionTitleRef = useRef<string>('');
    const activeSkillsRef = useRef<string[]>([]);
    const displaySequenceRef = useRef(0);
    const activeTurnIdRef = useRef<string | undefined>(undefined);
    const previousTotalRowsRef = useRef(0);

    useEffect(() => {
      if (rows) setTerminalRows(Math.max(12, rows));
    }, [rows]);

    useEffect(() => {
      setCommandCursor(0);
      setCommandPaletteDismissed(false);
    }, [input]);

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

    const addNoticeText = useCallback((output: string, tone: 'muted' | 'info' | 'warning' | 'error' = 'info', turnId?: string) => {
      const [title = '', ...detailLines] = output.split('\n');
      addItem({
        id: nextDisplayId('notice'),
        kind: 'notice',
        tone,
        title: title || '(no output)',
        detail: detailLines.length ? detailLines.join('\n') : undefined,
        timestamp: Date.now(),
        turnId: turnId ?? activeTurnIdRef.current,
      });
    }, [addItem, nextDisplayId]);

    const persistSession = useCallback(async () => {
      if (!sessionStore || allMessagesRef.current.length === 0) return;
      const turns = allMessagesRef.current.filter(message => message.role === 'user').length;
      try {
        await sessionStore.save(sessionId, allMessagesRef.current, {
          id: sessionId,
          model: modelRef.current,
          createdAt: sessionCreatedAtRef.current,
          updatedAt: new Date().toISOString(),
          tokenUsage: estTokens(allMessagesRef.current),
          turnCount: turns,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger?.warn('Session save failed', { sessionId, error: message });
        addNoticeText(`Session save failed\n${message}`, 'warning');
      }
    }, [addNoticeText]);

    const runEngine = useCallback(async (allMessages: Message[], turnId: string) => {
      const controller = new AbortController();
      activeRunRef.current = controller;
      activeTurnIdRef.current = turnId;
      const renderBuffer = new TokenRenderBuffer(batch => {
        setDisplayItems(prev => appendAssistantText(prev, batch, nextDisplayId('assistant'), Date.now(), turnId));
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
        engineOptions.rateLimitRetries = configuredRateLimitRetries;

        for await (const event of createEngine(
          allMessages, provider, tools, context, hooks, compressor, errorRecovery,
          engineOptions,
        )) {
          switch (event.type) {
            case 'token':
              await renderBuffer.push(event.text);
              break;

            case 'retrying':
              renderBuffer.flush();
              setDisplayItems(finishAssistantStreams);
              setThinkingLabel(
                `rate limited · retry ${event.attempt}/${event.maxAttempts ?? 'unlimited'} in ${formatDelay(event.delayMs)}`,
              );
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
                turnId,
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
                turnId,
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
                turnId,
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
              await persistSession();
              break;
            }

            case 'error':
              renderBuffer.flush();
              setDisplayItems(finishAssistantStreams);
              const errorNotice = engineErrorNotice(event.error);
              addItem({
                id: nextDisplayId('error'),
                kind: 'notice',
                ...errorNotice,
                timestamp: Date.now(),
                turnId,
              });
              setIsThinking(false);
              setThinkingLabel('');
              await persistSession();
              break;
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setDisplayItems(finishAssistantStreams);
        addItem({ id: nextDisplayId('error'), kind: 'notice', tone: 'error', title: msg, timestamp: Date.now(), turnId });
        setIsThinking(false);
        setThinkingLabel('');
        await persistSession();
      } finally {
        renderBuffer.close();
        if (activeRunRef.current === controller) activeRunRef.current = null;
        if (activeTurnIdRef.current === turnId) activeTurnIdRef.current = undefined;
        setIsThinking(false);
      }
    }, [addItem, nextDisplayId, persistSession]);

    const submitPrompt = useCallback((trimmed: string) => {
      setShowWelcome(false);
      if (!sessionTitleRef.current) {
        sessionTitleRef.current = trimmed.length > 50 ? trimmed.slice(0, 50) + '...' : trimmed;
      }
      const turnId = nextDisplayId('turn');
      addItem({ id: nextDisplayId('user'), kind: 'user', content: trimmed, timestamp: Date.now(), turnId });
      const userMsg: Message = { role: 'user', content: trimmed };
      const localAnswer = answerSkillInventoryQuery(trimmed, skillLoader, process.cwd());
      if (localAnswer) {
        const assistantMsg: Message = { role: 'assistant', content: localAnswer };
        const all = [...allMessagesRef.current, userMsg, assistantMsg];
        allMessagesRef.current = all;
        setMessages(all);
        addItem({
          id: nextDisplayId('assistant'), kind: 'assistant', content: localAnswer,
          streaming: false, timestamp: Date.now(), turnId,
        });
        activeSkillsRef.current = skillLoader.getActiveNames();
        void persistSession();
        return;
      }

      skillLoader.autoMatch(trimmed, process.cwd());
      activeSkillsRef.current = skillLoader.getActiveNames();
      const activeContents = skillLoader.getActiveContents();
      if (activeContents.trim() && (context as any).injectSkills) {
        (context as any).injectSkills(activeContents);
      }
      const all = [...allMessagesRef.current, userMsg];
      allMessagesRef.current = all;
      setMessages(all);
      setIsThinking(true);
      setThinkingLabel('');
      void runEngine(all, turnId);
    }, [addItem, nextDisplayId, persistSession, runEngine]);

    useEffect(() => {
      const prompt = initialPrompt?.trim();
      if (!prompt || initialPromptSubmittedRef.current) return;
      initialPromptSubmittedRef.current = true;
      submitPrompt(prompt);
    }, [initialPrompt, submitPrompt]);

    const terminalColumns = Math.max(40, Number(stdout.columns) || 100);
    const wideLayout = terminalColumns >= 110 && terminalRows >= 24;
    const railWidth = wideLayout ? Math.min(30, Math.max(24, Math.floor(terminalColumns * 0.24))) : 0;
    const renderableItems = compactTimeline(displayItems, detailsMode, expandedTurnId);
    const commandCandidates = filterSlashCommands(registry.list(), input);
    const commandPaletteOpen = !commandPaletteDismissed && !isThinking && !pendingPermission && commandCandidates.length > 0;
    const commandPaletteRows = commandPaletteOpen ? commandCandidates.length + 2 : 0;
    const composerRows = Math.min(4, Math.max(1, Math.ceil(Math.max(1, input.length) / Math.max(20, terminalColumns - 6))));
    const chromeRows = (showWelcome ? welcomeBannerRows(terminalColumns) : 0)
      + (pendingPermission
        ? 15
        : 6 + composerRows + commandPaletteRows + (isThinking ? 1 : 0) + (queuedInputs.length ? 1 : 0));
    const timelineRowBudget = Math.max(6, terminalRows - chromeRows);
    const maxAnswerLines = Math.max(6, timelineRowBudget - 4);
    const timelineWindow = sliceTimelineByRows(
      renderableItems,
      timelineRowBudget,
      Math.max(20, terminalColumns - railWidth - 6),
      detailsMode,
      maxAnswerLines,
      scrollPos,
      expandedTurnId,
    );
    const maxScroll = timelineWindow.maxScrollRows;
    const failureCount = countFailures(renderableItems);

    useEffect(() => {
      const previousTotalRows = previousTotalRowsRef.current;
      previousTotalRowsRef.current = timelineWindow.totalRows;
      if (previousTotalRows === 0 || scrollPos === 0) return;
      setScrollPos(previous => Math.min(
        timelineWindow.maxScrollRows,
        preserveScrollOffset(previous, previousTotalRows, timelineWindow.totalRows),
      ));
    }, [timelineWindow.totalRows, timelineWindow.maxScrollRows]);

    useEffect(() => {
      if (isThinking || pendingPermission || queuedInputs.length === 0) return;
      const [next, ...remaining] = queuedInputs;
      setQueuedInputs(remaining);
      submitPrompt(next);
    }, [isThinking, pendingPermission, queuedInputs, submitPrompt]);

    useInput(async (char, key) => {
      if (key.escape && isThinking && activeRunRef.current) {
        activeRunRef.current.abort(new Error('Cancelled by user'));
        if (pendingPermission) {
          pendingPermission.resolve(false);
          setPendingPermission(null);
        }
        setThinkingLabel('cancelling');
        return;
      }

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
        await persistSession();
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
        const currentTurnId = latestTurnId(displayItems);
        if (!currentTurnId) return;
        setDetailsModeState('compact');
        setExpandedTurnId(previous => previous === currentTurnId ? null : currentTurnId);
        setScrollPos(0);
        return;
      }

      if (commandPaletteOpen) {
        if (key.escape) {
          setCommandPaletteDismissed(true);
          return;
        }
        if (key.upArrow) {
          setCommandCursor(previous => (previous - 1 + commandCandidates.length) % commandCandidates.length);
          return;
        }
        if (key.downArrow) {
          setCommandCursor(previous => (previous + 1) % commandCandidates.length);
          return;
        }
        const selected = commandCandidates[Math.min(commandCursor, commandCandidates.length - 1)];
        const exact = input.slice(1).toLowerCase() === selected.name.toLowerCase();
        if (key.tab || (key.return && !exact)) {
          setInput(`/${selected.name}${selected.usage?.includes(' ') ? ' ' : ''}`);
          return;
        }
      }

      if (vim.handleKey(char, key).handled) return;

      if (key.pageUp || (key.upArrow && scrollPos > 0)) {
        setScrollPos(prev => Math.min(maxScroll, prev + timelineRowBudget));
        return;
      }
      if (key.pageDown || (key.downArrow && scrollPos < maxScroll)) {
        setScrollPos(prev => Math.max(0, prev - timelineRowBudget));
        return;
      }

      if (key.ctrl && char === 'l') {
        setDisplayItems([]); setScrollPos(0); setExpandedTurnId(null); setShowWelcome(true); return;
      }
      if (key.ctrl && char === 'u') { setInput(''); return; }
      if (key.ctrl && char === 'w') {
        setInput(prev => { const t = prev.trimEnd(); const i = t.lastIndexOf(' '); return i === -1 ? '' : t.slice(0, i + 1); });
        return;
      }

      if (key.return) {
        const trimmed = input.trim();
        if (!trimmed) return;
        if (isThinking) {
          const action = busySubmissionAction(trimmed, queuedInputs.length);
          if (action === 'reject-command') {
            addNoticeText('Commands are unavailable while a turn is running.', 'warning');
            return;
          }
          if (action === 'reject-full') {
            addNoticeText(`Follow-up queue is full (${MAX_QUEUED_INPUTS}).`, 'warning');
            return;
          }
          if (action !== 'queue') return;
          setQueuedInputs(previous => appendQueuedInput(previous, trimmed));
          setInput('');
          return;
        }
        setInput('');
        setScrollPos(0);
        setExpandedTurnId(null);

        if (trimmed.startsWith('/')) {
          setShowWelcome(false);
          skillLoader.rebuild(process.cwd());
          const commandDeps = {
            dataDir, model,
            setModel: (m: string) => {
              const next = switchRuntimeModel(m, provider, context, compressor);
              modelRef.current = next;
              setModelState(next);
            },
            clearOutput: () => { setDisplayItems([]); setScrollPos(0); setShowWelcome(true); },
            addOutput: (line: string) => addNoticeText(line),
            messages: allMessagesRef.current,
            resetMessages: () => { allMessagesRef.current = []; setMessages([]); setDisplayItems([]); setScrollPos(0); setShowWelcome(true); },
            setMessages: (msgs: Message[]) => { allMessagesRef.current = msgs; setMessages(msgs); },
            exit: async () => { await persistSession(); exit(); },
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
              setExpandedTurnId(null);
              setScrollPos(0);
              return next;
            },
            skillLoader,
          };
          const result = await registry.execute(trimmed, commandDeps);
          if (result.output) addNoticeText(result.output);
          return;
        }

        submitPrompt(trimmed);

      } else if (key.backspace || key.delete) {
        setInput(prev => prev.slice(0, -1));
      } else if (!key.ctrl && !key.meta && char) {
        setInput(prev => prev + char);
      }
    });

    const tokens = estTokens(allMessagesRef.current);
    const msgCount = allMessagesRef.current.length;
    const turnCount = allMessagesRef.current.filter(m => m.role === 'user').length;
    const latestDisplayItem = displayItems.at(-1);
    const showWorkingIndicator = isThinking && !(
      (latestDisplayItem?.kind === 'assistant' && latestDisplayItem.streaming)
      || (latestDisplayItem?.kind === 'tool' && latestDisplayItem.status === 'running')
    );

    const scrollHint = timelineWindow.rowsAbove > 0
      ? React.createElement(Text, { color: 'gray' as const, dimColor: true },
          ` ↑ ${timelineWindow.rowsAbove} rows above`
        )
      : null;

    return React.createElement(Box, { flexDirection: 'column' as const, height: '100%' as const },
      showWelcome && React.createElement(WelcomeBanner, {
        providerName: provider.name, model, columns: terminalColumns, cwd: process.cwd(),
      }),
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
        cwd: process.cwd(),
        working: isThinking,
        activity: thinkingLabel,
      }),
      React.createElement(Divider, { columns: terminalColumns }),
      React.createElement(Box, { flexDirection: wideLayout ? 'row' as const : 'column' as const, height: timelineRowBudget },
        wideLayout ? React.createElement(ActivityRail, {
          items: displayItems,
          width: railWidth,
          height: timelineRowBudget,
        }) : null,
        React.createElement(Box, {
          flexDirection: 'column' as const,
          flexGrow: 1,
          paddingLeft: wideLayout ? 1 : 0,
        },
          scrollHint,
          React.createElement(TimelineView, {
            items: timelineWindow.items,
            detailsMode,
            expandedTurnId,
            maxAnswerLines,
            columns: Math.max(20, terminalColumns - railWidth - 6),
          }),
        ),
      ),
      pendingPermission && React.createElement(PermissionDialog, {
        tool: pendingPermission.tool,
        input: pendingPermission.input,
        columns: terminalColumns,
      }),
      showWorkingIndicator && React.createElement(ThinkingSpinner, { label: thinkingLabel }),
      !pendingPermission && React.createElement(QueuePreview, { items: queuedInputs, columns: terminalColumns }),
      !pendingPermission && commandPaletteOpen && React.createElement(CommandPalette, {
          commands: commandCandidates,
          selectedIndex: commandCursor,
          columns: terminalColumns,
        }),
      !pendingPermission && React.createElement(Composer, {
          input,
          normalMode: vim.enabled && vim.isNormalMode,
          columns: terminalColumns,
          permissionMode,
          contextLabel: activeSkillsRef.current.length > 0 ? `Using ${activeSkillsRef.current.length} skills` : undefined,
        }),
      !pendingPermission && React.createElement(Footer, {
          vimMode: vim.enabled,
          permissionMode,
          rowsAbove: timelineWindow.rowsAbove,
          rowsBelow: timelineWindow.rowsBelow,
          detailsMode: expandedTurnId ? 'current-turn' : detailsMode,
          failureCount,
          columns: terminalColumns,
          cwd: process.cwd(),
          model,
          contextPercent: Math.min(100, Math.round((tokens / CONTEXT_WINDOW) * 100)),
        }),
    );
  }

  const alternateScreen = shouldUseAlternateScreen(Boolean(process.stdout.isTTY), process.env.SYNAPSE_NO_ALT_SCREEN);
  const restoreScreen = () => {
    if (alternateScreen) process.stdout.write('\u001b[?1049l');
  };
  if (alternateScreen) process.stdout.write('\u001b[?1049h\u001b[2J\u001b[H');
  try {
    const { waitUntilExit } = render(React.createElement(REPL));
    return waitUntilExit().finally(restoreScreen);
  } catch (error) {
    restoreScreen();
    throw error;
  }
}

function formatDelay(delayMs: number): string {
  if (delayMs < 1_000) return `${delayMs}ms`;
  return `${Math.ceil(delayMs / 1_000)}s`;
}
