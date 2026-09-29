import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Box, Text, useApp, useStdout, type DOMElement } from 'ink';
import { renderToImageData, renderToPNG } from './renderer.js';
import { pixelsToTerminal } from './chafa.js';
import { computeScales, buildYLabels, buildXLabelLine } from './axes.js';
import {
  detectFormat, isKitty, isRawFormat, kittyDelete, kittyTagImage, iterm2Escape, withSavedCursor, cursorTo,
} from './format.js';
import type { InkUPlotProps } from './types.js';

// Serialize render calls — renderToImageData uses global DOM state and is not reentrant
let renderLock = Promise.resolve();

/**
 * Where the reserved <Box> actually sits on screen, in cells. Out-of-band graphics
 * (kitty/iterm2/sixels) are written straight to stdout and don't flow with Ink's
 * layout, so we must position them ourselves. Ink lays every node out relative to
 * the frame's top-left (yoga origin), so walking up the tree and summing computed
 * offsets gives the box's column and row within the frame; the root's height is the
 * frame height, used to anchor upward from the cursor Ink leaves at the frame bottom.
 */
function boxScreenGeom(
  node: DOMElement | null,
): { col: number; row: number; frameHeight: number } | null {
  if (!node?.yogaNode) return null;
  let col = 0;
  let row = 0;
  let frameHeight = 0;
  let n: DOMElement | undefined = node;
  while (n?.yogaNode) {
    col += n.yogaNode.getComputedLeft();
    row += n.yogaNode.getComputedTop();
    frameHeight = n.yogaNode.getComputedHeight(); // ends on the root node's height
    n = n.parentNode;
  }
  return { col, row, frameHeight };
}

/**
 * How far up from Ink's cursor the box's top row is. After writing a frame Ink leaves the
 * cursor on the frame's last line when the frame fills the terminal (fullscreen: no trailing
 * newline), otherwise on the line after it. Positioning relative to that cursor — instead of
 * at an absolute terminal row — keeps the image in place when the frame doesn't start at
 * the terminal's first row (non-fullscreen hosts, output below a shell prompt).
 */
function cursorAnchor(
  geom: { row: number; frameHeight: number },
  stdout: { isTTY?: boolean; rows?: number },
): { up: number; minUp: number } {
  const fullscreen = Boolean(stdout.isTTY) && stdout.rows !== undefined && geom.frameHeight >= stdout.rows;
  return {
    up: geom.frameHeight - geom.row - (fullscreen ? 1 : 0),
    // Lowest on-screen frame line, counted up from the cursor (fullscreen: the cursor's own
    // line; otherwise the line above it). Anything below is outside the frame.
    minUp: fullscreen ? 0 : 1,
  };
}

// Kitty image ids are global to the terminal window. Give each chart its own pair (for the
// double-buffer), offset by pid so two processes in one window don't collide either.
const KITTY_ID_BASE = 0x40000000 + (process.pid % 0x8000) * 0x1000;
let kittyIdCounter = 0;
function allocateKittyIds(): [number, number] {
  const base = KITTY_ID_BASE + (kittyIdCounter++ % 0x800) * 2;
  return [base, base + 1];
}

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
  const { stdout: inkStdout } = useStdout();
  // Ink >= 7 resolves this once the frame being rendered has been written to the terminal.
  const app = useApp() as { waitUntilRenderFlush?: () => Promise<void> };
  const [kittyIds] = useState(allocateKittyIds);
  const kittyIdRef = useRef(0); // index into kittyIds of the id the next image uses
  // Reserved box for out-of-band graphics — we read its on-screen position to place the image.
  const boxRef = useRef<DOMElement>(null);
  // Last inline image (iterm2/sixels) + where it was stamped, in 1-based cells.
  // Drives the redraw interval (survive Ink repaints) and the unmount clear.
  // `up`/`col` are relative to the cursor Ink leaves after a frame (see cursorAnchor).
  // termCols/termRows: the terminal size when stamped — after a resize the stamp's
  // coordinates are stale (the terminal reflowed and the host repainted).
  const inlineStampRef = useRef<{
    ansi: string; up: number; minUp: number; col: number; rows: number; cols: number;
    termCols?: number; termRows?: number;
  } | null>(null);

  // Inline images live in the terminal's text cells: printing anything into a cell (an Ink
  // repaint of that line) drops that part of the image. Real iTerm2/sixels get a redraw
  // interval so the image survives the host's repaints. VS Code is excluded — re-stamping
  // there flickers visibly; hosts should render incrementally (Ink `incrementalRendering`)
  // so repaints don't touch the chart's lines, and re-draw after input if needed.
  const inlineErasable = isRawFormat(format) && !isKitty(format) && process.env['TERM_PROGRAM'] !== 'vscode';

  // Kitty/ghostty images live in a separate graphics plane that text repaints never clear;
  // the double-buffer only deletes the previous image on the *next* render, which never
  // comes once the chart is gone — so on unmount delete both buffer IDs.
  useLayoutEffect(() => {
    return () => {
      if (isKitty(format)) process.stdout.write(withSavedCursor(kittyDelete(kittyIds[0]) + kittyDelete(kittyIds[1])));
    };
  }, [format]);

  // Inline images (iterm2/sixels) have no delete command: blank their cells with spaces in
  // default attributes when the chart unmounts or changes size. This runs as a *layout*
  // effect cleanup — during React's commit, before Ink writes the host's next frame — so
  // that frame lands on top of the blank. (A passive effect runs after the frame is written
  // and would wipe the replacement view; Ink's incremental rendering never repaints the
  // unchanged lines.) Cells Ink leaves unchanged were the chart's blank placeholder, so
  // default-attribute spaces are exactly right there.
  // The blank runs before Ink writes its next frame, so the stamp's cursor-relative
  // coordinates stay valid across most resizes — except when Ink cleared the screen (width
  // shrink: it also reflowed) or the anchor moved (a fullscreen frame's row count changed).
  // Blanking then would wipe unrelated content, so skip it; Ink repaints those lines anyway.
  useLayoutEffect(() => {
    return () => {
      const s = inlineStampRef.current;
      if (!s || isKitty(format)) return;
      inlineStampRef.current = null;
      const widthShrank = (inkStdout.columns ?? 0) < (s.termCols ?? 0);
      const fullscreenAnchorMoved = s.minUp === 0 && s.termRows !== inkStdout.rows;
      if (widthShrank || fullscreenAnchorMoved) return;
      // Never write past the right edge: a wrapped blank wipes the start of the next row.
      const cols = inkStdout.columns ? Math.min(s.cols, inkStdout.columns - s.col + 1) : s.cols;
      if (cols <= 0) return;
      const blank = `\x1b[0m${' '.repeat(cols)}`;
      let out = '';
      // Only rows inside the frame: "moving up" a negative amount is a no-op, so rows below
      // the cursor would all land on the cursor's own line (e.g. the host's status bar).
      // …and none above the screen's top line (a frame taller than the screen): cursor-up
      // stops there, so they would all rewrite that line.
      const maxUp = (inkStdout.rows ?? Infinity) - 1;
      for (let r = 0; r < s.rows && s.up - r >= s.minUp; r++) {
        if (s.up - r <= maxUp) out += cursorTo(s.up - r, s.col) + blank + '\x1b8\x1b7';
      }
      process.stdout.write(withSavedCursor(out));
    };
  }, [chartCols, chartRows, format]);

  // Inline images (real iTerm2/sixels) sit in the text grid, so the host app's normal Ink
  // repaints (e.g. a live price ticker) erase them — and this component doesn't re-render
  // on those, so nothing redraws it. Re-stamp the cached image on a short interval so it
  // survives. Some flicker is expected: unlike kitty there's no double-buffer to swap.
  useEffect(() => {
    if (!inlineErasable) return;
    const id = setInterval(() => {
      const s = inlineStampRef.current;
      // Not mid-resize, and not at coordinates from a different terminal size.
      if (!s || resizingRef.current || s.termCols !== inkStdout.columns || s.termRows !== inkStdout.rows) return;
      process.stdout.write(withSavedCursor(cursorTo(s.up, s.col) + s.ansi));
    }, 120);
    return () => clearInterval(id);
  }, [inlineErasable]);

  // Clear stale output when dimensions change (not needed for kitty — bypasses Ink)
  useEffect(() => {
    if (!isRawFormat(format)) { setOutput(null); setError(null); }
  }, [canvasWidth, canvasHeight, format]);

  useEffect(() => {
    if (canvasWidth < 8 || canvasHeight < 16) return;
    // The committed size lags the requested one (a resize just settled, or width/height
    // props changed): drawing now would place an image of the old size, recorded against
    // the new terminal size. The committed update re-runs this effect at the right size.
    if (committed.cols !== liveCols || committed.rows !== liveRows) return;
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
        // Out-of-band graphics are placed relative to the cursor Ink leaves after the frame
        // this layout belongs to. Ink throttles frame writes and the image is often ready
        // first, so wait until that frame is flushed (Ink >= 7); on older Ink, wait out one
        // throttle interval (maxFps 30).
        if (isRawFormat(format)) {
          await (app.waitUntilRenderFlush?.() ?? new Promise<void>((r) => setTimeout(r, 50)));
          if (cancelled) return;
        }
        // Re-check: a resize may have started while this frame was rendering.
        if (resizingRef.current && isRawFormat(format)) return;

        // Locate the reserved box on screen so the image lands inside it — not at the
        // terminal's top-left, which overflows any layout where the chart isn't the only pane.
        const geom = boxScreenGeom(boxRef.current) ?? { col: 0, row: 0, frameHeight: 0 };
        const col = geom.col + 1; // 1-based terminal column of the box's left edge
        const { up, minUp } = cursorAnchor(geom, inkStdout);

        if (isKitty(format)) {
          // Kitty images live in a graphics plane, so text repaints don't erase them.
          // Double-buffer with alternating image IDs (place new, delete old) to avoid flicker.
          const newId = kittyIds[kittyIdRef.current]!;
          kittyIdRef.current = 1 - kittyIdRef.current;
          const oldId = kittyIds[kittyIdRef.current]!;
          const tagged = kittyTagImage(ansi, newId);
          process.stdout.write(withSavedCursor(cursorTo(up, col) + tagged + kittyDelete(oldId)));
        } else if (isRawFormat(format)) {
          // Inline images (iterm2/sixels) occupy character cells. Place at the box's top-left
          // and cache the stamp for the redraw interval and the blank-on-change cleanup.
          process.stdout.write(withSavedCursor(cursorTo(up, col) + ansi));
          inlineStampRef.current = {
            ansi, up, minUp, col, rows: chartRows, cols: chartCols,
            termCols: inkStdout.columns, termRows: inkStdout.rows,
          };
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
  }, [opts, data, canvasWidth, canvasHeight, chartCols, chartRows, format, color, showAxes, resizeTick, committed.cols, committed.rows, liveCols, liveRows]);

  if (error) {
    return <Text color="red">Error rendering chart: {error}</Text>;
  }

  // Raw formats write the image directly to stdout, so we reserve space with an empty
  // box (no glyphs) and let the out-of-band image show through.
  if (isRawFormat(format)) {
    return <Box ref={boxRef} width={termCols} height={chartRows} />;
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
