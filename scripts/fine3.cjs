var fs = require('fs');
var html = fs.readFileSync('C:\\Users\\OK bandage\\Desktop\\新建 文本文档 (2).txt', 'utf-8');
var regex = /bgcolor="#([0-9a-fA-F]{6})"/g;
var colors = [];
var match;
while ((match = regex.exec(html)) !== null) colors.push(match[1]);

var W = 50, H = 50;
var grid = [];
for (var y = 0; y < H; y++) {
  var row = [];
  for (var x = 0; x < W; x++) {
    row.push(colors[y * W + x] || 'ffffff');
  }
  grid.push(row);
}

var dW = 25, dH = 25;
var sX = W / dW, sY = H / dH;
var dst = [];
for (var dy = 0; dy < dH; dy++) {
  var row = [];
  for (var dx = 0; dx < dW; dx++) {
    var sumR = 0, sumG = 0, sumB = 0, c = 0;
    for (var sy = 0; sy < 3; sy++) {
      for (var sx = 0; sx < 3; sx++) {
        var px = Math.floor(dx * sX) + sx;
        var py = Math.floor(dy * sY) + sy;
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        var h = grid[py][px];
        sumR += parseInt(h.slice(0, 2), 16);
        sumG += parseInt(h.slice(2, 4), 16);
        sumB += parseInt(h.slice(4, 6), 16);
        c++;
      }
    }
    if (c > 0) row.push([Math.round(sumR/c), Math.round(sumG/c), Math.round(sumB/c)]);
    else row.push([255, 255, 255]);
  }
  dst.push(row);
}

function toInk(r, g, b) {
  var v = (r + g + b) / 3;
  if (v < 120) return '"black"';
  if (v < 210) return '"gray"';
  if (v < 245) return '"white"';
  return 'null';
}

// Preview
console.log('--- Preview ---');
for (var y = 0; y < dH; y++) {
  var line = '';
  for (var x = 0; x < dW; x++) {
    var p = dst[y][x];
    var v = (p[0] + p[1] + p[2]) / 3;
    if (v < 120) line += '\u2588';
    else if (v < 210) line += '\u2591';
    else if (v < 245) line += '.';
    else line += ' ';
  }
  console.log(line);
}

// Write TS
var blk = String.fromCharCode(0x2588);
var ts = '// src/ui/components/PixelLogo.tsx\n';
ts += '// 25x25 pixel art from pixel.png\n';
ts += 'import React from "react";\n';
ts += 'import { Text, Box } from "ink";\n\n';
ts += 'const ROWS: number[][][] = ' + JSON.stringify(dst) + ';\n\n';
ts += 'function toInk(r: number, g: number, b: number): string | null {\n';
ts += '  const v = (r + g + b) / 3;\n';
ts += '  if (v < 120) return "black";\n';
ts += '  if (v < 210) return "gray";\n';
ts += '  if (v < 245) return "white";\n';
ts += '  return null;\n';
ts += '}\n\n';
ts += 'export function PixelLogo(): React.ReactElement {\n';
ts += '  return React.createElement(Box, { flexDirection: "column" as const, paddingLeft: 2 },\n';
ts += '    ...ROWS.map((row, y) => {\n';
ts += '      const elements: React.ReactElement[] = [];\n';
ts += '      let i = 0;\n';
ts += '      while (i < row.length) {\n';
ts += '        const p = row[i];\n';
ts += '        const c = toInk(p[0], p[1], p[2]);\n';
ts += '        let count = 1;\n';
ts += '        while (i + count < row.length) {\n';
ts += '          const np = row[i + count];\n';
ts += '          const nc = toInk(np[0], np[1], np[2]);\n';
ts += '          if (c === nc) count++;\n';
ts += '          else break;\n';
ts += '        }\n';
ts += '        if (!c) {\n';
ts += '          elements.push(React.createElement(Text, { key: "s" + y + "-" + i }, " ".repeat(count)));\n';
ts += '        } else {\n';
ts += "          elements.push(React.createElement(Text, { key: c + '-' + y + '-' + i, color: c as any, bold: c === 'black' },";
ts += ' "' + blk + '".repeat(count)));\n';
ts += '        }\n';
ts += '        i += count;\n';
ts += '      }\n';
ts += '      return React.createElement(Box, { key: y }, ...elements);\n';
ts += '    }),\n';
ts += '  );\n';
ts += '}\n';

fs.writeFileSync('C:\\Users\\OK bandage\\Desktop\\c.c.claw\\src\\ui\\components\\PixelLogo.tsx', ts, 'utf-8');
console.log('\nGenerated 25x25 PixelLogo');
