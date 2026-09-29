import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { Box, Text } from 'ink';
import { render } from 'ink-testing-library';
import { InkUPlot } from '../src/index.js';

// Inline images (iTerm2 protocol, used for VS Code) live in the terminal's text cells:
// printing anything into a cell drops that part of the image. When the chart goes away or
// changes size, its old cells must be blanked *before* the host's next Ink frame is written
// (so the frame lands on top), with default attributes (so unchanged blank cells look right).

const opts = { series: [{}, { stroke: '#ffffff', width: 2 }] };
const data: [number[], number[]] = [[1, 2, 3], [10, 20, 15]];

type Write = { text: string; framesSoFar: number };

function spyStdout(frames: () => number): Write[] {
  const writes: Write[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    writes.push({ text: String(chunk), framesSoFar: frames() });
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

const isStamp = (w: Write) => w.text.includes('\x1b]1337;File=');
// A blanking write: cursor positioning (column move), optional SGR, then a run of spaces;
// no image payload.
const BLANK_ROW = /\x1b\[\d+G(\x1b\[[\d;]*m)? {4,}/g;
const isBlank = (w: Write) => new RegExp(BLANK_ROW.source).test(w.text) && !isStamp(w);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('inline image cleanup (iterm2)', () => {
  it('blanks the image with default attributes before the replacement frame on unmount', async () => {
    let instance!: ReturnType<typeof render>;
    const writes = spyStdout(() => instance?.frames.length ?? 0);
    instance = render(<InkUPlot opts={opts} data={data} width={20} height={6} format="iterm2" />);
    await until(() => writes.some(isStamp));

    instance.rerender(<Box><Text>TABLE VIEW</Text></Box>);
    await until(() => (instance.lastFrame() ?? '').includes('TABLE VIEW'));

    const blank = writes.find(isBlank);
    expect(blank, 'expected the old image cells to be blanked').toBeDefined();
    expect(blank!.text).not.toContain('\x1b[40m'); // not painted black
    const tableFrame = instance.frames.findIndex((f) => f.includes('TABLE VIEW'));
    expect(blank!.framesSoFar).toBeLessThanOrEqual(tableFrame); // written before the table frame
    instance.unmount();
  });

  it('blanks the old image area when the chart changes size', async () => {
    let instance!: ReturnType<typeof render>;
    const writes = spyStdout(() => instance?.frames.length ?? 0);
    instance = render(<InkUPlot opts={opts} data={data} width={20} height={8} format="iterm2" />);
    await until(() => writes.some(isStamp));
    const firstStamps = writes.filter(isStamp).length;

    instance.rerender(<InkUPlot opts={opts} data={data} width={20} height={5} format="iterm2" />);
    await until(() => writes.filter(isStamp).length > firstStamps);

    const blanks = writes.filter(isBlank);
    expect(blanks.length).toBeGreaterThan(0);
    // The blank covers the old 8-row area, not just the new 5 rows.
    const rowsBlanked = (blanks[0]!.text.match(BLANK_ROW) ?? []).length;
    expect(rowsBlanked).toBe(8);
    // And it comes before the new, smaller image is stamped.
    const blankIdx = writes.indexOf(blanks[0]!);
    const newStampIdx = writes.findIndex((w, i) => i > blankIdx && isStamp(w));
    expect(newStampIdx).toBeGreaterThan(blankIdx);
    instance.unmount();
  });
});
