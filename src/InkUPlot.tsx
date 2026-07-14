import { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import { renderToImageData, renderToPNG } from './renderer.js';
import { pixelsToTerminal } from './chafa.js';
import { computeScales, buildYLabels, buildXLabelLine } from './axes.js';
import { detectFormat, isKitty, isRawFormat, kittyDelete, kittyTagImage, iterm2Escape } from './format.js';
import type { InkUPlotProps } from './types.js';

// Serialize render calls — renderToImageData uses global DOM state and is not reentrant
let renderLock = Promise.resolve();

// Cache auto-detected format (env vars don't change at runtime)
const detectedFormat = detectFormat();

export { detectFormat } from './format.js';

export function InkUPlot({
  opts,
  data,
  width,
  height = 24,
  showAxes = true,
  format = detectedFormat,
  color = true,
}: InkUPlotProps) {
  const rawMode = isRawFormat(format);

  // Live terminal dimensions — these change on every resize event during a drag.
  const liveCols = width ?? process.stdout.columns ?? 80;
  const liveRows = height;

  // Freeze the layout during a resize drag — repainting the reserved box and retransmitting
  // images while the terminal reflows can wedge it. Hold the committed size steady through
  // the drag, then commit the new size and redraw once it settles.
  const resizingRef = useRef(false);
  const [resizeTick, setResizeTick] = useState(0);
  const [committed, setCommitted] = useState({ cols: liveCols, rows: liveRows });
  useEffect(() => {
    const out = process.stdout;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      resizingRef.current = true;
      clearTimeout(timer);
      timer = setTimeout(() => {
        resizingRef.current = false;
        setResizeTick(t => t + 1); // commit + redraw once at the settled size
      }, 250);
    };
    out.on('resize', onResize);
    return () => { clearTimeout(timer); out.off('resize', onResize); };
  }, []);
  // Commit new dimensions only when NOT mid-drag; the settle above bumps resizeTick to re-run this.
  useEffect(() => {
    if (!resizingRef.current) setCommitted({ cols: liveCols, rows: liveRows });
  }, [liveCols, liveRows, resizeTick]);

  const termCols = committed.cols;
  const effHeight = committed.rows;

  // For raw formats (kitty/sixels/iterm2), uPlot renders its own canvas axes,
  // so we use the full terminal area. For symbols mode, reserve space for text axes.
  const scales = useMemo(() => {
    if (!showAxes || rawMode) return null;
    return computeScales(
      data as readonly (number | null | undefined)[][],
      (opts.series ?? []) as readonly Record<string, any>[],
      ((opts.axes ?? []) as any[]),
    );
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
  const chartRows = rawMode ? effHeight : Math.max(1, showAxes ? effHeight - 2 : effHeight);

  // Render at 2x cell density (supersample) so the chart stays crisp when the terminal
  // upscales the image — at 1x it looks blurry on small/hi-DPI terminals. Display size is
  // unchanged; only the pixel resolution goes up. Capped to avoid WASM memory issues.
  const MAX_DIM = 4096;
  const MAX_PIXELS = 2_000_000;
  let canvasWidth = Math.min(chartCols * 16, MAX_DIM);
  let canvasHeight = Math.min(chartRows * 32, MAX_DIM);
  if (canvasWidth * canvasHeight > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / (canvasWidth * canvasHeight));
    canvasWidth = Math.floor(canvasWidth * scale);
    canvasHeight = Math.floor(canvasHeight * scale);
  }

  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kittyIdRef = useRef(1);

  // Clear stale output when dimensions change (not needed for kitty — bypasses Ink)
  useEffect(() => {
    if (!isRawFormat(format)) { setOutput(null); setError(null); }
  }, [canvasWidth, canvasHeight, format]);

  useEffect(() => {
    if (canvasWidth < 8 || canvasHeight < 16) return;
    let cancelled = false;

    // Serialize through renderLock — renderToImageData is not reentrant
    renderLock = renderLock.then(async () => {
      if (cancelled) return;
      // Skip image writes mid-resize; the trailing resizeTick render redraws after settle.
      if (resizingRef.current && isRawFormat(format)) return;
      try {
        let ansi: string;

        if (format === 'iterm2') {
          // Fast path: node-canvas encodes PNG natively (C), skip chafa WASM entirely.
          const png = await renderToPNG(opts, data, canvasWidth, canvasHeight, format, showAxes);
          if (cancelled) return;
          ansi = iterm2Escape(png, chartCols, chartRows);
        } else {
          const imageData = await renderToImageData(opts, data, canvasWidth, canvasHeight, format, showAxes);
          if (cancelled) return;
          ansi = await pixelsToTerminal(imageData, {
            width: chartCols,
            height: chartRows,
            format,
            colors: color ? 'truecolor' : 'none',
          });
        }
        if (cancelled) return;
        // Re-check: a resize may have started while this frame was rendering.
        if (resizingRef.current && isRawFormat(format)) return;

        if (isKitty(format)) {
          // Kitty images live in a graphics plane, so text repaints don't erase them.
          // Double-buffer with alternating image IDs (place new, delete old) to avoid flicker.
          const newId = kittyIdRef.current;
          const oldId = newId === 1 ? 2 : 1;
          kittyIdRef.current = oldId;
          const tagged = kittyTagImage(ansi, newId);
          process.stdout.write(`\x1b[1;1H${tagged}${kittyDelete(oldId)}`);
        } else if (isRawFormat(format)) {
          // Inline images (iterm2/sixels) occupy character cells. Ink placed the cursor
          // after the reserved Box, so move up to the top of it before writing the image.
          process.stdout.write(`\x1b[${chartRows}A\x1b[1G${ansi}`);
        } else {
          setOutput(ansi);
        }
        setError(null);
      } catch (err) {
        // Kitty: swallow errors during resize — next frame will render at correct size.
        // Other formats: surface the error so Ink can display it.
        if (!isRawFormat(format)) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    });

    return () => { cancelled = true; };
  }, [opts, data, canvasWidth, canvasHeight, chartCols, chartRows, format, color, showAxes, resizeTick]);

  if (error) {
    return <Text color="red">Error rendering chart: {error}</Text>;
  }

  // Raw formats write the image directly to stdout, so we reserve space with an empty
  // box (no glyphs) and let the out-of-band image show through.
  if (isRawFormat(format)) {
    return <Box width={termCols} height={chartRows} />;
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
