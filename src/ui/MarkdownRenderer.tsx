// src/ui/MarkdownRenderer.tsx
// Basic markdown renderer for terminal -- code blocks with syntax hint, bold, italic, lists
import React from 'react';
import { Text, Box } from 'ink';

// Simple keyword-based syntax detection
function detectLanguage(code: string): string {
  const firstLine = code.split('\n')[0].trim();
  if (firstLine.startsWith('#!/') || firstLine.startsWith('# ')) {
    if (code.includes('def ') || code.includes('import ')) return 'python';
    if (code.includes('echo ') || code.includes('ls ') || code.includes('grep ')) return 'bash';
  }
  if (code.includes('function ') || code.includes('const ') || code.includes('import ')) return 'typescript';
  if (code.includes('SELECT ') || code.includes('FROM ')) return 'sql';
  if (code.includes('<div') || code.includes('<span')) return 'html';
  return 'text';
}

function boldText(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1');
}

function renderLine(line: string, inCodeBlock: boolean, codeLang: string): React.ReactElement {
  // Code block start
  if (line.startsWith('```')) {
    const lang = line.slice(3).trim() || (inCodeBlock ? 'text' : 'text');
    if (inCodeBlock) {
      return React.createElement(Text, { dimColor: true, color: 'gray' }, '```');
    }
    return React.createElement(Text, { color: 'cyan', bold: true }, `▸  ${lang || 'code'}`);
  }

  if (inCodeBlock) {
    return React.createElement(Box, null,
      React.createElement(Text, { color: 'cyan' }, '  │ '),
      React.createElement(Text, { color: 'green' }, line || ' '),
    );
  }

  // Headings
  if (line.startsWith('# ')) {
    return React.createElement(Text, { bold: true, color: 'cyan' }, line.slice(2));
  }
  if (line.startsWith('## ')) {
    return React.createElement(Text, { bold: true, color: 'blue' }, line.slice(3));
  }
  if (line.startsWith('### ')) {
    return React.createElement(Text, { bold: true, color: 'magenta' }, line.slice(4));
  }

  // Bold text
  if (/\*\*(.+?)\*\*/.test(line) || /__(.+?)__/.test(line)) {
    return React.createElement(Text, null,
      line.split(/\*\*(.+?)\*\*/g).map((part, i) => {
        if (i % 2 === 1) {
          return React.createElement(Text, { bold: true, key: i }, part);
        }
        return React.createElement(Text, { key: i }, part);
      })
    );
  }

  // Lists
  if (/^[-*+]\s/.test(line)) {
    return React.createElement(Text, null, '  ' + line);
  }
  if (/^\d+\.\s/.test(line)) {
    return React.createElement(Text, null, '  ' + line);
  }

  // Blockquotes
  if (line.startsWith('> ')) {
    return React.createElement(Text, { color: 'gray', dimColor: true }, '  ' + line.slice(2));
  }

  // Horizontal rule
  if (line.startsWith('---') || line.startsWith('***')) {
    return React.createElement(Text, { color: 'gray' }, '  ' + line);
  }

  return React.createElement(Text, null, line);
}

interface MarkdownRendererProps {
  text: string;
  maxLines?: number;
}

export function MarkdownRenderer({ text, maxLines = 100 }: MarkdownRendererProps): React.ReactElement {
  const lines = text.split('\n').slice(0, maxLines);
  let inCode = false;
  const elements: React.ReactElement[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('```') && !inCode) {
      inCode = true;
    }
    elements.push(renderLine(lines[i], inCode, 'text'));
    if (lines[i].startsWith('```') && inCode && lines[i].slice(3).trim() !== lines[i].slice(3)) {
      inCode = false;
    }
    if (lines[i] === '```' && inCode) {
      inCode = false;
    }
  }

  if (lines.length >= maxLines) {
    elements.push(React.createElement(Text, { color: 'gray', dimColor: true, key: 'trunc' }, '  ... (truncated)'));
  }

  return React.createElement(Box, { flexDirection: 'column', key: 'md' }, ...elements);
}
