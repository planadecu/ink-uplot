import { describe, it, expect } from 'vitest';
import { sampleCellColors } from '../src/color-sampler.js';

describe('sampleCellColors', () => {
  function makeImageData(width: number, height: number, fill: [number, number, number, number] = [0, 0, 0, 255]) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = fill[3];
    }
    return { data, width, height };
  }

  it('returns null color for all-black cells', () => {
    const img = makeImageData(2, 4, [0, 0, 0, 255]);
    const result = sampleCellColors(img, 128);
    expect(result[0][0]).toBeNull();
  });

  it('returns "red" for bright red pixels', () => {
    const img = makeImageData(2, 4, [255, 0, 0, 255]);
    const result = sampleCellColors(img, 10);
    expect(result[0][0]).toBe('red');
  });

  it('returns "green" for bright green pixels', () => {
    const img = makeImageData(2, 4, [0, 255, 0, 255]);
    const result = sampleCellColors(img, 10);
    expect(result[0][0]).toBe('green');
  });

  it('returns "blue" for bright blue pixels', () => {
    const img = makeImageData(2, 4, [0, 100, 255, 255]);
    const result = sampleCellColors(img, 10);
    expect(result[0][0]).toBe('blue');
  });

  it('returns "white" for white pixels', () => {
    const img = makeImageData(2, 4, [255, 255, 255, 255]);
    const result = sampleCellColors(img, 10);
    expect(result[0][0]).toBe('white');
  });

  it('returns "yellow" for yellow pixels', () => {
    const img = makeImageData(2, 4, [255, 255, 0, 255]);
    const result = sampleCellColors(img, 10);
    expect(result[0][0]).toBe('yellow');
  });

  it('returns "cyan" for cyan pixels', () => {
    const img = makeImageData(2, 4, [0, 255, 255, 255]);
    const result = sampleCellColors(img, 10);
    expect(result[0][0]).toBe('cyan');
  });

  it('returns "magenta" for magenta pixels', () => {
    const img = makeImageData(2, 4, [255, 0, 255, 255]);
    const result = sampleCellColors(img, 10);
    expect(result[0][0]).toBe('magenta');
  });

  it('returns correct dimensions', () => {
    const img = makeImageData(6, 8, [255, 0, 0, 255]);
    const result = sampleCellColors(img, 10);
    expect(result.length).toBe(2);
    expect(result[0].length).toBe(3);
  });
});
