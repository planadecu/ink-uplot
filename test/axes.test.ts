import { describe, it, expect } from 'vitest';
import { calculateTicks, tickToRow, tickToCol, formatTimestamp, looksLikeTimestamps } from '../src/axes.js';

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
