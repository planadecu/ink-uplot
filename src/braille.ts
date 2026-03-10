import type { BrailleOptions } from './types.js';

const BRAILLE_MAP: [dx: number, dy: number, bit: number][] = [
  [0, 0, 0x01], [0, 1, 0x02], [0, 2, 0x04], [0, 3, 0x40],
  [1, 0, 0x08], [1, 1, 0x10], [1, 2, 0x20], [1, 3, 0x80],
];

export function pixelsToBraille(
  imageData: { data: Uint8ClampedArray; width: number; height: number },
  opts: BrailleOptions = {},
): string {
  const { threshold = 128, invert = false } = opts;
  const { width, height, data } = imageData;
  const cols = Math.floor(width / 2);
  const rows = Math.floor(height / 4);
  const lines: string[] = [];

  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < cols; col++) {
      let cp = 0x2800;
      const px = col * 2;
      const py = row * 4;

      for (const [dx, dy, bit] of BRAILLE_MAP) {
        const idx = ((py + dy) * width + (px + dx)) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        const active = invert
          ? luminance < threshold
          : luminance > threshold;
        if (active) cp |= bit;
      }

      line += String.fromCharCode(cp);
    }
    lines.push(line);
  }

  return lines.join('\n');
}
