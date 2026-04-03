// src/ui/components/PixelLogo.tsx
// Pixel art 16x16 (downsampled from 50x50)
import React from "react";
import { Text, Box } from "ink";

function rgbToInk(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const v = (r + g + b) / 3;
  if (v < 128) return "black";
  if (v < 200) return "gray";
  return ""; // near-white = blank
}

const ROWS: string[][] = [["ffffff","fafafa","c8c8c8","f3f3f3","ffffff","ffffff","ffffff","ffffff","ffffff","ffffff","fefefe","ffffff","ffffff","ffffff","ffffff","ffffff"],["ffffff","efefef","353535","666666","d2d2d2","ffffff","ffffff","ffffff","ffffff","ffffff","9c9c9c","5d5d5d","cdcdcd","ffffff","ffffff","ffffff"],["ffffff","f5f5f5","3d3d3d","0a0a0a","313131","d4d4d4","fefefe","f9f9f9","f9f9f9","e6e6e6","8a8a8a","040404","343434","e1e1e1","ffffff","ffffff"],["fefefe","f3f3f3","525252","000000","000000","6c6c6c","b2b2b2","a5a5a5","646464","2f2f2f","121212","030303","020202","888888","bababa","ffffff"],["b3b3b3","8e8e8e","363636","060606","3a3a3a","c8c8c8","6f6f6f","8d8d8d","444444","000000","000000","000000","000000","111111","212121","b0b0b0"],["999999","8b8b8b","767676","414141","c1c1c1","dcdcdc","b8b8b8","a8a8a8","080808","000000","000000","000000","000000","000000","000000","808080"],["a8a8a8","343434","757575","919191","e6e6e6","e3e3e3","c5c5c5","898989","000000","000000","000000","000000","000000","000000","0f0f0f","b2b2b2"],["b9b9b9","a5a5a5","838383","7f7f7f","e8e8e8","ededed","b2b2b2","cdcdcd","000000","000000","000000","000000","000000","000000","080808","b8b8b8"],["cecece","626262","191919","7d7d7d","bbbbbb","c6c6c6","c2c2c2","aeaeae","959595","000000","000000","000000","000000","000000","282828","dbdbdb"],["ffffff","747474","3a3a3a","494949","b5b5b5","949494","a3a3a3","bdbdbd","3c3c3c","000000","000000","000000","000000","000000","666666","ffffff"],["ffffff","a9a9a9","737373","1c1c1c","646464","868686","616161","dcdcdc","000000","000000","000000","000000","000000","000000","909090","ffffff"],["ffffff","d0d0d0","757575","3d3d3d","171717","b4b4b4","dcdcdc","e8e8e8","262626","000000","0a0a0a","090909","252525","1e1e1e","cbcbcb","ffffff"],["ffffff","f8f8f8","848484","b4b4b4","3b3b3b","484848","3a3a3a","595959","2e2e2e","000000","585858","919191","b1b1b1","7c7c7c","fdfdfd","ffffff"],["ffffff","ffffff","efefef","f4f4f4","6c6c6c","868686","1f1f1f","000000","000000","292929","dfdfdf","ffffff","f3f3f3","efefef","ffffff","ffffff"],["ffffff","ffffff","ffffff","ffffff","ededed","f4f4f4","b9b9b9","979797","949494","bebebe","ffffff","ffffff","ffffff","ffffff","ffffff","ffffff"],["ffffff","ffffff","ffffff","ffffff","ffffff","ffffff","ffffff","ffffff","ffffff","ffffff","ffffff","ffffff","ffffff","ffffff","ffffff","ffffff"]];

export function PixelLogo(): React.ReactElement {
  return React.createElement(Box, { flexDirection: "column" as const, paddingLeft: 2 },
    ...ROWS.map((row, y) => {
      const elements: React.ReactElement[] = [];
      let i = 0;
      while (i < row.length) {
        const hex = row[i].toLowerCase();
        let count = 1;
        while (i + count < row.length && row[i + count].toLowerCase() === hex) count++;
        if (hex === "ffffff") {
          elements.push(React.createElement(Text, { key: "s-" + y + "-" + i }, " ".repeat(count)));
        } else {
          const c = rgbToInk(hex);
          if (c) {
            elements.push(React.createElement(Text, { key: hex + "-" + y + "-" + i, color: c as any, bold: true }, "\u2588".repeat(count)));
          } else {
            elements.push(React.createElement(Text, { key: "f-" + y + "-" + i }, " ".repeat(count)));
          }
        }
        i += count;
      }
      return React.createElement(Box, { key: y }, ...elements);
    }),
  );
}
