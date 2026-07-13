// Live trading chart — data streams in from the right, refreshes every 100ms
import React, { useState, useEffect, useRef } from 'react';
import { render, useStdout, useInput, Box, Text } from 'ink';
import { InkUPlot } from '../src/index.js';

const WINDOW = 200;       // visible data points
const INTERVAL_MS = 100;  // refresh rate

// Simulate a random-walk price starting at 100
function generatePrice(prev: number): number {
  const drift = (Math.random() - 0.498) * 0.8;
  const vol = (Math.random() - 0.5) * 0.3;
  return Math.max(1, prev + drift + vol);
}

function App({ exit }: { exit: () => void }) {
  const { stdout } = useStdout();
  const [size, setSize] = useState({ cols: stdout.columns ?? 80, rows: stdout.rows ?? 24 });
  const startTime = useRef(Date.now());
  const priceRef = useRef(100);
  const frameTimesRef = useRef<number[]>([]);
  const [fps, setFps] = useState(0);

  // Seed initial buffer
  const [buf, setBuf] = useState<{ xs: number[]; ys: number[] }>(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    let p = 100;
    for (let i = 0; i < WINDOW; i++) {
      xs.push((-WINDOW + i + 1) * (INTERVAL_MS / 1000));
      p = generatePrice(p);
      ys.push(p);
    }
    priceRef.current = p;
    return { xs, ys };
  });

  useEffect(() => {
    const onResize = () => setSize({ cols: stdout.columns ?? 80, rows: stdout.rows ?? 24 });
    stdout.on('resize', onResize);
    return () => { stdout.off('resize', onResize); };
  }, [stdout]);

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = (Date.now() - startTime.current) / 1000;
      const newPrice = generatePrice(priceRef.current);
      priceRef.current = newPrice;

      const now = performance.now();
      const times = frameTimesRef.current;
      times.push(now);
      // Keep only the last second of frame timestamps
      while (times.length > 0 && times[0] < now - 1000) times.shift();
      setFps(times.length);

      setBuf(prev => {
        const xs = [...prev.xs.slice(1), elapsed];
        const ys = [...prev.ys.slice(1), newPrice];
        return { xs, ys };
      });
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) exit();
  });

  const lastPrice = buf.ys[buf.ys.length - 1];
  const prevPrice = buf.ys[buf.ys.length - 2];
  const direction = lastPrice >= prevPrice ? 'green' : 'red';
  const arrow = lastPrice >= prevPrice ? '▲' : '▼';

  const opts = {
    scales: { x: { time: false }, y: {} },
    series: [
      {},
      {
        stroke: '#00e5ff',
        fill: 'rgba(0, 229, 255, 0.15)',
        label: 'Price',
        width: 2,
        scale: 'y',
      },
    ],
    axes: [
      {
        stroke: '#555',
        grid: { stroke: '#222' },
        values: (_u: any, vals: number[]) => vals.map(v => {
          const m = Math.floor(Math.abs(v) / 60);
          const s = Math.floor(Math.abs(v) % 60);
          return `${v < 0 ? '-' : ''}${m}:${String(s).padStart(2, '0')}`;
        }),
      },
      { stroke: '#555', grid: { stroke: '#222' }, scale: 'y', side: 1 },
    ],
  };

  const data: [number[], number[]] = [buf.xs, buf.ys];
  const chartHeight = size.rows - 3; // room for header + x-axis

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold> LIVE </Text>
        <Text> </Text>
        <Text color={direction} bold>{arrow} {lastPrice.toFixed(2)}</Text>
        <Text dimColor>  ({buf.xs[buf.xs.length - 1].toFixed(1)}s)</Text>
        <Text dimColor>  {fps} fps</Text>
      </Box>
      <InkUPlot
        opts={opts}
        data={data}
        width={size.cols}
        height={chartHeight}
      />
    </Box>
  );
}

const app = render(<App exit={() => app.unmount()} />);
await app.waitUntilExit();
