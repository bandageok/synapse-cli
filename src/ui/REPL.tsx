// src/ui/REPL.tsx
// C.C.Claw REPL v3 — Claude Code 级交互架构
// Welcome → status bar → message timeline → streaming → tool calls → footer
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { render, Text, Box, useInput, useApp } from 'ink';
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
import { useVimInput } from '../vim/index.js';
import type { Message, ContentBlock } from '../core/types.js';
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
// 常量
// ============================================================
const VERSION = '0.2.0';
const CONTEXT_WINDOW = 200_000;
const MAX_OUTPUT = 100;

const SPINNER = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

const PROVIDER_BADGE: Record<string, { icon: string; color: string }> = {
  anthropic: { icon: '◆', color: '#6366f1' },
  openrouter: { icon: '◇', color: '#a855f7' },
  minimax:   { icon: '▲', color: '#f97316' },
};

// ============================================================
// 类型
// ============================================================
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
  toolCalls?: { name: string; input: string }[];
  toolResults?: { name: string; output: string; error: boolean }[];
}

// ============================================================
// 工具函数
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
    const p = join(dataDir, '.cclaw.json');
    if (existsSync(p)) {
      const c = JSON.parse(readFileSync(p, 'utf-8'));
      if (c.model && c.model.trim()) return c.model.trim();
    }
  } catch { /* skip */ }
  return 'claude-sonnet-4-20250514';
}

// ============================================================
// UI 组件
// ============================================================

// Welcome 画面
function WelcomeBanner({ providerName, model }: { providerName: string; model: string }) {
  const badge = PROVIDER_BADGE[providerName]?.icon || '●';
  return React.createElement(Box, { flexDirection: 'column' as const, marginBottom: 1, paddingX: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' as const }, ` ⚡ C.C.Claw v${VERSION}`),
    React.createElement(Text, { color: 'gray' as const, dimColor: true }, ` ${badge} ${providerName} / ${model}`),
  );
}

// 状态行
function StatusBar({ providerName, model, tokens, msgs }: { providerName: string; model: string; tokens: number; msgs: number }) {
  const pct = Math.min(100, Math.round((tokens / CONTEXT_WINDOW) * 100));
  const filled = Math.round((pct / 100) * 20);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  const color = pct < 60 ? 'green' as const : pct < 85 ? 'yellow' as const : 'red' as const;
  return React.createElement(Box, null,
    React.createElement(Text, { color: 'gray' as const, dimColor: true },
      ` ${providerName} · ${model} · ${msgs} msgs`
    ),
    React.createElement(Text, { color, dimColor: true },
      ` │ ${bar} ${pct}%`
    ),
  );
}

// 分隔线
function Divider() {
  return React.createElement(Text, { color: 'gray' as const, dimColor: true },
    ' ──────────────────────────────────────────────────────'
  );
}

// 用户消息
function UserMsg({ text }: { text: string }) {
  return React.createElement(Text, { color: 'green' as const, bold: true }, ` ❯ ${text}`);
}

// AI 消息
function AssistantMsg({ text }: { text: string }) {
  return React.createElement(Text, { color: 'white' as const }, ` 🤖 ${text}`);
}

// 工具调用
function ToolCall({ name, input }: { name: string; input: string }) {
  return React.createElement(Box, { flexDirection: 'column' as const },
    React.createElement(Text, { color: 'yellow' as const, bold: true }, ` 🔧 ${name}`),
    input.length > 0 && React.createElement(Text, { color: 'gray' as const, dimColor: true },
      `    ${input.slice(0, 120)}${input.length > 120 ? '…' : ''}`
    ),
  );
}

// 工具结果
function ToolResult({ name, output, error }: { name: string; output: string; error: boolean }) {
  const truncated = output.length > 200 ? output.slice(0, 200) + '…' : output;
  return React.createElement(Text, { color: error ? 'red' as const : 'green' as const, dimColor: true },
    `   ${error ? '❌' : '→'} ${truncated}`
  );
}

// 压缩提示
function CompressedMsg({ before, after }: { before: number; after: number }) {
  const saved = before - after;
  const pct = Math.round((saved / before) * 100);
  return React.createElement(Text, { color: 'blue' as const },
    ` 📦 Compressed ${before.toLocaleString()} → ${after.toLocaleString()} tokens (-${pct}%)`
  );
}

// 系统消息
function SystemMsg({ text }: { text: string }) {
  return React.createElement(Text, { color: 'gray' as const, dimColor: true }, `   ${text}`);
}

// 错误消息
function ErrorMsg({ text }: { text: string }) {
  return React.createElement(Text, { color: 'red' as const, bold: true }, ` ❌ ${text}`);
}

// Thinking spinner
function ThinkingSpinner({ label }: { label: string }) {
  const t0 = Date.now();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => (t + 1) % SPINNER.length), 80);
    return () => clearInterval(timer);
  }, []);
  return React.createElement(Box, null,
    React.createElement(Text, { color: 'cyan' as const }, ` ${SPINNER[tick]} `),
    React.createElement(Text, { color: 'yellow' as const, dimColor: true }, label || 'thinking'),
    React.createElement(Text, { color: 'gray' as const, dimColor: true },
      ` ${((Date.now() - t0) / 1000).toFixed(1)}s`
    ),
  );
}

// 权限弹窗
function PermissionDialog({ tool, input }: { tool: string; input: unknown }) {
  const inputStr = typeof input === 'string' ? input.slice(0, 100) : JSON.stringify(input).slice(0, 100);
  return React.createElement(Box, {
    flexDirection: 'column' as const,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 1,
    paddingRight: 1,
    borderStyle: 'round' as const,
    borderColor: 'yellow' as const,
  },
    React.createElement(Text, { bold: true, color: 'yellow' as const }, ` ⚠ Permission: ${tool}`),
    React.createElement(Text, { color: 'gray' as const, dimColor: true }, `   ${inputStr}`),
    React.createElement(Text, null, '   [A] allow   [D] deny'),
  );
}

// Footer
function Footer({ vimMode }: { vimMode: boolean }) {
  return React.createElement(Text, { color: 'gray' as const, dimColor: true },
    vimMode
      ? ' INSERT: i  NORMAL: h j k l  ESC: normal mode  Ctrl+C: exit'
      : ' Enter: send  Ctrl+C: exit  Ctrl+L: clear  Ctrl+U: clear input  /help: commands'
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
    // State
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
    const currentToolCallsRef = useRef<{ name: string; input: string }[]>([]);
    const { exit } = useApp();
    const vim = useVimInput(input, setInput);

    const addDisplay = useCallback((msg: DisplayMsg) => {
      setDisplayMessages(prev => [...prev.slice(-MAX_OUTPUT), msg]);
    }, []);

    // Engine
    const runEngine = useCallback(async (allMessages: Message[]) => {
      currentToolCallsRef.current = [];
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
              // Update last assistant message in real-time
              setDisplayMessages(prev => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'assistant') {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...last, content: responseText };
                  return updated;
                }
                return [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: responseText }];
              });
              break;

            case 'tool_use':
              currentToolCallsRef.current.push({ name: event.tool, input: JSON.stringify(event.input).slice(0, 100) });
              addDisplay({ id: `tool-${Date.now()}`, role: 'assistant', content: `🔧 ${event.tool}` });
              setThinkingLabel(event.tool);
              break;

            case 'tool_result':
              const isError = typeof event.output === 'string' && event.output.startsWith('Error:');
              addDisplay({
                id: `result-${Date.now()}`,
                role: 'assistant',
                content: '',
                toolResults: [{ name: event.tool, output: event.output.slice(0, 200), error: isError }],
              });
              setThinkingLabel('');
              break;

            case 'compressed':
              addDisplay({ id: `comp-${Date.now()}`, role: 'assistant', content: '' } as DisplayMsg);
              // Actually render compressed message
              setDisplayMessages(prev => [...prev,
                { id: `comp-${Date.now()}`, role: 'assistant', content: '', toolCalls: [],
                  toolResults: [] } as unknown as DisplayMsg
              ]);
              break;

            case 'end_turn':
              setIsThinking(false);
              setThinkingLabel('');
              currentToolCallsRef.current = [];
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
              addDisplay({ id: `err-${Date.now()}`, role: 'assistant', content: event.error });
              setIsThinking(false);
              setThinkingLabel('');
              break;
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addDisplay({ id: `err-${Date.now()}`, role: 'assistant', content: msg });
        setIsThinking(false);
        setThinkingLabel('');
      }
    }, [addDisplay]);

    // Input handler
    useInput(async (char, key) => {
      if (pendingPermission) {
        if (char === 'a' || char === 'A') {
          pendingPermission.resolve(true);
          addDisplay({ id: `perm-ok`, role: 'assistant' as const, content: `✅ Allowed: ${pendingPermission.tool}` });
          setPendingPermission(null);
          return;
        }
        if (char === 'd' || char === 'D') {
          pendingPermission.resolve(false);
          addDisplay({ id: `perm-deny`, role: 'assistant' as const, content: `🚫 Denied: ${pendingPermission.tool}` });
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
            addOutput: (line: string) => addDisplay({ id: `cmd-${Date.now()}`, role: 'assistant' as const, content: line }),
            messages: allMessagesRef.current,
            resetMessages: () => { allMessagesRef.current = []; setMessages([]); setDisplayMessages([]); setShowWelcome(true); },
            setMessages: (msgs: Message[]) => { allMessagesRef.current = msgs; setMessages(msgs); },
            turnCount: messages.filter(m => m.role === 'user').length,
          };
          const result = await registry.execute(trimmed, commandDeps);
          if (result.output) result.output.split('\n').forEach(line => addDisplay({ id: `cmd-${Date.now()}-${line.slice(0,20)}`, role: 'assistant' as const, content: line }));
          return;
        }

        addDisplay({ id: `user-${Date.now()}`, role: 'user', content: trimmed, toolCalls: [], toolResults: [] } as unknown as DisplayMsg);
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

    // Derived
    const tokens = estTokens(allMessagesRef.current);

    // Render display messages
    const renderMessages = () => {
      const elements: React.ReactElement[] = [];
      for (const msg of displayMessages) {
        if (msg.role === 'user' && msg.content) {
          elements.push(React.createElement(UserMsg, { key: msg.id, text: msg.content }));
        } else if (msg.role === 'assistant') {
          if (msg.content) elements.push(React.createElement(AssistantMsg, { key: msg.id, text: msg.content }));
          if (msg.toolCalls) msg.toolCalls.forEach((tc, i) =>
            elements.push(React.createElement(ToolCall, { key: `${msg.id}-tc-${i}`, name: tc.name, input: tc.input }))
          );
          if (msg.toolResults) msg.toolResults.forEach((tr, i) =>
            elements.push(React.createElement(ToolResult, { key: `${msg.id}-tr-${i}`, name: tr.name, output: tr.output, error: tr.error }))
          );
        }
      }
      return elements;
    };

    return React.createElement(Box, { flexDirection: 'column' as const, height: '100%' as const },
      // Welcome
      showWelcome && React.createElement(WelcomeBanner, { providerName: provider.name, model }),

      // Status bar
      React.createElement(StatusBar, { providerName: provider.name, model, tokens, msgs: allMessagesRef.current.length }),

      // Divider
      React.createElement(Divider),

      // Messages
      ...renderMessages(),

      // Permission overlay (before thinking)
      pendingPermission && React.createElement(PermissionDialog, {
        tool: pendingPermission.tool,
        input: pendingPermission.input,
      }),

      // Thinking
      isThinking && React.createElement(ThinkingSpinner, { label: thinkingLabel }),

      // Spacer
      React.createElement(Box, { flexGrow: 1 } as any),

      // Input
      React.createElement(Box, null,
        React.createElement(Text, {
          color: vim.enabled && vim.isNormalMode ? 'yellow' as const : 'green' as const,
          bold: true,
        }, vim.enabled && vim.isNormalMode ? 'N ' : '❯ '),
        React.createElement(Text, null, input),
        React.createElement(Text, { color: 'gray' as const }, '▋'),
      ),

      // Footer
      React.createElement(Footer, { vimMode: vim.enabled }),
    );
  }

  const { waitUntilExit } = render(React.createElement(REPL));
  return waitUntilExit();
}
