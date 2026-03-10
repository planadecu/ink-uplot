import { describe, it, expect } from 'vitest';
import { renderToImageData } from '../src/renderer.js';
import { pixelsToBraille } from '../src/braille.js';

describe('full pipeline: opts+data -> braille', () => {
  it('renders a recognizable chart as braille text', async () => {
    const canvasWidth = 80;
    const canvasHeight = 48;

    const opts = {
      width: canvasWidth,
      height: canvasHeight,
      series: [
        {},
        { stroke: '#ffffff', width: 2 },
      ],
      axes: [
        { show: false },
        { show: false },
      ],
    };

    const xs = Array.from({ length: 20 }, (_, i) => i);
    const ys = xs.map(x => Math.sin(x / 3) * 20 + 25);
    const data: [number[], number[]] = [xs, ys];

    const imageData = await renderToImageData(opts, data, canvasWidth, canvasHeight);
    const braille = pixelsToBraille(imageData, { threshold: 10 });

    const lines = braille.split('\n');
    expect(lines.length).toBe(12);
    for (const line of lines) {
      expect(line.length).toBe(40);
    }

    const nonBlank = braille.replace(/\u2800/g, '').replace(/\n/g, '');
    expect(nonBlank.length).toBeGreaterThan(0);
  });
});
