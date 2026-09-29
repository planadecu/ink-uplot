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

describe('inline image cleanup after a terminal resize (iterm2)', () => {
  it('does not blank at stale coordinates once the terminal size has changed', async () => {
    let instance!: ReturnType<typeof render>;
    const writes = spyStdout(() => instance?.frames.length ?? 0);
    instance = render(<InkUPlot opts={opts} data={data} width={40} height={8} format="iterm2" />);
    await until(() => writes.some(isStamp));
    const before = writes.length;

    // The terminal shrinks: it reflows, and Ink repaints. The old image position no longer
    // means anything, so blanking it would wipe whatever now sits there (and wrap past the
    // new right edge).
    Object.defineProperty(instance.stdout, 'columns', { get: () => 60, configurable: true });
    instance.rerender(<InkUPlot opts={opts} data={data} width={30} height={6} format="iterm2" />);
    await until(() => writes.slice(before).some(isStamp));

    expect(writes.slice(before).filter(isBlank)).toHaveLength(0);
    instance.unmount();
  });

  it('never blanks past the right edge of the terminal', async () => {
    let instance!: ReturnType<typeof render>;
    const writes = spyStdout(() => instance?.frames.length ?? 0);
    // Chart starts at column 71 of a 100-column terminal and claims 50 columns.
    instance = render(
      <Box paddingLeft={70}>
        <InkUPlot opts={opts} data={data} width={50} height={4} format="iterm2" />
      </Box>,
    );
    await until(() => writes.some(isStamp));

    instance.rerender(<Box><Text>gone</Text></Box>);
    await until(() => writes.some(isBlank));
    const blank = writes.find(isBlank)!;
    const widest = Math.max(...(blank.text.match(/ +/g) ?? ['']).map((s) => s.length));
    expect(widest).toBeLessThanOrEqual(100 - 71 + 1);
    instance.unmount();
  });
});

describe('inline image cleanup stays inside the frame (iterm2)', () => {
  it('never blanks rows below the cursor Ink leaves after the frame', async () => {
    let instance!: ReturnType<typeof render>;
    const writes = spyStdout(() => instance?.frames.length ?? 0);
    // A 10-row chart clipped into a 4-row frame: the stamp's rows run past the frame. Rows
    // below the cursor don't exist on screen; "moving up" a negative amount is a no-op, so
    // blanking them would repeatedly overwrite the cursor's own line (e.g. a status bar).
    instance = render(
      <Box height={4} overflow="hidden">
        <InkUPlot opts={opts} data={data} width={20} height={10} format="iterm2" />
      </Box>,
    );
    await until(() => writes.some(isStamp));
    instance.rerender(<Box height={4}><Text>gone</Text></Box>);
    await until(() => writes.some(isBlank));
    const blank = writes.find(isBlank)!;
    const moves = [...blank.text.matchAll(/\x1b7(?:\x1b\[(\d+)A)?\x1b\[\d+G/g)].map((m) => Number(m[1] ?? 0));
    // Non-fullscreen: cursor is on the line after the 4-line frame, so at most 4 rows (up 4..1).
    expect(moves.length).toBeLessThanOrEqual(4);
    expect(Math.min(...moves)).toBeGreaterThanOrEqual(1);
    instance.unmount();
  });
});

describe('inline image cleanup: when a resize still needs the blank (iterm2)', () => {
  // The blank runs before Ink writes its next frame, so the stamp's cursor-relative
  // coordinates stay valid unless Ink cleared (width shrink) or a fullscreen frame's anchor
  // moved (row count changed). Otherwise, skipping the blank leaves old image cells behind.
  const setSize = (instance: ReturnType<typeof render>, size: { columns?: number; rows?: number; isTTY?: boolean }) => {
    for (const [k, v] of Object.entries(size)) {
      Object.defineProperty(instance.stdout, k, { get: () => v, configurable: true });
    }
  };

  it('still blanks after the terminal grows wider', async () => {
    let instance!: ReturnType<typeof render>;
    const writes = spyStdout(() => instance?.frames.length ?? 0);
    instance = render(<InkUPlot opts={opts} data={data} width={40} height={8} format="iterm2" />);
    await until(() => writes.some(isStamp));
    const before = writes.length;
    setSize(instance, { columns: 140 });
    instance.rerender(<InkUPlot opts={opts} data={data} width={30} height={6} format="iterm2" />);
    await until(() => writes.slice(before).some(isStamp));
    expect(writes.slice(before).filter(isBlank).length).toBeGreaterThan(0);
    instance.unmount();
  });

  it('still blanks after a height change when the frame is not fullscreen', async () => {
    let instance!: ReturnType<typeof render>;
    const writes = spyStdout(() => instance?.frames.length ?? 0);
    instance = render(<InkUPlot opts={opts} data={data} width={40} height={8} format="iterm2" />);
    await until(() => writes.some(isStamp));
    const before = writes.length;
    setSize(instance, { rows: 50 });
    instance.rerender(<InkUPlot opts={opts} data={data} width={40} height={6} format="iterm2" />);
    await until(() => writes.slice(before).some(isStamp));
    expect(writes.slice(before).filter(isBlank).length).toBeGreaterThan(0);
    instance.unmount();
  });

  it('skips the blank when a fullscreen frame\'s row count changed (its cursor anchor moved)', async () => {
    let instance!: ReturnType<typeof render>;
    const writes = spyStdout(() => instance?.frames.length ?? 0);
    instance = render(<InkUPlot opts={opts} data={data} width={40} height={8} format="iterm2" />);
    // The 8-row frame fills an 8-row TTY: fullscreen.
    setSize(instance, { isTTY: true, rows: 8 });
    instance.rerender(<InkUPlot opts={opts} data={data} width={40} height={8} format="iterm2" key="fs" />);
    await until(() => writes.some(isStamp));
    const before = writes.length;
    setSize(instance, { rows: 6 });
    instance.rerender(<InkUPlot opts={opts} data={data} width={40} height={6} format="iterm2" key="fs" />);
    await until(() => writes.slice(before).some(isStamp));
    expect(writes.slice(before).filter(isBlank)).toHaveLength(0);
    instance.unmount();
  });
});

