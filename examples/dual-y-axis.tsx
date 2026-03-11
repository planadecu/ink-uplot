// Dual Y-axis: price on left scale, volume on right scale
import React, { useState, useEffect } from 'react';
import { render, useStdout, useInput } from 'ink';
import { InkUPlot } from '../src/index.js';

const count = 150;
const x = Array.from({ length: count }, (_, i) => i);
const price = x.map(t => Math.sin(t / 15) * 200 + 500 + Math.random() * 30);
const volume = x.map(t => Math.abs(Math.sin(t / 7)) * 8000 + 2000 + Math.random() * 1000);

const opts = {
  scales: {
    x: { time: false },
    y: {},
    volume: {
      range: (u: any, min: number, max: number) => [0, max * 1.2] as [number, number],
    },
  },
  series: [
    {},
    { stroke: '#00ccff', label: 'Price', width: 2, scale: 'y' },
    { stroke: '#ffaa00', label: 'Volume', width: 1, scale: 'volume' },
  ],
  axes: [
    { stroke: '#555', grid: { stroke: '#222' } },
    { stroke: '#00ccff', grid: { stroke: '#222' }, scale: 'y' },
    { stroke: '#ffaa00', grid: { show: false }, scale: 'volume', side: 1 },
  ],
};

const data: [number[], number[], number[]] = [x, price, volume];

function App({ exit }: { exit: () => void }) {
  const { stdout } = useStdout();
  const [size, setSize] = useState({ cols: stdout.columns ?? 80, rows: stdout.rows ?? 24 });

  useEffect(() => {
    const onResize = () => setSize({ cols: stdout.columns ?? 80, rows: stdout.rows ?? 24 });
    stdout.on('resize', onResize);
    return () => { stdout.off('resize', onResize); };
  }, [stdout]);

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) exit();
  });

  return <InkUPlot opts={opts} data={data} width={size.cols} height={size.rows} />;
}

const app = render(<App exit={() => app.unmount()} />);
await app.waitUntilExit();
