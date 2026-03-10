import { describe, it, expect } from 'vitest';
import { pixelsToBraille } from '../src/braille.js';

describe('pixelsToBraille', () => {
  function makeImageData(pixels: boolean[][], width: number, height: number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const on = pixels[y]?.[x] ?? false;
        const v = on ? 255 : 0;
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 255;
      }
    }
    return { data, width, height } as ImageData;
  }

  it('returns empty braille for all-black 2x4 image', () => {
    const img = makeImageData(
      Array.from({ length: 4 }, () => [false, false]),
      2, 4,
    );
    const result = pixelsToBraille(img, { threshold: 128 });
    expect(result).toBe('\u2800');
  });

  it('returns full braille for all-white 2x4 image', () => {
    const img = makeImageData(
      Array.from({ length: 4 }, () => [true, true]),
      2, 4,
    );
    const result = pixelsToBraille(img, { threshold: 128 });
    expect(result).toBe('\u28FF');
  });

  it('encodes top-left dot only', () => {
    const pixels = Array.from({ length: 4 }, () => [false, false]);
    pixels[0][0] = true;
    const img = makeImageData(pixels, 2, 4);
    const result = pixelsToBraille(img, { threshold: 128 });
    expect(result).toBe(String.fromCharCode(0x2800 + 0x01));
  });

  it('encodes top-right dot only', () => {
    const pixels = Array.from({ length: 4 }, () => [false, false]);
    pixels[0][1] = true;
    const img = makeImageData(pixels, 2, 4);
    const result = pixelsToBraille(img, { threshold: 128 });
    expect(result).toBe(String.fromCharCode(0x2800 + 0x08));
  });

  it('encodes bottom-left dot only', () => {
    const pixels = Array.from({ length: 4 }, () => [false, false]);
    pixels[3][0] = true;
    const img = makeImageData(pixels, 2, 4);
    const result = pixelsToBraille(img, { threshold: 128 });
    expect(result).toBe(String.fromCharCode(0x2800 + 0x40));
  });

  it('encodes bottom-right dot only', () => {
    const pixels = Array.from({ length: 4 }, () => [false, false]);
    pixels[3][1] = true;
    const img = makeImageData(pixels, 2, 4);
    const result = pixelsToBraille(img, { threshold: 128 });
    expect(result).toBe(String.fromCharCode(0x2800 + 0x80));
  });

  it('handles multiple cells in a row', () => {
    const pixels = Array.from({ length: 4 }, () => [false, false, false, false]);
    pixels[0][0] = true;
    pixels[0][2] = true;
    const img = makeImageData(pixels, 4, 4);
    const result = pixelsToBraille(img, { threshold: 128 });
    const expected = String.fromCharCode(0x2801) + String.fromCharCode(0x2801);
    expect(result).toBe(expected);
  });

  it('handles multiple rows', () => {
    const pixels = Array.from({ length: 8 }, () => [false, false]);
    pixels[0][0] = true;
    pixels[4][0] = true;
    const img = makeImageData(pixels, 2, 8);
    const result = pixelsToBraille(img, { threshold: 128 });
    const expected = String.fromCharCode(0x2801) + '\n' + String.fromCharCode(0x2801);
    expect(result).toBe(expected);
  });

  it('respects invert option', () => {
    const img = makeImageData(
      Array.from({ length: 4 }, () => [true, true]),
      2, 4,
    );
    const result = pixelsToBraille(img, { threshold: 128, invert: true });
    expect(result).toBe('\u2800');
  });

  it('handles threshold correctly', () => {
    const data = new Uint8ClampedArray(2 * 4 * 4);
    data[0] = 128; data[1] = 128; data[2] = 128; data[3] = 255;
    const img = { data, width: 2, height: 4 } as ImageData;
    const result = pixelsToBraille(img, { threshold: 128 });
    expect(result).toBe('\u2800');
  });
});
