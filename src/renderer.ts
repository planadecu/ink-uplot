import { installDOMShim, uninstallDOMShim } from './dom-shim.js';
import type uPlotType from 'uplot';

let uPlotCtor: typeof uPlotType | null = null;

export interface RenderOptions {
  /** Strip axes/grid and boost line width for braille. Default: true. */
  brailleMode?: boolean;
}

function sanitizeOpts(
  opts: Omit<uPlotType.Options, 'width' | 'height'> & { width?: number; height?: number },
  width: number,
  height: number,
  brailleMode: boolean,
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

  if (brailleMode) {
    // Hide axes and grid — they render as noisy braille dots.
    base.axes = (opts.axes ?? []).map(a => ({
      ...a,
      show: false,
      grid: { ...a?.grid, show: false },
      ticks: { ...a?.ticks, show: false },
    }));

    // Boost line width for braille (2x4 dot grid needs thicker lines).
    base.series = (opts.series ?? []).map((s, i) => {
      if (i === 0) return s;
      return { ...s, width: Math.max((s as any).width ?? 1, 3) };
    });
  } else {
    // Chafa/Sixel mode: hide axes (rendered as text by the component instead).
    base.axes = (opts.axes ?? []).map(a => ({
      ...a,
      show: false,
      grid: { ...a?.grid, show: false },
      ticks: { ...a?.ticks, show: false },
    }));

    // Scale line widths up for the higher pixel resolution.
    // At 8px per terminal column, a 2px line is barely visible.
    base.series = (opts.series ?? []).map((s, i) => {
      if (i === 0) return s;
      const w = (s as any).width ?? 2;
      return { ...s, width: w * 3 };
    });
  }

  return base;
}

/**
 * Flush all pending microtasks by awaiting a microtask-resolved promise.
 * uPlot defers rendering via queueMicrotask; we must wait for it to finish.
 */
async function flushMicrotasks(): Promise<void> {
  // Two rounds: the first flushes uPlot's _commit, the second catches
  // any microtasks queued during _commit itself.
  await Promise.resolve();
  await Promise.resolve();
}

export async function renderToImageData(
  opts: Omit<uPlotType.Options, 'width' | 'height'> & { width?: number; height?: number },
  data: uPlotType.AlignedData,
  canvasWidth: number,
  canvasHeight: number,
  renderOpts?: RenderOptions,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const brailleMode = renderOpts?.brailleMode ?? true;
  const shim = installDOMShim(canvasWidth, canvasHeight);

  try {
    if (!uPlotCtor) {
      const mod = await import('uplot');
      uPlotCtor = mod.default;
    }

    // Fill canvas background with black so sixel doesn't get transparent pixels.
    if (!brailleMode) {
      const ctx = shim.canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    const sanitized = sanitizeOpts(opts, canvasWidth, canvasHeight, brailleMode);

    const chart = new uPlotCtor(sanitized, data, (self, init) => {
      init();
    });

    // Wait for uPlot's deferred _commit (queued via queueMicrotask) to complete.
    // This allows _setSize to run before _commit processes the rendering,
    // avoiding NaN canvas dimensions.
    await flushMicrotasks();

    const ctx = shim.canvas.getContext('2d');
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
