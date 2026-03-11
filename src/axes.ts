/**
 * Calculate "nice" tick values for an axis range.
 * Uses the standard nice-numbers algorithm (Heckbert, 1990).
 */

function niceNum(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let nice: number;

  if (round) {
    if (fraction < 1.5) nice = 1;
    else if (fraction < 3) nice = 2;
    else if (fraction < 7) nice = 5;
    else nice = 10;
  } else {
    if (fraction <= 1) nice = 1;
    else if (fraction <= 2) nice = 2;
    else if (fraction <= 5) nice = 5;
    else nice = 10;
  }

  return nice * Math.pow(10, exponent);
}

export interface TickResult {
  /** Tick values */
  values: number[];
  /** Formatted tick labels */
  labels: string[];
  /** Data min (extended to nice boundary) */
  min: number;
  /** Data max (extended to nice boundary) */
  max: number;
}

export function calculateTicks(
  dataMin: number,
  dataMax: number,
  maxTicks = 6,
  formatter?: (v: number) => string,
): TickResult {
  if (dataMin === dataMax) {
    const v = dataMin;
    const label = formatter ? formatter(v) : formatNumber(v);
    return { values: [v], labels: [label], min: v - 1, max: v + 1 };
  }

  const range = niceNum(dataMax - dataMin, false);
  const spacing = niceNum(range / (maxTicks - 1), true);
  const niceMin = Math.floor(dataMin / spacing) * spacing;
  const niceMax = Math.ceil(dataMax / spacing) * spacing;

  const values: number[] = [];
  for (let v = niceMin; v <= niceMax + spacing * 0.5; v += spacing) {
    values.push(parseFloat(v.toPrecision(12)));
  }

  const labels = values.map(v => formatter ? formatter(v) : formatNumber(v));

  return { values, labels, min: niceMin, max: niceMax };
}

function formatNumber(v: number): string {
  if (Math.abs(v) >= 1e6) return v.toExponential(1);
  if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (Number.isInteger(v)) return v.toString();
  return parseFloat(v.toFixed(2)).toString();
}

/** Format a unix timestamp as a short date string */
export function formatTimestamp(v: number): string {
  const d = new Date(v * 1000);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${month}-${day}`;
}

/** Detect if values look like unix timestamps (> 1e9, < 2e10) */
export function looksLikeTimestamps(values: number[]): boolean {
  if (values.length === 0) return false;
  return values[0] > 1e9 && values[0] < 2e10;
}

/**
 * Map a tick value to a row/col position.
 * Returns the terminal position (0-indexed from top for rows, from left for cols).
 */
export function tickToRow(value: number, min: number, max: number, totalRows: number): number {
  const ratio = (value - min) / (max - min);
  // Invert: higher values at top (row 0)
  return Math.round((1 - ratio) * (totalRows - 1));
}

export function tickToCol(value: number, min: number, max: number, totalCols: number): number {
  const ratio = (value - min) / (max - min);
  return Math.round(ratio * (totalCols - 1));
}
