import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';

// Ink throttles frame writes, and the chart image is often ready first. The image is placed
// relative to the cursor Ink leaves after the frame it was laid out for, so it must not be
// written until Ink has flushed that frame (useApp().waitUntilRenderFlush, Ink >= 7).
let releaseFlush: () => void = () => {};
const flushCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('ink', async (importOriginal) => {
  const ink = await importOriginal<typeof import('ink')>();
  return {
    ...ink,
    useApp: () => ({
      ...ink.useApp(),
      waitUntilRenderFlush: () => {
        flushCalls.count++;
        return new Promise<void>((resolve) => { releaseFlush = resolve; });
      },
    }),
  };
});

const { InkUPlot } = await import('../src/index.js');

const opts = { series: [{}, { stroke: '#ffffff', width: 2 }] };
const data: [number[], number[]] = [[1, 2, 3], [10, 20, 15]];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('inline image placement waits for Ink to flush the frame', () => {
  it('does not write the image until waitUntilRenderFlush resolves', { timeout: 20000 }, async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((c: string | Uint8Array) => {
      writes.push(String(c));
      return true;
    }) as typeof process.stdout.write);
    const instance = render(<InkUPlot opts={opts} data={data} width={20} height={4} format="iterm2" />);

    const start = Date.now();
    while (flushCalls.count === 0 && Date.now() - start < 10000) await new Promise((r) => setTimeout(r, 20));
    expect(flushCalls.count).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 100));
    expect(writes.some((w) => w.includes('\x1b]1337;File='))).toBe(false);

    releaseFlush();
    const t = Date.now();
    while (!writes.some((w) => w.includes('\x1b]1337;File=')) && Date.now() - t < 5000) await new Promise((r) => setTimeout(r, 20));
    expect(writes.some((w) => w.includes('\x1b]1337;File='))).toBe(true);
    instance.unmount();
  });
});
