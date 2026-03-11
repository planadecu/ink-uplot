import { describe, it, expect } from 'vitest';
import { pixelsToTerminal } from '../src/chafa.js';

describe('pixelsToTerminal', () => {
  it('converts a solid white image to non-empty ANSI output', async () => {
    const w = 16, h = 16;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
    }
    const result = await pixelsToTerminal({ data, width: w, height: h }, { width: 4, height: 2 });
    expect(result.length).toBeGreaterThan(0);
  });

  it('converts a solid black image without crashing', async () => {
    const w = 16, h = 16;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i + 3] = 255; // opaque black
    }
    const result = await pixelsToTerminal({ data, width: w, height: h }, { width: 4, height: 2 });
    expect(typeof result).toBe('string');
  });

  it('respects output dimensions', async () => {
    const w = 32, h = 32;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 128; data[i + 1] = 64; data[i + 2] = 200; data[i + 3] = 255;
    }
    const result = await pixelsToTerminal({ data, width: w, height: h }, { width: 8, height: 4 });
    const lines = result.split('\n').filter(l => l.length > 0);
    expect(lines.length).toBeLessThanOrEqual(4);
  });
});
