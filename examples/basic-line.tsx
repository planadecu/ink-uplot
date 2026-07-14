import React, { useState, useEffect } from 'react';
import { render, useStdout, useInput } from 'ink';
import { InkUPlot } from '../src/index.js';

const count = 200;
const timestamps = Array.from({ length: count }, (_, i) => i);
const values = timestamps.map(t => Math.sin(t / 5) * 40 + 50);

const opts = {
  scales: { x: { time: false } },
  series: [
    {},
    { stroke: 'cyan', label: 'Value', width: 2 },
  ],
  axes: [
    { stroke: '#999', grid: { stroke: '#333' } },
    { stroke: '#999', grid: { stroke: '#333' } },
  ],
};

const data: [number[], number[]] = [timestamps, values];

function App({ exit }: { exit: () => void }) {
  const { stdout } = useStdout();
  const [size, setSize] = useState({ cols: stdout.columns ?? 80, rows: stdout.rows ?? 24 });

  useEffect(() => {
    // Debounce resize to a single trailing update (~200ms after the last event) so a
    // drag doesn't thrash layout — effectively "resize on release".
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => setSize({ cols: stdout.columns ?? 80, rows: stdout.rows ?? 24 }), 200);
    };
    stdout.on('resize', onResize);
    return () => { clearTimeout(resizeTimer); stdout.off('resize', onResize); };
  }, [stdout]);

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) exit();
  });

  return <InkUPlot opts={opts} data={data} width={size.cols} height={size.rows} />;
}

const app = render(<App exit={() => app.unmount()} />);
await app.waitUntilExit();
