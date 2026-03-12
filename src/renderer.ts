import { installDOMShim, uninstallDOMShim } from './dom-shim.js';
import type uPlotType from 'uplot';

let uPlotCtor: typeof uPlotType | null = null;

export type RenderFormat = 'symbols' | 'kitty' | 'sixels' | 'iterm2';

function sanitizeOpts(
  opts: Omit<uPlotType.Options, 'width' | 'height'> & { width?: number; height?: number },
  width: number,
  height: number,
  format: RenderFormat,
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
    // Braille mode: hide axes (rendered as text by the component), thin lines.
    base.axes = (opts.axes ?? []).map(a => ({
      ...a,
      show: false,
      grid: { ...a?.grid, show: false },
      ticks: { ...a?.ticks, show: false },
    }));

    base.series = (opts.series ?? []).map((s, i) => {
      if (i === 0) return s;
      return { ...s, width: Math.max((s as any).width ?? 1, 3) };
    });
  } else {
    // Pixel-perfect mode (kitty/sixels/iterm2): keep uPlot's canvas axes.
    base.axes = (opts.axes ?? []).map(a => ({
      ...a,
      stroke: a?.stroke ?? '#888',
      grid: { show: true, stroke: '#333', ...a?.grid },
      ticks: { show: true, stroke: '#555', ...a?.ticks },
      font: `${Math.max(10, Math.round(height / 40))}px sans-serif`,
    }));

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
  await Promise.resolve();
  await Promise.resolve();
}

export async function renderToImageData(
  opts: Omit<uPlotType.Options, 'width' | 'height'> & { width?: number; height?: number },
  data: uPlotType.AlignedData,
  canvasWidth: number,
  canvasHeight: number,
  format: RenderFormat = 'symbols',
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
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

    const sanitized = sanitizeOpts(opts, canvasWidth, canvasHeight, format);

    const chart = new uPlotCtor(sanitized, data, (self, init) => {
      init();
    });

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
