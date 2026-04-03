// src/ui/REPL.tsx
// C.C.Claw REPL v2 — 对标 Claude Code 完整终端 UI，C.C.Claw 特色化
// Header 状态行 + 上下文进度条 + 工具可视化 + 权限覆盖层 + Footer + Vim + Soul
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { render, Text, Box, useInput, useApp, useStdout } from 'ink';
import { existsSync, readFileSync } from 'fs';
import { createEngine } from '../core/Engine.js';
import { CommandRegistry } from '../commands/registry.js';
import {
  helpCommand, exitCommand, clearCommand, modelCommand,
  memoryCommand, soulCommand, doctorCommand, configCommand,
  sessionCommand, costCommand, compactCommand, initCommand,
  resumeCommand, historyCommand, soulEditCommand, vimCommand,
  diffCommand, undoCommand, contextCommand,
} from '../commands/builtin/index.js';
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

// ============================================================
// 常量 & 工具函数
// ============================================================

const VERSION = '0.2.0';
const CONTEXT_WINDOW = 200_000; // default context window
const MAX_OUTPUT_LINES = 80;

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const PROVIDER_BADGES: Record<string, string> = {
  anthropic: '🔵',
  openrouter: '🟣',
  minimax: '🟠',
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
}

function estimateTokens(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') total += msg.content.length / 4;
    else total += JSON.stringify(msg.content).length / 4;
  }
  return Math.round(total);
}

function getInitialModel(dataDir: string): string {
  try {
    const p = `${[dataDir, '.cclaw.json'].join('/') || `${dataDir}/.cclaw.json`}`;
    if (existsSync(p)) {
      const cfg = JSON.parse(readFileSync(p, 'utf-8'));
      return cfg.model || 'claude-sonnet-4-20250514';
    }
  } catch { /* ignore */ }
  return 'claude-sonnet-4-20250514';
}

// ============================================================
// UI 组件
// ============================================================

// --- Welcome 画面（首次启动时显示一次） ---
function WelcomeScreen({ providerName, model }: { providerName: string; model: string }) {
  const badge = PROVIDER_BADGES[providerName] || '⚪';
  return React.createElement(Box, { flexDirection: 'column' as const, marginBottom: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' as const },
      '  ╔══════════════════════════════════════════╗'
    ),
    React.createElement(Text, { bold: true, color: 'cyan' as const },
      '  ║           ⚡  C.C.Claw v' + VERSION + '             ║'
    ),
    React.createElement(Text, { color: 'cyan' as const },
      '  ║    Claude Code × OpenClaw  开源 CLI      ║'
    ),
    React.createElement(Text, { bold: true, color: 'cyan' as const },
      '  ╚══════════════════════════════════════════╝'
    ),
    React.createElement(Text, null),
    React.createElement(Text, { color: 'gray' as const },
      `  ${badge} ${providerName} / ${model}`
    ),
    React.createElement(Text, { color: 'gray' as const },
      '  Type /help for commands or just start chatting.'
    ),
    React.createElement(Text, null),
  );
}

// --- 上下文进度条 ---
function ContextBar({ tokens, maxTokens }: { tokens: number; maxTokens: number }) {
  const pct = Math.min(100, Math.round((tokens / maxTokens) * 100));
  const filled = Math.round((pct / 100) * 20);
  const empty = 20 - filled;
  const color = pct < 50 ? 'green' as const : pct < 80 ? 'yellow' as const : 'red' as const;
  const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, empty));
  return React.createElement(Text, { color, dimColor: pct < 50 },
    ` │ ${bar} ${pct}% (${(tokens / 1000).toFixed(1)}k/${(maxTokens / 1000).toFixed(0)}k)`
  );
}

// --- 状态行（对标 Claude Code StatusLine） ---
function StatusBar({ providerName, model, tokens, messages, vimMode }: {
  providerName: string; model: string; tokens: number; messages: number; vimMode: boolean;
}) {
  const badge = PROVIDER_BADGES[providerName] || '⚪';
  return React.createElement(Box, null,
    React.createElement(Text, { color: 'gray' as const },
      ` ${badge} ${providerName}`
    ),
    React.createElement(Text, { color: 'gray' as const, dimColor: true },
      ` · ${model}`
    ),
    React.createElement(Text, { color: 'gray' as const, dimColor: true },
      ` · ${messages} msgs`
    ),
    React.createElement(ContextBar, { tokens, maxTokens: CONTEXT_WINDOW }),
    vimMode && React.createElement(Text, { color: 'yellow' as const, bold: true }, ' [NORMAL]'),
  );
}

// --- Footer 快捷键提示 ---
function Footer({ vimMode }: { vimMode: boolean }) {
  return React.createElement(Text, { color: 'gray' as const, dimColor: true },
    vimMode
      ? ' Normal: i 插入 · Esc 正常 · Ctrl+C 退出'
      : ' Enter 发送 · Ctrl+C 退出 · Ctrl+L 清屏 · Ctrl+U 清除 · /help 帮助'
  );
}

// --- 权限请求覆盖层 ---
function PermissionOverlay({ tool, input }: { tool: string; input: unknown }) {
  const inputStr = typeof input === 'string' ? input.slice(0, 80)
    : JSON.stringify(input).slice(0, 80);
  return React.createElement(Box, {
    flexDirection: 'column' as const,
    marginTop: 1,
    borderStyle: 'round' as const,
    borderColor: 'yellow' as const,
    paddingX: 1,
    paddingY: 0,
  },
    React.createElement(Text, { bold: true, color: 'yellow' as const }, ` ⚠ ${tool} requires permission`),
    React.createElement(Text, { dimColor: true }, `   ${inputStr}`),
    React.createElement(Text, null, '   [A] allow once  ·  [D] deny'),
  );
}

// ============================================================
// 主 REPL
// ============================================================

export function launchREPL(deps: REPLDeps) {
  const { provider, tools, context, compressor, hooks, errorRecovery, dataDir, sessionStore, heartbeat, watchdog, selfImprovement, logger } = deps;
  const sessionId = `session-${Date.now()}`;
  const initialModel = getInitialModel(dataDir);

  if (heartbeat) heartbeat.start();

  const registry = new CommandRegistry();
  for (const cmd of [
    helpCommand, exitCommand, clearCommand, modelCommand, memoryCommand,
    soulCommand, doctorCommand, configCommand, sessionCommand, costCommand,
    compactCommand, initCommand, resumeCommand, historyCommand, soulEditCommand,
    vimCommand, diffCommand, undoCommand, contextCommand,
  ]) {
    registry.register(cmd);
  }

  function REPL() {
    // ---- State ----
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [output, setOutput] = useState<string[]>([]);
    const [isThinking, setIsThinking] = useState(false);
    const [thinkingLabel, setThinkingLabel] = useState('');
    const [model, setModelState] = useState(initialModel);
    const [showWelcome, setShowWelcome] = useState(true);
    const [pendingPermission, setPendingPermission] = useState<
      { tool: string; input: unknown; toolUseId: string; resolve: (v: boolean) => void } | null
    >(null);
    const allMessagesRef = useRef<Message[]>([]);
    const { exit } = useApp();
    const vim = useVimInput(input, setInput);
    useStdout();

    const addOutput = useCallback((line: string) => {
      setOutput(prev => [...prev.slice(-MAX_OUTPUT_LINES), line]);
    }, []);

    // ---- Engine ----
    const runEngine = useCallback(async (allMessages: Message[]) => {
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
              setOutput(prev => {
                const last = prev[prev.length - 1];
                if (last?.startsWith('🤖 ')) return [...prev.slice(0, -1), last + event.text];
                return [...prev, '🤖 ' + event.text];
              });
              break;
            case 'tool_use':
              setThinkingLabel(event.tool);
              addOutput(` 🔧 ${event.tool}`);
              break;
            case 'tool_result':
              setThinkingLabel('');
              addOutput(`   → ${event.output.slice(0, 200)}${event.output.length > 200 ? ` …` : ''}`);
              break;
            case 'compressed':
              addOutput(` 📦 Context compressed: ${event.tokensBefore} → ${event.tokensAfter} tokens`);
              break;
            case 'end_turn':
              setIsThinking(false);
              setThinkingLabel('');
              if (sessionStore) {
                const turnCount = allMessagesRef.current.filter(m => m.role === 'user').length;
                sessionStore.save(sessionId, allMessagesRef.current, {
                  id: sessionId, model,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  tokenUsage: 0, turnCount,
                }).catch(() => {});
              }
              break;
            case 'error':
              addOutput(` ❌ ${event.error}`);
              setIsThinking(false);
              setThinkingLabel('');
              break;
          }
        }
      } catch (err: unknown) {
        addOutput(` ❌ ${err instanceof Error ? err.message : String(err)}`);
        setIsThinking(false);
        setThinkingLabel('');
      }
    }, [addOutput]);

    // ---- Input handler ----
    useInput(async (char, key) => {
      // Permission dialog
      if (pendingPermission) {
        if (char === 'a' || char === 'A') {
          addOutput(` ✅ Allowed: ${pendingPermission.tool}`);
          pendingPermission.resolve(true);
          setPendingPermission(null);
          return;
        }
        if (char === 'd' || char === 'D') {
          addOutput(` 🚫 Denied: ${pendingPermission.tool}`);
          pendingPermission.resolve(false);
          setPendingPermission(null);
          return;
        }
        return;
      }

      if (isThinking) return;
      if (vim.handleKey(char, key).handled) return;

      // Ctrl+L — clear screen
      if (key.ctrl && char === 'l') { setOutput([]); return; }
      // Ctrl+U — clear input
      if (key.ctrl && char === 'u') { setInput(''); return; }
      // Ctrl+W — delete word
      if (key.ctrl && char === 'w') {
        setInput(prev => {
          const t = prev.trimEnd();
          const i = t.lastIndexOf(' ');
          return i === -1 ? '' : t.slice(0, i + 1);
        });
        return;
      }

      if (key.return) {
        const trimmed = input.trim();
        if (!trimmed) return;
        setInput('');
        setShowWelcome(false);

        // Slash commands
        if (trimmed.startsWith('/')) {
          const commandDeps = {
            dataDir, model,
            setModel: (m: string) => setModelState(m),
            clearOutput: () => setOutput([]),
            addOutput,
            messages: allMessagesRef.current,
            resetMessages: () => { allMessagesRef.current = []; setMessages([]); },
            setMessages: (msgs: Message[]) => { allMessagesRef.current = msgs; setMessages(msgs); },
            turnCount: messages.filter(m => m.role === 'user').length,
          };
          const result = await registry.execute(trimmed, commandDeps);
          if (result.output) result.output.split('\n').forEach(addOutput);
          return;
        }

        // Normal chat
        const userMsg: Message = { role: 'user', content: trimmed };
        setMessages(prev => {
          const all = [...prev, userMsg];
          allMessagesRef.current = all;
          runEngine(all);
          return all;
        });
        addOutput(` > ${trimmed}`);
        setIsThinking(true);
        setThinkingLabel('thinking');
      } else if (key.backspace || key.delete) {
        setInput(prev => prev.slice(0, -1));
      } else if (key.ctrl && char === 'c') {
        exit();
      } else if (!key.ctrl && !key.meta && char) {
        setInput(prev => prev + char);
      }
    });

    // ---- Derived values ----
    const tokens = estimateTokens(allMessagesRef.current);
    const msgCount = allMessagesRef.current.length;
    const spinnerFrame = useRef(0);
    const [spinnerTick, setSpinnerTick] = useState(0);

    useEffect(() => {
      if (!isThinking) return;
      const timer = setInterval(() => {
        spinnerFrame.current = (spinnerFrame.current + 1) % SPINNER_FRAMES.length;
        setSpinnerTick(t => t + 1);
      }, 80);
      return () => clearInterval(timer);
    }, [isThinking]);

    // ---- Render ----
    return React.createElement(Box, { flexDirection: 'column' as const, height: '100%' as const, width: '100%' as const },
      // Welcome screen (shown once)
      showWelcome && React.createElement(WelcomeScreen, { providerName: provider.name, model }),

      // Status bar
      React.createElement(StatusBar, {
        providerName: provider.name,
        model,
        tokens,
        messages: msgCount,
        vimMode: vim.enabled,
      }),

      // Divider
      React.createElement(Text, { color: 'gray' as const },
        ' ' + '─'.repeat(60)
      ),

      // Output lines
      ...output.slice(-MAX_OUTPUT_LINES).map((line, i) =>
        React.createElement(Text, { key: `out-${i}-${line.slice(0, 15)}` }, line)
      ),

      // Permission overlay
      pendingPermission && React.createElement(PermissionOverlay, {
        tool: pendingPermission.tool,
        input: pendingPermission.input,
      }),

      // Thinking spinner
      isThinking && React.createElement(Box, { marginTop: 0 },
        React.createElement(Text, { color: 'cyan' as const },
          ` ${SPINNER_FRAMES[spinnerFrame.current]} `
        ),
        React.createElement(Text, { color: 'yellow' as const, dimColor: true },
          thinkingLabel || 'thinking'
        ),
      ),

      // Spacer to push input to bottom
      React.createElement(Box, { flexGrow: 1 } as any),

      // Input prompt
      React.createElement(Box, null,
        React.createElement(Text, {
          color: vim.enabled && vim.isNormalMode ? 'yellow' as const : 'green' as const,
          bold: true,
        }, vim.enabled && vim.isNormalMode ? 'N ' : '❯ '),
        React.createElement(Text, null, input),
        React.createElement(Text, { color: 'gray' as const }, '▋'),
      ),

      // Footer
      React.createElement(React.Fragment, null,
        React.createElement(Box, { marginTop: 0 },
          React.createElement(Footer, { vimMode: vim.enabled }),
        ),
      ),
    );
  }

  const { waitUntilExit } = render(React.createElement(REPL));
  return waitUntilExit();
}
