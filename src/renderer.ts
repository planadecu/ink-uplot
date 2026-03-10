import { installDOMShim, uninstallDOMShim } from './dom-shim.js';
import type uPlotType from 'uplot';

let uPlotCtor: typeof uPlotType | null = null;

function sanitizeOpts(
  opts: uPlotType.Options,
  width: number,
  height: number,
): uPlotType.Options {
  return {
    ...opts,
    width,
    height,
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
  opts: uPlotType.Options,
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
