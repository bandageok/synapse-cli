// src/ui/REPL.tsx
import React, { useState, useCallback } from 'react';
import { render, Text, Box, useInput, useApp } from 'ink';
import { createEngine } from '../core/Engine.js';
import type { Message } from '../core/types.js';

interface REPLDeps {
  provider: any;
  tools: any;
  context: any;
  compressor: any;
  hooks: any;
  errorRecovery: any;
  dynamicReminder: any;
}

export function launchREPL(deps: REPLDeps) {
  const { provider, tools, context, compressor, hooks, errorRecovery } = deps;

  function REPL() {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [output, setOutput] = useState<string[]>([]);
    const [isThinking, setIsThinking] = useState(false);
    const { exit } = useApp();

    const addOutput = useCallback((line: string) => {
      setOutput(prev => [...prev.slice(-30), line]);
    }, []);

    useInput(async (char, key) => {
      if (isThinking) return;

      if (key.return) {
        const trimmed = input.trim();
        if (!trimmed) return;

        if (trimmed === '/exit' || trimmed === '/quit') {
          exit();
          return;
        }
        if (trimmed === '/clear') {
          setOutput([]);
          setInput('');
          return;
        }

        const userMsg: Message = { role: 'user', content: trimmed };
        setMessages(prev => {
          const allMessages = [...prev, userMsg];
          // Kick off engine with captured messages
          runEngine(allMessages);
          return allMessages;
        });
        addOutput(`> ${trimmed}`);
        setInput('');
        setIsThinking(true);
      } else if (key.backspace || key.delete) {
        setInput(prev => prev.slice(0, -1));
      } else if (key.ctrl && char === 'c') {
        exit();
      } else if (!key.ctrl && !key.meta && char) {
        setInput(prev => prev + char);
      }
    });

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

    return React.createElement(Box, { flexDirection: 'column', height: '100%' },
      React.createElement(Box, { marginBottom: 1 },
        React.createElement(Text, { bold: true, color: 'cyan' }, '⚡ C.C.Claw v0.1.0'),
        React.createElement(Text, { color: 'gray' }, ` — ${provider.name}`),
      ),
      ...output.map((line, i) =>
        React.createElement(Text, {
          key: `${i}-${line.slice(0, 20)}`,
          color: line.startsWith('>') ? 'green'
            : line.startsWith('🤖') ? 'white'
            : line.startsWith('🔧') ? 'yellow'
            : line.startsWith('❌') ? 'red'
            : line.startsWith('📦') ? 'blue'
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
