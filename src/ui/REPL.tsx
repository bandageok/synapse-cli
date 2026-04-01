// src/ui/REPL.tsx
import React, { useState, useCallback, useRef } from 'react';
import { render, Text, Box, useInput, useApp } from 'ink';
import { createEngine } from '../core/Engine.js';
import { CommandRegistry } from '../commands/registry.js';
import {
  helpCommand, exitCommand, clearCommand, modelCommand,
  memoryCommand, soulCommand, doctorCommand, configCommand,
  sessionCommand, costCommand, compactCommand, initCommand,
  resumeCommand, historyCommand, soulEditCommand,
} from '../commands/builtin/index.js';
import type { Message, EngineEvent } from '../core/types.js';

interface REPLDeps {
  provider: any;
  tools: any;
  context: any;
  compressor: any;
  hooks: any;
  errorRecovery: any;
  dynamicReminder: any;
  dataDir: string;
  sessionStore?: any;
}

export function launchREPL(deps: REPLDeps) {
  const { provider, tools, context, compressor, hooks, errorRecovery, dataDir, sessionStore } = deps;
  const sessionId = `session-${Date.now()}`;

  // Setup command registry
  const registry = new CommandRegistry();
  for (const cmd of [helpCommand, exitCommand, clearCommand, modelCommand, memoryCommand, soulCommand, doctorCommand, configCommand, sessionCommand, costCommand, compactCommand, initCommand, resumeCommand, historyCommand, soulEditCommand]) {
    registry.register(cmd);
  }

  function REPL() {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [output, setOutput] = useState<string[]>([]);
    const [isThinking, setIsThinking] = useState(false);
    const [model, setModelState] = useState('xiaomi/mimo-v2-pro');
    const allMessagesRef = useRef<Message[]>([]);
    const { exit } = useApp();

    const addOutput = useCallback((line: string) => {
      setOutput(prev => [...prev.slice(-40), line]);
    }, []);

    const runEngine = useCallback(async (allMessages: Message[]) => {
      try {
        for await (const event of createEngine(allMessages, provider, tools, context, hooks, compressor, errorRecovery)) {
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
              addOutput(`🔧 ${event.tool}`);
              break;
            case 'tool_result':
              addOutput(`  → ${event.output.slice(0, 150)}`);
              break;
            case 'compressed':
              addOutput(`📦 Compressed: ${event.tokensBefore} → ${event.tokensAfter} tokens`);
              break;
            case 'end_turn':
              setIsThinking(false);
              // Auto-save session
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
              break;
          }
        }
      } catch (err: any) {
        addOutput(`❌ ${err.message}`);
        setIsThinking(false);
      }
    }, [addOutput]);

    useInput(async (char, key) => {
      if (isThinking) return;

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
            messages,
            resetMessages: () => setMessages([]),
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
      } else if (key.backspace || key.delete) {
        setInput(prev => prev.slice(0, -1));
      } else if (key.ctrl && char === 'c') {
        exit();
      } else if (!key.ctrl && !key.meta && char) {
        setInput(prev => prev + char);
      }
    });

    return React.createElement(Box, { flexDirection: 'column', height: '100%' },
      React.createElement(Box, { marginBottom: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, '⚡ C.C.Claw v0.2.0'),
        React.createElement(Text, { color: 'gray' }, ` — ${provider.name} / ${model}`),
        React.createElement(Text, { color: 'gray' }, ' | /help for commands'),
      ),
      ...output.map((line, i) =>
        React.createElement(Text, {
          key: `${i}-${line.slice(0, 20)}`,
          color: line.startsWith('>') ? 'green'
            : line.startsWith('🤖') ? 'white'
            : line.startsWith('🔧') ? 'yellow'
            : line.startsWith('❌') ? 'red'
            : line.startsWith('📦') ? 'blue'
            : line.startsWith('/') || line.startsWith('  ') ? 'gray'
            : 'gray',
        }, line)
      ),
      React.createElement(Box, { marginTop: 1 },
        React.createElement(Text, { color: 'green' }, '> '),
        React.createElement(Text, null, input),
        isThinking && React.createElement(Text, { color: 'yellow' }, ' ⏳'),
      ),
    );
  }

  const { unmount, waitUntilExit } = render(React.createElement(REPL));

  return waitUntilExit();
}
