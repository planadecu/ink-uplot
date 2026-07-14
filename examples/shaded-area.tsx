// Shaded area chart — fill under the curve
import React, { useState, useEffect } from 'react';
import { render, useStdout, useInput } from 'ink';
import { InkUPlot } from '../src/index.js';

const count = 200;
const x = Array.from({ length: count }, (_, i) => i);
const y1 = x.map(t => Math.sin(t / 12) * 30 + 60);
const y2 = x.map(t => Math.cos(t / 15) * 20 + 30);

const opts = {
  scales: { x: { time: false } },
  series: [
    {},
    {
      stroke: 'rgba(0, 200, 255, 1)',
      fill: 'rgba(0, 200, 255, 0.4)',
      label: 'Signal A',
      width: 2,
    },
    {
      stroke: 'rgba(255, 100, 50, 1)',
      fill: 'rgba(255, 100, 50, 0.4)',
      label: 'Signal B',
      width: 2,
    },
  ],
  axes: [
    { stroke: '#999', grid: { stroke: '#222' } },
    { stroke: '#999', grid: { stroke: '#222' } },
  ],
};

const data: [number[], number[], number[]] = [x, y1, y2];

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
