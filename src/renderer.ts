import { installDOMShim, uninstallDOMShim } from './dom-shim.js';
import type uPlotType from 'uplot';

let uPlotCtor: typeof uPlotType | null = null;

export type RenderFormat = 'symbols' | 'kitty' | 'sixels' | 'iterm2';

function sanitizeOpts(
  opts: Omit<uPlotType.Options, 'width' | 'height'> & { width?: number; height?: number },
  width: number,
  height: number,
  format: RenderFormat,
  showAxes: boolean,
): uPlotType.Options {
  const base: uPlotType.Options = {
    ...opts,
    width,
    height,
    cursor: { show: false },
    select: { show: false, left: 0, top: 0, width: 0, height: 0 },
    legend: { show: false },
    focus: { alpha: 1 },
  };

  if (format === 'symbols') {
    // Braille mode: hide canvas axes (rendered as text by the component), thin lines.
    // Default to [x, y] so an undefined/empty axes array still hides uPlot's implicit axes
    // (uPlot draws default axes when given []).
    base.axes = (opts.axes?.length ? opts.axes : [{}, {}]).map(a => ({
      ...a,
      show: false,
      grid: { ...a?.grid, show: false },
      ticks: { ...a?.ticks, show: false },
    }));

    base.series = (opts.series ?? []).map((s, i) => {
      if (i === 0) return s;
      return { ...s, width: Math.max((s as any).width ?? 1, 3) };
    });

    return base;
  }

  // Pixel-perfect mode (kitty/sixels/iterm2): uPlot draws the axes on the canvas.
  if (!showAxes) {
    // Borderless chart — hide axes, grid, and ticks entirely.
    // Default to [x, y] so an undefined/empty axes array still hides uPlot's implicit axes
    // (uPlot draws default axes when given []).
    base.axes = (opts.axes?.length ? opts.axes : [{}, {}]).map(a => ({
      ...a,
      show: false,
      grid: { ...a?.grid, show: false },
      ticks: { ...a?.ticks, show: false },
    }));
  } else {
    const fontPx = Math.max(10, Math.round(height / 40));
    const fontStr = `${fontPx}px sans-serif`;

    // Auto-size vertical (y) axes to their widest label. uPlot's default ~50px width
    // clips large labels (e.g. "13,000") at the canvas edge, especially at bigger fonts.
    const autoSizeY = (self: any, values: string[] | null, axisIdx: number, cycleNum: number): number => {
      const axis = self.axes[axisIdx];
      if (cycleNum > 1 && axis._size != null) return axis._size;
      self.ctx.font = fontStr;
      let maxW = 0;
      for (const v of values ?? []) {
        const w = self.ctx.measureText(String(v)).width;
        if (w > maxW) maxW = w;
      }
      return Math.ceil(maxW) + 20; // label + tick + gap
    };

    // Default to [x, y] so implicit axes (undefined/empty array — uPlot draws them anyway)
    // still get styling and auto-sizing, not uPlot's tiny unstyled defaults.
    base.axes = (opts.axes?.length ? opts.axes : [{}, {}]).map((a, i) => {
      // side 1/3 are vertical; an undefined-side axis after index 0 defaults to a left y-axis.
      const isY = a?.side === 1 || a?.side === 3 || (i > 0 && a?.side == null);
      return {
        ...a,
        stroke: a?.stroke ?? '#aaa',
        grid: { show: true, stroke: '#333', ...a?.grid },
        ticks: { show: true, stroke: '#666', ...a?.ticks },
        font: fontStr,
        ...(isY && (a as any)?.size == null ? { size: autoSizeY } : {}),
      };
    });
  }

  base.series = (opts.series ?? []).map((s, i) => {
    if (i === 0) return s;
    const w = (s as any).width ?? 2;
    return { ...s, width: w * 3 };
  });

  return base;
}

/**
 * Flush all pending microtasks by awaiting a microtask-resolved promise.
 * uPlot defers rendering via queueMicrotask; we must wait for it to finish.
 */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function renderChart(
  opts: Omit<uPlotType.Options, 'width' | 'height'> & { width?: number; height?: number },
  data: uPlotType.AlignedData,
  canvasWidth: number,
  canvasHeight: number,
  format: RenderFormat,
  showAxes: boolean,
) {
  const shim = installDOMShim(canvasWidth, canvasHeight);

  try {
    if (!uPlotCtor) {
      const mod = await import('uplot');
      uPlotCtor = mod.default;
    }

    // Pixel formats need a black background; symbols/braille use transparent canvas.
    if (format !== 'symbols') {
      const ctx = shim.canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    const sanitized = sanitizeOpts(opts, canvasWidth, canvasHeight, format, showAxes);

    const chart = new uPlotCtor(sanitized, data, (self, init) => {
      init();
    });

    await flushMicrotasks();

    return { canvas: shim.canvas, chart };
  } catch (err) {
    uninstallDOMShim();
    throw err;
  }
}

export async function renderToImageData(
  opts: Omit<uPlotType.Options, 'width' | 'height'> & { width?: number; height?: number },
  data: uPlotType.AlignedData,
  canvasWidth: number,
  canvasHeight: number,
  format: RenderFormat = 'symbols',
  showAxes = true,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const { canvas, chart } = await renderChart(opts, data, canvasWidth, canvasHeight, format, showAxes);

  try {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    chart.destroy();

    return {
      data: imageData.data as unknown as Uint8ClampedArray,
      width: imageData.width,
      height: imageData.height,
    };
  } finally {
    uninstallDOMShim();
  }
}

/**
 * Render chart and return a PNG buffer directly from node-canvas.
 * Much faster than getImageData → chafa for formats that accept PNG (iterm2).
 */
export async function renderToPNG(
  opts: Omit<uPlotType.Options, 'width' | 'height'> & { width?: number; height?: number },
  data: uPlotType.AlignedData,
  canvasWidth: number,
  canvasHeight: number,
  format: RenderFormat = 'iterm2',
  showAxes = true,
): Promise<Buffer> {
  const { canvas, chart } = await renderChart(opts, data, canvasWidth, canvasHeight, format, showAxes);

  try {
    const png = canvas.toBuffer('image/png');
    chart.destroy();
    return png;
  } finally {
    uninstallDOMShim();
  }
}
