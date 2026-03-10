import { describe, it, expect } from 'vitest';
import { renderToImageData } from '../src/renderer.js';

describe('renderToImageData', () => {
  it('renders a simple line chart without crashing', async () => {
    const opts = {
      width: 200,
      height: 100,
      series: [
        {},
        { stroke: 'red' },
      ],
    };
    const data: [number[], number[]] = [
      [1, 2, 3, 4, 5],
      [10, 20, 15, 25, 30],
    ];

    const imageData = await renderToImageData(opts, data, 200, 100);

    expect(imageData).toBeDefined();
    expect(imageData.width).toBe(200);
    expect(imageData.height).toBe(100);
    expect(imageData.data.length).toBe(200 * 100 * 4);
  });

  it('canvas contains non-zero pixels after rendering', async () => {
    const opts = {
      width: 200,
      height: 100,
      series: [
        {},
        { stroke: 'blue', width: 2 },
      ],
    };
    const data: [number[], number[]] = [
      [1, 2, 3, 4, 5],
      [10, 20, 15, 25, 30],
    ];

    const imageData = await renderToImageData(opts, data, 200, 100);

    let hasNonZero = false;
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (imageData.data[i] > 0 || imageData.data[i + 1] > 0 || imageData.data[i + 2] > 0) {
        hasNonZero = true;
        break;
      }
    }
    expect(hasNonZero).toBe(true);
  });

  it('respects different canvas dimensions', async () => {
    const opts = {
      width: 100,
      height: 50,
      series: [{}, { stroke: 'green' }],
    };
    const data: [number[], number[]] = [
      [1, 2, 3],
      [5, 10, 7],
    ];

    const imageData = await renderToImageData(opts, data, 100, 50);
    expect(imageData.width).toBe(100);
    expect(imageData.height).toBe(50);
  });
});
