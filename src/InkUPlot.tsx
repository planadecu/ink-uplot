import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import { renderToImageData } from './renderer.js';
import { pixelsToTerminal } from './chafa.js';
import { calculateTicks, tickToRow, tickToCol, formatTimestamp, looksLikeTimestamps } from './axes.js';
import type { InkUPlotProps } from './types.js';

interface ScaleInfo {
  ticks: ReturnType<typeof calculateTicks>;
  side: 'left' | 'right';
}

export function InkUPlot({
  opts,
  data,
  width,
  height = 24,
  threshold = 128,
  color = true,
  background = 'dark',
}: InkUPlotProps) {
  const termCols = width ?? process.stdout.columns ?? 80;

  const scales = useMemo(() => {
    const xValues = data[0] as number[];
    let xMin = Infinity, xMax = -Infinity;
    for (const v of xValues) { if (v < xMin) xMin = v; if (v > xMax) xMax = v; }

    // X-axis: auto-detect timestamps
    const isTimestamp = looksLikeTimestamps(xValues);
    const xTicks = calculateTicks(xMin, xMax, 6, isTimestamp ? formatTimestamp : undefined);

    // Group series by scale name from opts.series
    const scaleGroups = new Map<string, number[]>();
    const seriesDefs = opts.series ?? [];
    for (let i = 1; i < data.length; i++) {
      const scaleName = (seriesDefs[i] as any)?.scale ?? 'y';
      if (!scaleGroups.has(scaleName)) scaleGroups.set(scaleName, []);
      scaleGroups.get(scaleName)!.push(i);
    }

    // Build scale info for each group
    const yScales: ScaleInfo[] = [];
    let scaleIdx = 0;
    for (const [, indices] of scaleGroups) {
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
      yScales.push({ ticks, side: scaleIdx === 0 ? 'left' : 'right' });
      scaleIdx++;
    }

    return { xTicks, yScales };
  }, [data, opts.series]);

  const leftScale = scales.yScales.find(s => s.side === 'left');
  const rightScale = scales.yScales.find(s => s.side === 'right');

  const leftLabelWidth = leftScale
    ? Math.max(...leftScale.ticks.labels.map(l => l.length)) + 1
    : 0;
  const rightLabelWidth = rightScale
    ? Math.max(...rightScale.ticks.labels.map(l => l.length)) + 1
    : 0;

  const chartCols = termCols - leftLabelWidth - rightLabelWidth;
  const chartRows = height - 2;

  const canvasWidth = chartCols * 8;
  const canvasHeight = chartRows * 16;

  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const imageData = await renderToImageData(opts, data, canvasWidth, canvasHeight, { brailleMode: false });
        if (cancelled) return;

        const ansi = await pixelsToTerminal(imageData, {
          width: chartCols,
          height: chartRows,
          colors: color ? 'truecolor' : 'none',
        });
        if (cancelled) return;

        setOutput(ansi);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [opts, data, canvasWidth, canvasHeight, chartCols, chartRows, color]);

  if (error) {
    return <Text color="red">Error rendering chart: {error}</Text>;
  }

  if (!output) {
    return <Text dimColor>Rendering chart...</Text>;
  }

  const chartLines = output.split('\n');

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
