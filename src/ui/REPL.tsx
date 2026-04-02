// src/ui/REPL.tsx
// C.C.Claw REPL — 对标 Claude Code Ink UI
// Spinner + 多行编辑 + 语法高亮 + 工具结果折叠
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { render, Text, Box, useInput, useApp, useStdout } from 'ink';
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

import type { Provider } from '../core/types.js';
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

// Spinner 帧
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function SpinnerText({ label }: { label: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame(f => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(timer);
  }, []);
  return React.createElement(Text, { color: 'yellow' }, `${SPINNER_FRAMES[frame]} ${label}`);
}

// 语法高亮：命令、工具名、错误
function highlightLine(line: string): React.ReactElement {
  if (line.startsWith('> ')) {
    return React.createElement(Text, { color: 'green' }, line);
  }
  if (line.startsWith('🤖 ')) {
    return React.createElement(Text, { color: 'white' }, line);
  }
  if (line.startsWith('🔧 ')) {
    return React.createElement(Text, { color: 'yellow', bold: true }, line);
  }
  if (line.startsWith('  → ')) {
    return React.createElement(Text, { color: 'gray' }, line);
  }
  if (line.startsWith('❌ ')) {
    return React.createElement(Text, { color: 'red', bold: true }, line);
  }
  if (line.startsWith('📦 ')) {
    return React.createElement(Text, { color: 'blue' }, line);
  }
  if (line.startsWith('⚠️')) {
    return React.createElement(Text, { color: 'yellow' }, line);
  }
  if (line.startsWith('✅ ')) {
    return React.createElement(Text, { color: 'green' }, line);
  }
  if (line.startsWith('🚫 ')) {
    return React.createElement(Text, { color: 'red' }, line);
  }
  if (line.startsWith('/') || line.startsWith('  ')) {
    return React.createElement(Text, { color: 'gray' }, line);
  }
  return React.createElement(Text, { color: 'gray' }, line);
}

export function launchREPL(deps: REPLDeps) {
  const { provider, tools, context, compressor, hooks, errorRecovery, dataDir, sessionStore, heartbeat, dream: _dream, watchdog, selfImprovement, logger } = deps;
  const sessionId = `session-${Date.now()}`;

  // 启动 Heartbeat
  if (heartbeat) {
    heartbeat.start();
  }

  // Setup command registry
  const registry = new CommandRegistry();
  for (const cmd of [helpCommand, exitCommand, clearCommand, modelCommand, memoryCommand, soulCommand, doctorCommand, configCommand, sessionCommand, costCommand, compactCommand, initCommand, resumeCommand, historyCommand, soulEditCommand, vimCommand, diffCommand, undoCommand, contextCommand]) {
    registry.register(cmd);
  }

  function REPL() {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [output, setOutput] = useState<string[]>([]);
    const [isThinking, setIsThinking] = useState(false);
    const [thinkingLabel, setThinkingLabel] = useState('');
    const [model, setModelState] = useState('xiaomi/mimo-v2-pro');
    const [pendingPermission, setPendingPermission] = useState<{ tool: string; input: unknown; toolUseId: string; resolve: (v: boolean) => void } | null>(null);
    const [_toolResults, _setToolResults] = useState<Map<string, { tool: string; output: string }>>(new Map());
    const allMessagesRef = useRef<Message[]>([]);
    const { exit } = useApp();
    const vim = useVimInput(input, setInput);
    useStdout();

    const addOutput = useCallback((line: string) => {
      setOutput(prev => [...prev.slice(-60), line]);
    }, []);

    const runEngine = useCallback(async (allMessages: Message[]) => {
      try {
        const engineOptions: Record<string, unknown> = {
          onPermissionAsk: async (tool: string, input: unknown, toolUseId: string) => {
            return new Promise<boolean>((resolve) => {
              setPendingPermission({ tool, input, toolUseId, resolve });
            });
          },
        };
        if (watchdog) engineOptions.watchdog = watchdog;
        if (selfImprovement) engineOptions.selfImprovement = selfImprovement;
        if (logger) engineOptions.logger = logger;

        for await (const event of createEngine(
          allMessages, provider, tools, context, hooks, compressor, errorRecovery,
          engineOptions
        )) {
          switch (event.type) {
            case 'token':
              setOutput(prev => {
                const last = prev[prev.length - 1];
                if (last?.startsWith('🤖 ')) {
                  return [...prev.slice(0, -1), last + event.text];
                }
                return [...prev, '🤖 ' + event.text];
              });
              break;
            case 'tool_use':
              setThinkingLabel(event.tool);
              addOutput(`🔧 ${event.tool}`);
              break;
            case 'tool_result':
              setThinkingLabel('');
              addOutput(`  → ${event.output.slice(0, 150)}${event.output.length > 150 ? ` (${event.output.length} chars)` : ''}`);
              break;
            case 'compressed':
              addOutput(`📦 Compressed: ${event.tokensBefore} → ${event.tokensAfter} tokens`);
              break;
            case 'permission_ask':
              break;
            case 'end_turn':
              setIsThinking(false);
              setThinkingLabel('');
              if (sessionStore) {
                const turnCount = allMessagesRef.current.filter(m => m.role === 'user').length;
                sessionStore.save(sessionId, allMessagesRef.current, {
                  id: sessionId, model, createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(), tokenUsage: 0, turnCount,
                }).catch(() => {});
              }
              break;
            case 'error':
              addOutput(`❌ ${event.error}`);
              setIsThinking(false);
              setThinkingLabel('');
              break;
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        addOutput(`❌ ${msg}`);
        setIsThinking(false);
        setThinkingLabel('');
      }
    }, [addOutput]);

    // 处理权限确认输入
    useInput(async (char, key) => {
      if (pendingPermission) {
        if (char === 'a' || char === 'A') {
          addOutput(`✅ Allowed: ${pendingPermission.tool}`);
          pendingPermission.resolve(true);
          setPendingPermission(null);
          return;
        }
        if (char === 'd' || char === 'D') {
          addOutput(`🚫 Denied: ${pendingPermission.tool}`);
          pendingPermission.resolve(false);
          setPendingPermission(null);
          return;
        }
        return;
      }

      if (isThinking) return;

      // Vim mode intercept
      if (vim.handleKey(char, key).handled) return;

      // Ctrl+L 清屏
      if (key.ctrl && char === 'l') {
        setOutput([]);
        return;
      }

      // Ctrl+U 清除当前输入
      if (key.ctrl && char === 'u') {
        setInput('');
        return;
      }

      // Ctrl+W 删除前一个单词
      if (key.ctrl && char === 'w') {
        setInput(prev => {
          const trimmed = prev.trimEnd();
          const lastSpace = trimmed.lastIndexOf(' ');
          return lastSpace === -1 ? '' : trimmed.slice(0, lastSpace + 1);
        });
        return;
      }

      if (key.return) {
        const trimmed = input.trim();
        if (!trimmed) return;
        setInput('');

        // Handle slash commands
        if (trimmed.startsWith('/')) {
          const commandDeps = {
            dataDir,
            model,
            setModel: (m: string) => setModelState(m),
            clearOutput: () => setOutput([]),
            addOutput,
            messages: allMessagesRef.current,
            resetMessages: () => {
              allMessagesRef.current = [];
              setMessages([]);
            },
            setMessages: (msgs: Message[]) => {
              allMessagesRef.current = msgs;
              setMessages(msgs);
            },
            turnCount: messages.filter(m => m.role === 'user').length,
          };
          const result = await registry.execute(trimmed, commandDeps);
          if (result.output) {
            for (const line of result.output.split('\n')) {
              addOutput(line);
            }
          }
          return;
        }

        // Normal chat
        const userMsg: Message = { role: 'user', content: trimmed };
        setMessages(prev => {
          const allMessages = [...prev, userMsg];
          allMessagesRef.current = allMessages;
          runEngine(allMessages);
          return allMessages;
        });
        addOutput(`> ${trimmed}`);
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

    // 计算 token 估算
    let totalChars = 0;
    for (const msg of allMessagesRef.current) {
      if (typeof msg.content === 'string') totalChars += msg.content.length;
      else totalChars += JSON.stringify(msg.content).length;
    }
    const estimatedTokens = Math.round(totalChars / 4);

    return React.createElement(Box, { flexDirection: 'column', height: '100%' },
      // Header
      React.createElement(Box, { marginBottom: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, '⚡ C.C.Claw v0.2.0'),
        React.createElement(Text, { color: 'gray' }, ` — ${provider.name} / ${model}`),
        React.createElement(Text, { color: 'gray' }, ` | ${estimatedTokens} tok | ${allMessagesRef.current.length} msgs`),
        vim.enabled && React.createElement(Text, { color: vim.isNormalMode ? 'yellow' : 'green' },
          vim.isNormalMode ? ' [NORMAL]' : ' [INSERT]'
        ),
      ),
      // Output
      ...output.map((line, i) =>
        React.createElement(Text, {
          key: `${i}-${line.slice(0, 20)}`,
        }, highlightLine(line).props.children)
      ),
      // Permission dialog
      pendingPermission && React.createElement(Box, { marginTop: 1, borderStyle: 'round', borderColor: 'yellow', padding: 1, flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'yellow' }, `⚠️  Permission Request: ${pendingPermission.tool}`),
        React.createElement(Text, { dimColor: true }, `  ${JSON.stringify(pendingPermission.input).slice(0, 120)}`),
        React.createElement(Text, null, '  [A]llow once  [D]eny'),
      ),
      // Spinner
      isThinking && React.createElement(Box, { marginTop: 1 },
        React.createElement(SpinnerText, { label: thinkingLabel || 'thinking' }),
      ),
      // Input
      React.createElement(Box, { marginTop: 1 },
        React.createElement(Text, { color: 'green', bold: true }, vim.enabled && vim.isNormalMode ? 'N ' : '> '),
        React.createElement(Text, null, input),
        React.createElement(Text, { color: 'gray' }, '▋'),
      ),
    );
  }

  const { waitUntilExit } = render(React.createElement(REPL));

  return waitUntilExit();
}
