import { describe, it, expect } from 'vitest';
import {
  calculateTicks, tickToRow, tickToCol, formatTimestamp, looksLikeTimestamps,
  computeScales, buildYLabels, buildXLabelLine,
} from '../src/axes.js';

describe('calculateTicks', () => {
  it('produces nice tick values within the data range', () => {
    const result = calculateTicks(3, 97);
    expect(result.min).toBeLessThanOrEqual(3);
    expect(result.max).toBeGreaterThanOrEqual(97);
    expect(result.values.length).toBeGreaterThan(1);
    expect(result.labels.length).toBe(result.values.length);
  });

  it('handles equal min and max', () => {
    const result = calculateTicks(50, 50);
    expect(result.values).toEqual([50]);
    expect(result.min).toBe(49);
    expect(result.max).toBe(51);
  });

  it('uses custom formatter when provided', () => {
    const result = calculateTicks(0, 10, 6, (v) => `val:${v}`);
    for (const label of result.labels) {
      expect(label).toMatch(/^val:/);
    }
  });

  it('formats large numbers with separators', () => {
    const result = calculateTicks(0, 5000);
    const bigLabel = result.labels.find(l => l.includes(','));
    expect(bigLabel).toBeDefined();
  });
});

describe('tickToRow', () => {
  it('maps max value to row 0 (top)', () => {
    expect(tickToRow(100, 0, 100, 20)).toBe(0);
  });

  it('maps min value to last row (bottom)', () => {
    expect(tickToRow(0, 0, 100, 20)).toBe(19);
  });

  it('maps midpoint to middle row', () => {
    expect(tickToRow(50, 0, 100, 21)).toBe(10);
  });
});

describe('tickToCol', () => {
  it('maps min value to col 0 (left)', () => {
    expect(tickToCol(0, 0, 100, 80)).toBe(0);
  });

  it('maps max value to last col (right)', () => {
    expect(tickToCol(100, 0, 100, 80)).toBe(79);
  });
});

describe('looksLikeTimestamps', () => {
  it('detects unix timestamps', () => {
    expect(looksLikeTimestamps([1700000000, 1700086400])).toBe(true);
  });

  it('rejects small numbers', () => {
    expect(looksLikeTimestamps([0, 1, 2, 3])).toBe(false);
  });

  it('rejects empty arrays', () => {
    expect(looksLikeTimestamps([])).toBe(false);
  });
});

describe('formatTimestamp', () => {
  it('formats a known timestamp correctly', () => {
    // 2024-01-01 00:00:00 UTC = 1704067200
    expect(formatTimestamp(1704067200)).toBe('2024-01-01');
  });
});

describe('computeScales', () => {
  it('produces one left-side y-scale for a single series', () => {
    const data = [
      [0, 1, 2, 3, 4],       // x
      [10, 20, 15, 25, 30],  // y
    ];
    const { xTicks, yScales } = computeScales(data, [{}, {}], []);
    expect(yScales.length).toBe(1);
    expect(yScales[0].side).toBe('left');
    expect(yScales[0].ticks.max).toBeGreaterThanOrEqual(30);
    expect(xTicks.max).toBeGreaterThanOrEqual(4);
  });

  it('groups series by scale name and places second scale on the right', () => {
    const data = [
      [0, 1, 2],
      [100, 200, 150],   // scale "price"
      [1, 2, 3],         // scale "volume"
    ];
    const series = [{}, { scale: 'price' }, { scale: 'volume' }];
    const axes = [
      {},
      { scale: 'price', side: 3 },
      { scale: 'volume', side: 1 },
    ];
    const { yScales } = computeScales(data, series, axes);
    expect(yScales.length).toBe(2);
    const sides = yScales.map(s => s.side).sort();
    expect(sides).toEqual(['left', 'right']);
  });

  it('applies a custom x-axis values formatter', () => {
    const data = [
      [0, 1, 2, 3],
      [5, 6, 7, 8],
    ];
    const axes = [{ values: (_u: any, splits: number[]) => splits.map(v => `t${v}`) }];
    const { xTicks } = computeScales(data, [{}, {}], axes);
    for (const label of xTicks.labels) {
      expect(label).toMatch(/^t/);
    }
  });

  it('auto-detects timestamp x-axis', () => {
    const data = [
      [1704067200, 1704153600, 1704240000],  // consecutive days in 2024
      [1, 2, 3],
    ];
    const { xTicks } = computeScales(data, [{}, {}], []);
    expect(xTicks.labels.some(l => /^\d{4}-\d{2}-\d{2}$/.test(l))).toBe(true);
  });

  it('includes zero in the Y range (0 is real data, not a gap)', () => {
    const data = [
      [0, 1, 2, 3],
      [5, 0, -3, 2],  // crosses zero
    ];
    const { yScales } = computeScales(data, [{}, {}], []);
    expect(yScales[0].ticks.min).toBeLessThanOrEqual(-3);
    expect(yScales[0].ticks.max).toBeGreaterThanOrEqual(5);
  });

  it('falls back to a 0..1 scale when a series is entirely null (uPlot gaps)', () => {
    const data = [
      [0, 1, 2],
      [null, null, null],
    ];
    const { yScales } = computeScales(data as any, [{}, {}], []);
    expect(yScales[0].ticks.min).toBe(0);
    expect(yScales[0].ticks.max).toBeGreaterThanOrEqual(1);
  });
});

describe('buildYLabels', () => {
  it('returns one entry per chart row, all of the same width', () => {
    const ticks = calculateTicks(0, 100);
    const labels = buildYLabels(ticks, 20, 6, 'left');
    expect(labels.length).toBe(20);
    for (const l of labels) expect(l.length).toBe(6);
  });

  it('right-aligns left-side labels and left-aligns right-side labels', () => {
    const ticks = calculateTicks(0, 100);
    const left = buildYLabels(ticks, 20, 6, 'left');
    const right = buildYLabels(ticks, 20, 6, 'right');
    // A row that carries the max label: left pads on the front, right pads on the back.
    const leftLabelled = left.find(l => l.trim().length > 0)!;
    const rightLabelled = right.find(l => l.trim().length > 0)!;
    expect(leftLabelled.endsWith(' ')).toBe(true);
    expect(rightLabelled.startsWith(' ')).toBe(true);
  });
});

describe('buildXLabelLine', () => {
  it('produces a line exactly chartCols wide with tick labels embedded', () => {
    const ticks = calculateTicks(0, 100);
    const line = buildXLabelLine(ticks, 80);
    expect(line.length).toBe(80);
    expect(line.trim().length).toBeGreaterThan(0);
    // The "0" tick label should appear near the left edge.
    expect(line.slice(0, 4)).toContain('0');
  });
});
