// src/ui/components/PixelLogo.tsx
// Pixel art C.C.Claw logo derived from pixel.png
// Claude Code style — multi-color terminal pixels
import React from 'react';
import { Text, Box } from 'ink';

// Colors from pixel.png
const OUTLINE = '#6b1d00';  // Dark brown-red outline
const FACE_FILL = '#ea7441'; // Light orange face
const EYES_MOUTH = '#5a1a00'; // Dark eyes + mouth
const EYE_HL = '#ffffff';     // Eye highlights
const NOSE = '#c45d3e';       // Light nose

// Pixel grid: 0=space, 1=outline, 2=fill, 3=eyes/mouth, 4=eyeHighlight, 5=nose
const LOGO: number[][] = [
  [0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,3,3,3,2,2,2,2,3,3,3,2,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,3,4,3,2,2,2,2,3,4,3,2,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,3,3,3,2,2,2,2,3,3,3,2,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,2,2,2,2,5,5,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,2,2,2,5,5,5,5,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,2,2,2,2,5,5,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,2,3,2,3,2,2,2,3,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,2,2,3,2,3,3,3,2,3,2,2,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,2,2,2,3,3,3,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

const CHAR_MAP: Record<number, { char: string; color: string }> = {
  0: { char: ' ', color: '' },
  1: { char: '\u2588', color: OUTLINE },
  2: { char: '\u2588', color: FACE_FILL },
  3: { char: '\u2588', color: EYES_MOUTH },
  4: { char: '\u2588', color: EYE_HL },
  5: { char: '\u2588', color: NOSE },
};

// Ink terminal character width compensation (CJK chars are 2x width)
// Full block \u2588 is 1 char width, space is 1 char width

function renderLogoLine(row: number[]): React.ReactElement[] {
  const elements: React.ReactElement[] = [];
  let i = 0;
  while (i < row.length) {
    const cell = row[i];
    let count = 1;
    while (i + count < row.length && row[i + count] === cell) count++;
    const { char, color } = CHAR_MAP[cell] || CHAR_MAP[0];
    if (cell === 0) {
      elements.push(React.createElement(Text, { key: `s-${i}` }, ' '.repeat(count)));
    } else {
      elements.push(React.createElement(Text, {
        key: `${cell}-${i}`,
        color: color as any,
        ...(cell === 1 ? { bold: true } : {}),
      }, char.repeat(count)));
    }
    i += count;
  }
  return elements;
}

export function PixelLogo(): React.ReactElement {
  return React.createElement(Box, { flexDirection: 'column' as const, paddingLeft: 2 },
    ...LOGO.map((row, i) => React.createElement(Text, { key: i }, ...renderLogoLine(row)))
  );
}
