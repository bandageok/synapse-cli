// Convert pixel.png to terminal ASCII art logo
const sharp = await import('sharp');
const { readFileSync } = await import('fs');

const img = sharp('C:\\Users\\OK bandage\\Desktop\\pixel.png');
const metadata = await img.metadata();
console.log('Source:', metadata.width, 'x', metadata.height);

// Get raw pixels
const data = await img.ensureAlpha().raw().toBuffer();
const w = metadata.width;
const h = metadata.height;

// Use 2 columns per terminal char (half-block for vertical res)
const termW = 24;
const termH = Math.ceil(h / 2);

// Terminal characters for different shades
const CHARS = [' ', '\u2591', '\u2592', '\u2593', '\u2588'];

// Build output line by line (2px rows per terminal char)
for (let ty = 0; ty < termH; ty++) {
  let line = '';
  for (let tx = 0; tx < w; tx++) {
    // Average the top and/or bottom pixel
    let totalAlpha = 0, totalLight = 0;
    let count = 0;
    for (let dy = 0; dy < 2; dy++) {
      const py = ty * 2 + dy;
      if (py >= h) continue;
      const idx = (py * w + tx) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      totalAlpha += a;
      totalLight += (r + g + b) / 3;
      count++;
    }
    const avgLight = count > 0 ? totalLight / count : 255;
    const avgAlpha = count > 0 ? totalAlpha / count : 0;
    
    if (avgAlpha < 128) {
      line += ' ';
    } else {
      // Map lightness to character
      const idx = Math.floor((1 - avgLight / 255) * (CHARS.length - 1));
      line += CHARS[Math.min(idx, CHARS.length - 1)];
    }
  }
  console.log(line);
}
