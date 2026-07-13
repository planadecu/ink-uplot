import React, { useState, useEffect } from 'react';
import { render, useStdout, useInput, Box, Text } from 'ink';
import { InkUPlot } from '../src/index.js';

const count = 200;
const timestamps = Array.from({ length: count }, (_, i) => i);
const values = timestamps.map(t => Math.sin(t / 5) * 40 + 50);
const data: [number[], number[]] = [timestamps, values];

const WIDTHS = [1, 2, 3, 5, 8];

function App({ exit }: { exit: () => void }) {
  const { stdout } = useStdout();
  const [cols, setCols] = useState(stdout.columns ?? 80);
  const [widthIdx, setWidthIdx] = useState(0);

  useEffect(() => {
    // Debounce resize to a single trailing update (~200ms after the last event) so a
    // drag doesn't thrash layout — effectively "resize on release".
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => setCols(stdout.columns ?? 80), 200);
    };
    stdout.on('resize', onResize);
    return () => { clearTimeout(resizeTimer); stdout.off('resize', onResize); };
  }, [stdout]);

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) exit();
    if (key.leftArrow) setWidthIdx(i => Math.max(0, i - 1));
    if (key.rightArrow) setWidthIdx(i => Math.min(WIDTHS.length - 1, i + 1));
  });

  const w = WIDTHS[widthIdx]!;
  const opts = {
    series: [{}, { stroke: 'cyan', label: 'Value', width: w }],
  };

  return (
    <Box flexDirection="column">
      <Box gap={2} paddingX={1}>
        <Text bold>Line width test</Text>
        <Text>series.width = <Text color="cyan" bold>{w}</Text></Text>
        <Text dimColor>(←/→ to change, q to quit)</Text>
      </Box>
      <InkUPlot opts={opts} data={data} width={cols} height={20} />
    </Box>
  );
}

const app = render(<App exit={() => app.unmount()} />);
await app.waitUntilExit();
