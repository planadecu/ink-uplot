import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import { renderToImageData } from './renderer.js';
import { pixelsToTerminal } from './chafa.js';
import { calculateTicks, tickToRow, tickToCol, formatTimestamp, looksLikeTimestamps } from './axes.js';
import type { InkUPlotProps } from './types.js';

const isRawFormat = (f: string) => f === 'kitty' || f === 'sixels' || f === 'iterm2';
const KITTY_DELETE_ALL = '\x1b_Ga=d\x1b\\';

/** Auto-detect the best graphics format for the current terminal. */
export function detectFormat(): 'kitty' | 'sixels' | 'iterm2' | 'symbols' {
  const env = process.env;
  const term = env.TERM ?? '';
  const termProgram = env.TERM_PROGRAM ?? '';

  // 1. Check TERM (most reliable — propagates through SSH/sudo)
  if (term === 'xterm-kitty') return 'kitty';
  if (term === 'xterm-ghostty') return 'kitty';
  if (term === 'foot' || term === 'foot-extra') return 'sixels';
  if (term === 'wezterm') return 'iterm2';

  // 2. Check TERM_PROGRAM
  if (termProgram === 'iTerm.app') return 'iterm2';
  if (termProgram === 'WezTerm') return 'iterm2';
  if (termProgram === 'ghostty') return 'kitty';
  if (termProgram === 'vscode') return 'symbols';

  // 3. Check terminal-specific env vars
  if (env.KITTY_WINDOW_ID) return 'kitty';
  if (env.GHOSTTY_RESOURCES_DIR) return 'kitty';
  if (env.WEZTERM_EXECUTABLE) return 'iterm2';
  if (env.ITERM_SESSION_ID) return 'iterm2';
  if (env.KONSOLE_VERSION) return 'kitty';
  if (env.WT_SESSION) return 'sixels';

  return 'symbols';
}

// Serialize render calls — renderToImageData uses global DOM state and is not reentrant
let renderLock = Promise.resolve();

// Cache auto-detected format (env vars don't change at runtime)
const detectedFormat = detectFormat();

interface ScaleInfo {
  ticks: ReturnType<typeof calculateTicks>;
  side: 'left' | 'right';
}

export function InkUPlot({
  opts,
  data,
  width,
  height = 24,
  showAxes = true,
  format = detectedFormat,
  color = true,
}: InkUPlotProps) {
  const termCols = width ?? process.stdout.columns ?? 80;
  const rawMode = isRawFormat(format);

  // For raw formats (kitty/sixels/iterm2), uPlot renders its own canvas axes,
  // so we use the full terminal area. For symbols mode, reserve space for text axes.
  const scales = useMemo(() => {
    if (!showAxes || rawMode) return null;
    const xValues = data[0] as number[];
    let xMin = Infinity, xMax = -Infinity;
    for (const v of xValues) { if (v < xMin) xMin = v; if (v > xMax) xMax = v; }

    // X-axis: use custom formatter from opts.axes[0].values, or auto-detect timestamps
    const xAxisDef = (opts.axes as any)?.[0];
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

    // Group series by scale name from opts.series
    const scaleGroups = new Map<string, number[]>();
    const seriesDefs = opts.series ?? [];
    for (let i = 1; i < data.length; i++) {
      const scaleName = (seriesDefs[i] as any)?.scale ?? 'y';
      if (!scaleGroups.has(scaleName)) scaleGroups.set(scaleName, []);
      scaleGroups.get(scaleName)!.push(i);
    }

    // Build a map from scale name → side using opts.axes
    const axisDefs = (opts.axes ?? []) as any[];
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
          if (v == null || v === 0) continue;
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
  }, [data, opts.series, opts.axes, showAxes, rawMode]);

  const leftScale = scales?.yScales.find(s => s.side === 'left') ?? null;
  const rightScale = scales?.yScales.find(s => s.side === 'right') ?? null;

  const leftLabelWidth = leftScale
    ? Math.max(...leftScale.ticks.labels.map(l => l.length)) + 1
    : 0;
  const rightLabelWidth = rightScale
    ? Math.max(...rightScale.ticks.labels.map(l => l.length)) + 1
    : 0;

  // Raw formats use full terminal area (uPlot draws its own axes on canvas).
  // Symbols mode reserves space for text axes.
  const chartCols = rawMode ? termCols : Math.max(1, termCols - leftLabelWidth - rightLabelWidth);
  const chartRows = rawMode ? height : Math.max(1, showAxes ? height - 2 : height);

  // Cap canvas pixel dimensions to avoid WASM memory issues.
  // chafa-wasm operates on a fixed WASM heap; very large buffers cause OOB access.
  // Cap each dimension AND total pixel count (buffer = w*h*4 bytes).
  const MAX_DIM = 4096;
  const MAX_PIXELS = 2_000_000; // ~8MB RGBA buffer
  let canvasWidth = Math.min(chartCols * 8, MAX_DIM);
  let canvasHeight = Math.min(chartRows * 16, MAX_DIM);
  if (canvasWidth * canvasHeight > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / (canvasWidth * canvasHeight));
    canvasWidth = Math.floor(canvasWidth * scale);
    canvasHeight = Math.floor(canvasHeight * scale);
  }

  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clear stale output when dimensions change (text mode only)
  useEffect(() => {
    if (!rawMode) { setOutput(null); setError(null); }
  }, [canvasWidth, canvasHeight, rawMode]);

  useEffect(() => {
    if (canvasWidth < 8 || canvasHeight < 16) return;
    let cancelled = false;

    // Serialize through renderLock — renderToImageData is not reentrant
    renderLock = renderLock.then(async () => {
      if (cancelled) return;
      try {
        const imageData = await renderToImageData(opts, data, canvasWidth, canvasHeight, format);
        if (cancelled) return;

        const ansi = await pixelsToTerminal(imageData, {
          width: chartCols,
          height: chartRows,
          format,
          colors: color ? 'truecolor' : 'none',
        });
        if (cancelled) return;

        if (rawMode) {
          // Delete old kitty image, move to absolute top-left, write new image.
          // Do NOT call setOutput — Ink re-renders would write spaces over the
          // kitty image, and kitty erases graphics when text is drawn over them.
          const del = format === 'kitty' ? KITTY_DELETE_ALL : '';
          process.stdout.write(`${del}\x1b[1;1H${ansi}`);
        } else {
          setOutput(ansi);
        }
        setError(null);
      } catch (err) {
        if (!cancelled && !rawMode) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    });

    return () => {
      cancelled = true;
      if (format === 'kitty') process.stdout.write(KITTY_DELETE_ALL);
    };
  }, [opts, data, canvasWidth, canvasHeight, chartCols, chartRows, format, color, rawMode]);

  if (error) {
    return <Text color="red">Error rendering chart: {error}</Text>;
  }

  // Raw format: Ink just renders empty placeholder lines to reserve vertical space.
  // The kitty/sixels/iterm2 image (with uPlot's own axes) is written directly to stdout.
  if (rawMode) {
    return (
      <Box flexDirection="column">
        {Array.from({ length: chartRows }, (_, i) => <Text key={i}>{' '.repeat(termCols)}</Text>)}
      </Box>
    );
  }

  if (!output) {
    return <Text dimColor>Rendering chart...</Text>;
  }

  const chartLines = output.split('\n');

  if (!showAxes || !scales) {
    return (
      <Box flexDirection="column">
        {chartLines.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>
    );
  }

  const leftLabels = leftScale
    ? buildYLabels(leftScale.ticks, chartRows, leftLabelWidth, 'left')
    : null;
  const rightLabels = rightScale
    ? buildYLabels(rightScale.ticks, chartRows, rightLabelWidth, 'right')
    : null;

  const xLabelLine = buildXLabelLine(scales.xTicks, chartCols);

  return (
    <Box flexDirection="column">
      {chartLines.map((line, i) => (
        <Box key={i}>
          {leftLabels && <Text dimColor>{leftLabels[i]}</Text>}
          <Text>{line}</Text>
          {rightLabels && <Text dimColor>{rightLabels[i]}</Text>}
        </Box>
      ))}
      <Box>
        <Text>{' '.repeat(leftLabelWidth)}</Text>
        <Text dimColor>{xLabelLine}</Text>
      </Box>
    </Box>
  );
}

function buildYLabels(
  yTicks: ReturnType<typeof calculateTicks>,
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

function buildXLabelLine(
  xTicks: ReturnType<typeof calculateTicks>,
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
