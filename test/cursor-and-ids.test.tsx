import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { Box, Text } from 'ink';
import { render } from 'ink-testing-library';
import { InkUPlot } from '../src/index.js';

// Out-of-band graphics are written straight to stdout, but Ink draws each frame relative to
// the cursor it left behind. So every graphics write must (a) save and restore the cursor,
// and (b) position itself relative to that cursor, not at an absolute terminal row that
// assumes the frame starts at row 1.

const opts = { series: [{}, { stroke: '#ffffff', width: 2 }] };
const data: [number[], number[]] = [[1, 2, 3], [10, 20, 15]];

function spyStdout(): string[] {
  const writes: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  }) as typeof process.stdout.write);
  return writes;
}

async function until(cond: () => boolean, timeout = 10000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

const hasImage = (w: string) => w.includes('\x1b]1337;File=') || w.includes('\x1b_Ga=T');

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(['iterm2', 'kitty'] as const)('cursor handling (%s)', (format) => {
  it('saves/restores the cursor and positions relative to Ink\'s frame', async () => {
    const writes = spyStdout();
    // Non-fullscreen frame: one header line, then a 4-row chart. Ink leaves the cursor on
    // the line after the frame (5 lines tall), so the chart's top row is 4 lines up, col 1.
    const instance = render(
      <Box flexDirection="column">
        <Text>header</Text>
        <InkUPlot opts={opts} data={data} width={20} height={4} format={format} />
      </Box>,
    );
    await until(() => writes.some(hasImage));
    const stamp = writes.find(hasImage)!;

    expect(stamp.startsWith('\x1b7')).toBe(true);
    expect(stamp.endsWith('\x1b8')).toBe(true);
    expect(stamp).not.toMatch(/\x1b\[\d+;\d+H/); // no absolute positioning
    expect(stamp).toContain('\x1b[4A\x1b[1G');

    instance.unmount();
    const cleanup = writes.slice(writes.indexOf(stamp) + 1).filter((w) => w.length > 0);
    for (const w of cleanup) {
      expect(w.startsWith('\x1b7') && w.endsWith('\x1b8')).toBe(true);
      expect(w).not.toMatch(/\x1b\[\d+;\d+H/);
    }
  });
});

describe('kitty image ids', () => {
  it('gives each chart its own ids, and unmounting one deletes only its own', async () => {
    const writes = spyStdout();
    const ids = () => [...writes.join('').matchAll(/\x1b_Ga=T,i=(\d+),/g)].map((m) => Number(m[1]));
    const both = (
      <Box flexDirection="column">
        <InkUPlot opts={opts} data={data} width={20} height={4} format="kitty" />
        <InkUPlot opts={opts} data={data} width={20} height={4} format="kitty" />
      </Box>
    );
    const instance = render(both);
    await until(() => ids().length >= 2);
    const [a, b] = ids();
    expect(a).not.toBe(b);

    const before = writes.length;
    instance.rerender(
      <Box flexDirection="column">
        <InkUPlot opts={opts} data={data} width={20} height={4} format="kitty" />
      </Box>,
    );
    await new Promise((r) => setTimeout(r, 100));
    const deletes = [...writes.slice(before).join('').matchAll(/\x1b_Ga=d,d=I,i=(\d+),/g)].map((m) => Number(m[1]));
    expect(deletes.length).toBeGreaterThan(0);
    // The surviving chart's current image id must not be deleted.
    expect(deletes).not.toContain(a);
    instance.unmount();
  });
});
