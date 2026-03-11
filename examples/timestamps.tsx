// Time-series with unix timestamps — tests auto-detection of date formatting
import React, { useState, useEffect } from 'react';
import { render, useStdout, useInput } from 'ink';
import { InkUPlot } from '../src/index.js';

// Generate 90 days of fake price data
const now = Math.floor(Date.now() / 1000);
const daySeconds = 86400;
const count = 90;
const timestamps = Array.from({ length: count }, (_, i) => now - (count - i) * daySeconds);
const prices = timestamps.reduce<number[]>((acc, _, i) => {
  const prev = acc[i - 1] ?? 42000;
  acc.push(prev + (Math.random() - 0.48) * 800);
  return acc;
}, []);

const opts = {
  series: [
    {},
    { stroke: '#f7931a', label: 'BTC/USD', width: 2 },
  ],
  axes: [
    { stroke: '#555', grid: { stroke: '#222' } },
    { stroke: '#555', grid: { stroke: '#222' } },
  ],
};

const data: [number[], number[]] = [timestamps, prices];

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
