import { installDOMShim, uninstallDOMShim } from './dom-shim.js';
import type uPlotType from 'uplot';

let uPlotCtor: typeof uPlotType | null = null;

function sanitizeOpts(
  opts: Omit<uPlotType.Options, 'width' | 'height'> & { width?: number; height?: number },
  width: number,
  height: number,
): uPlotType.Options {
  // Hide axes and grid — they render as noisy braille dots.
  // The data series are the only thing that looks good in braille.
  const axes = (opts.axes ?? []).map(a => ({
    ...a,
    show: false,
    grid: { ...a?.grid, show: false },
    ticks: { ...a?.ticks, show: false },
  }));

  // Ensure series lines are thick enough to render well in braille (2x4 dot grid).
  const series = (opts.series ?? []).map((s, i) => {
    if (i === 0) return s; // x-axis series, no stroke
    return { ...s, width: Math.max((s as any).width ?? 1, 3) };
  });

  return {
    ...opts,
    width,
    height,
    axes,
    series,
    cursor: { show: false },
    select: { show: false, left: 0, top: 0, width: 0, height: 0 },
    legend: { show: false },
    focus: { alpha: 1 },
  };
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
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const shim = installDOMShim(canvasWidth, canvasHeight);

  try {
    if (!uPlotCtor) {
      const mod = await import('uplot');
      uPlotCtor = mod.default;
    }

    const sanitized = sanitizeOpts(opts, canvasWidth, canvasHeight);

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
