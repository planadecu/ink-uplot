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

export interface ScaleInfo {
  ticks: TickResult;
  side: 'left' | 'right';
}

export interface ScalesResult {
  xTicks: TickResult;
  yScales: ScaleInfo[];
}

/**
 * Compute X and Y scales from uPlot data and opts.
 * Returns null if axes should not be shown.
 */
export function computeScales(
  data: readonly (number | null | undefined)[][],
  seriesDefs: readonly Record<string, any>[],
  axisDefs: readonly Record<string, any>[],
): ScalesResult {
  const xValues = data[0] as number[];
  let xMin = Infinity, xMax = -Infinity;
  for (const v of xValues) { if (v < xMin) xMin = v; if (v > xMax) xMax = v; }

  // X-axis: use custom formatter from axisDefs[0].values, or auto-detect timestamps
  const xAxisDef = axisDefs[0];
  let xFormatter: ((v: number) => string) | undefined;
  if (typeof xAxisDef?.values === 'function') {
    xFormatter = (v: number) => {
      const result = xAxisDef.values(null, [v], 0, 0);
      return Array.isArray(result) ? String(result[0]) : String(result);
    };
  } else if (looksLikeTimestamps(xValues)) {
    xFormatter = formatTimestamp;
  }
  const xTicks = calculateTicks(xMin, xMax, 6, xFormatter);

  // Group series by scale name
  const scaleGroups = new Map<string, number[]>();
  for (let i = 1; i < data.length; i++) {
    const scaleName = seriesDefs[i]?.scale ?? 'y';
    if (!scaleGroups.has(scaleName)) scaleGroups.set(scaleName, []);
    scaleGroups.get(scaleName)!.push(i);
  }

  // Map scale name → side from axis definitions
  const scaleSideMap = new Map<string, 'left' | 'right'>();
  for (const ax of axisDefs) {
    if (ax?.scale) {
      scaleSideMap.set(ax.scale, ax.side === 1 ? 'right' : 'left');
    }
  }

  // Build scale info for each group
  const yScales: ScaleInfo[] = [];
  let scaleIdx = 0;
  for (const [scaleName, indices] of scaleGroups) {
    let min = Infinity, max = -Infinity;
    for (const idx of indices) {
      const series = data[idx];
      if (!series) continue;
      for (const v of series) {
        if (v == null) continue; // null is uPlot's gap marker; 0 is real data, keep it
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (min === Infinity) { min = 0; max = 1; }
    const ticks = calculateTicks(min, max);
    const side = scaleSideMap.get(scaleName) ?? (scaleIdx === 0 ? 'left' : 'right');
    yScales.push({ ticks, side });
    scaleIdx++;
  }

  return { xTicks, yScales };
}

export function buildYLabels(
  yTicks: TickResult,
  chartRows: number,
  labelWidth: number,
  side: 'left' | 'right',
): string[] {
  const labels: string[] = new Array(chartRows).fill('');

  for (let i = 0; i < yTicks.values.length; i++) {
    const row = tickToRow(yTicks.values[i], yTicks.min, yTicks.max, chartRows);
    if (row >= 0 && row < chartRows && labels[row] === '') {
      if (side === 'left') {
        labels[row] = yTicks.labels[i].padStart(labelWidth - 1) + ' ';
      } else {
        labels[row] = ' ' + yTicks.labels[i].padEnd(labelWidth - 1);
      }
    }
  }

  return labels.map(l => l || ' '.repeat(labelWidth));
}

export function buildXLabelLine(
  xTicks: TickResult,
  chartCols: number,
): string {
  const line = new Array(chartCols).fill(' ');

  for (let i = 0; i < xTicks.values.length; i++) {
    const col = tickToCol(xTicks.values[i], xTicks.min, xTicks.max, chartCols);
    const label = xTicks.labels[i];
    const start = Math.max(0, col - Math.floor(label.length / 2));
    if (start + label.length <= chartCols) {
      for (let j = 0; j < label.length; j++) {
        line[start + j] = label[j];
      }
    }
  }

  return line.join('');
}
