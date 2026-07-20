import React from 'react';
import { Box, Text } from 'ink';

type MarkdownBlock =
  | { kind: 'code'; language: string; lines: string[] }
  | { kind: 'line'; text: string };

export interface MarkdownRendererProps {
  text: string;
  maxLines?: number;
}

export function parseMarkdownBlocks(text: string, maxLines = 200): { blocks: MarkdownBlock[]; truncated: boolean } {
  const sourceLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines = sourceLines.slice(0, maxLines);
  const blocks: MarkdownBlock[] = [];
  let code: { language: string; lines: string[] } | null = null;

  for (const line of lines) {
    const fence = line.match(/^\s*```\s*([^\s`]*)/);
    if (fence) {
      if (code) {
        blocks.push({ kind: 'code', language: code.language, lines: code.lines });
        code = null;
      } else {
        code = { language: fence[1] || 'code', lines: [] };
      }
      continue;
    }
    if (code) code.lines.push(line);
    else blocks.push({ kind: 'line', text: line });
  }
  if (code) blocks.push({ kind: 'code', language: code.language, lines: code.lines });
  return { blocks, truncated: sourceLines.length > maxLines };
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const tokens = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).filter(Boolean);
  return tokens.map((token, index) => {
    if (token.startsWith('`') && token.endsWith('`')) {
      return React.createElement(Text, { key: `${keyPrefix}-code-${index}`, color: 'cyan' }, token.slice(1, -1));
    }
    if (token.startsWith('**') && token.endsWith('**')) {
      return React.createElement(Text, { key: `${keyPrefix}-bold-${index}`, bold: true }, token.slice(2, -2));
    }
    return React.createElement(Text, { key: `${keyPrefix}-text-${index}` }, token);
  });
}

function renderLine(text: string, index: number): React.ReactElement {
  const key = `line-${index}`;
  const heading = text.match(/^(#{1,3})\s+(.+)$/);
  if (heading) {
    return React.createElement(Box, { key, marginTop: index > 0 ? 1 : 0 },
      React.createElement(Text, { bold: true, color: heading[1].length === 1 ? 'cyan' : undefined },
        ...renderInline(heading[2], key),
      ),
    );
  }

  const bullet = text.match(/^\s*[-*+]\s+(.+)$/);
  if (bullet) {
    return React.createElement(Box, { key, paddingLeft: 1 },
      React.createElement(Text, { color: 'cyan' }, '• '),
      React.createElement(Text, null, ...renderInline(bullet[1], key)),
    );
  }

  const numbered = text.match(/^\s*(\d+[.)])\s+(.+)$/);
  if (numbered) {
    return React.createElement(Box, { key, paddingLeft: 1 },
      React.createElement(Text, { color: 'cyan' }, numbered[1] + ' '),
      React.createElement(Text, null, ...renderInline(numbered[2], key)),
    );
  }

  const quote = text.match(/^\s*>\s?(.*)$/);
  if (quote) {
    return React.createElement(Box, { key, paddingLeft: 1 },
      React.createElement(Text, { color: 'gray' }, '│ '),
      React.createElement(Text, { color: 'gray' }, ...renderInline(quote[1], key)),
    );
  }

  if (/^\s*(---+|\*\*\*+)\s*$/.test(text)) {
    return React.createElement(Text, { key, color: 'gray', dimColor: true }, '─'.repeat(36));
  }

  if (!text) return React.createElement(Text, { key }, ' ');
  return React.createElement(Text, { key, wrap: 'wrap' }, ...renderInline(text, key));
}

function renderCodeBlock(block: Extract<MarkdownBlock, { kind: 'code' }>, index: number): React.ReactElement {
  return React.createElement(Box, { key: `code-${index}`, flexDirection: 'column', marginY: 1 },
    React.createElement(Text, { color: 'cyan', dimColor: true }, `┌─ ${block.language}`),
    ...(block.lines.length > 0 ? block.lines : ['']).map((line, lineIndex) =>
      React.createElement(Box, { key: `code-${index}-${lineIndex}` },
        React.createElement(Text, { color: 'cyan', dimColor: true }, '│ '),
        React.createElement(Text, { wrap: 'wrap' }, line || ' '),
      ),
    ),
    React.createElement(Text, { color: 'cyan', dimColor: true }, '└─'),
  );
}

export function MarkdownRenderer({ text, maxLines = 200 }: MarkdownRendererProps): React.ReactElement {
  const { blocks, truncated } = parseMarkdownBlocks(text, maxLines);
  const elements = blocks.map((block, index) => block.kind === 'code'
    ? renderCodeBlock(block, index)
    : renderLine(block.text, index));
  if (truncated) {
    elements.push(React.createElement(Text, { key: 'truncated', color: 'gray', dimColor: true }, '… response shortened in this view'));
  }
  return React.createElement(Box, { flexDirection: 'column' }, ...elements);
}
