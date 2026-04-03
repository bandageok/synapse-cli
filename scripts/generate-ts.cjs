var fs = require('fs');
var html = fs.readFileSync('C:\\Users\\OK bandage\\Desktop\\新建 文本文档 (2).txt', 'utf-8');
var regex = /bgcolor="#([0-9a-fA-F]{6})"/g;
var colors = [];
var match;
while ((match = regex.exec(html)) !== null) colors.push(match[1]);

var grid = [];
for (var y = 0; y < 50; y++) {
  var row = [];
  for (var x = 0; x < 50; x++) {
    row.push(colors[y * 50 + x] || 'ffffff');
  }
  grid.push(row);
}

// Find bounding box
var minX = 50, maxX = 0, minY = 50, maxY = 0;
for (var y = 0; y < 50; y++) {
  for (var x = 0; x < 50; x++) {
    if (grid[y][x].toLowerCase() !== 'ffffff') {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

// Generate TypeScript component
var ts = '// src/ui/components/PixelLogo.tsx\n';
ts += '// Exact pixel art from pixel.png — monochrome with anti-aliasing\n';
ts += 'import React from \'react\';\n';
ts += 'import { Text, Box } from \'ink\';\n\n';
ts += '// Ink named colors mapped from grayscale brightness\n';
ts += '// Map: dark (#00-#1F) → black, mid-dark (#20-#3F) → black, mid (#40-#5F) → gray,\n';
ts += '// light-mid (#60-#7F) → gray, light (#80-#9F) → white, bright (#A0-#DF) → white, near-white (#E0-#FF) → dim\n\n';

ts += 'function rgbToInkColor(hex: string): string | undefined {\n';
ts += '  const r = parseInt(hex.slice(0, 2), 16);\n';
ts += '  const g = parseInt(hex.slice(2, 4), 16);\n';
ts += '  const b = parseInt(hex.slice(4, 6), 16);\n';
ts += '  const v = (r + g + b) / 3;\n';
ts += '  if (v < 30) return \'black\';\n';
ts += '  if (v < 100) return \'black\';\n';
ts += '  if (v < 160) return \'gray\';\n';
ts += '  if (v < 220) return \'gray\';\n';
ts += '  if (v < 240) return \'white\';\n';
ts += '  if (v < 248) return \'white\';\n';
ts += '  return undefined; // near-white → transparent\n';
ts += '}\n\n';

ts += '// Exact pixel grid from HTML table (50x50, content at y:' + minY + '-' + maxY + ', x:' + minX + '-' + maxX + ')\n';
ts += 'const ROWS: string[][] = ' + JSON.stringify(grid, null, 2) + ';\n\n';

// Generate compact representation: row-by-row color data
ts += 'export function PixelLogo(): React.ReactElement {\n';
ts += '  const elements: React.ReactElement[] = [];\n';
ts += '  for (let y = 0; y < ROWS.length; y++) {\n';
ts += '    const row = [];\n';
ts += '    let i = 0;\n';
ts += '    while (i < ROWS[y].length) {\n';
ts += '      const color = ROWS[y][i].toLowerCase();\n';
ts += '      let count = 1;\n';
ts += '      while (i + count < ROWS[y].length && ROWS[y][i + count].toLowerCase() === color) count++;\n';
ts += '      if (color === \'ffffff\') {\n';
ts += '        row.push(React.createElement(Text, { key: `s-${y}-${i}` }, \' \'.repeat(count)));\n';
ts += '      } else {\n';
ts += '        const inkColor = rgbToInkColor(color);\n';
ts += '        row.push(React.createElement(Text, { key: `${color}-${y}-${i}`, color: inkColor as any }, \'\\u2588\'.repeat(count)));\n';
ts += '      }\n';
ts += '      i += count;\n';
ts += '    }\n';
ts += '    elements.push(React.createElement(Box, { key: y }, ...row));\n';
ts += '  }\n';
ts += '  return React.createElement(Box, { flexDirection: \'column\' as const, paddingLeft: 2 }, ...elements);\n';
ts += '}\n';

fs.writeFileSync('C:\\Users\\OK bandage\\Desktop\\c.c.claw\\src\\ui\\components\\PixelLogo.tsx', ts, 'utf-8');
console.log('Generated PixelLogo.tsx');
