// src/ui/components/PixelLogo.tsx
// Pixel art C.C.Claw logo (face outline + eyes + smile) — Claude Code style
import React from 'react';
import { Text, Box } from 'ink';

const FACE_FILL = '#e5713e';
const OUTLINE = '#6b1d00';

// 1 = outline, 0 = fill, sp = space
const LOGO = [
  [0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0],
  [0,1,1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
  [0,1,1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0],
  [1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0],
  [0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0],
  [0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0],
  [0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0],
  [0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
  [0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

function renderLogoLine(row: number[]): React.ReactElement[] {
  const elements: React.ReactElement[] = [];
  // Group consecutive same-type blocks
  const segments: { type: number; count: number }[] = [];
  for (const cell of row) {
    if (segments.length > 0 && segments[segments.length - 1].type === cell) {
      segments[segments.length - 1].count++;
    } else {
      segments.push({ type: cell, count: 1 });
    }
  }
  let idx = 0;
  for (const seg of segments) {
    if (seg.type === 1) {
      elements.push(React.createElement(Text, { key: `o-${idx}`, color: OUTLINE as any, bold: true }, '\u2588'.repeat(seg.count)));
    } else if (seg.type === 0) {
      elements.push(React.createElement(Text, { key: `f-${idx}`, color: FACE_FILL as any }, '\u2593'.repeat(seg.count)));
    } else {
      elements.push(React.createElement(Text, { key: `s-${idx}` }, ' '.repeat(seg.count)));
    }
    idx += seg.count;
  }
  return elements;
}

export function PixelLogo(): React.ReactElement {
  return React.createElement(Box, { flexDirection: 'column' as const },
    ...LOGO.map((row, i) => React.createElement(Box, { key: i }, ...renderLogoLine(row)))
  );
}
