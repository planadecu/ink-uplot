// Multiple overlapping series on the same Y axis
import React, { useState, useEffect } from 'react';
import { render, useStdout, useInput } from 'ink';
import { InkUPlot } from '../src/index.js';

const count = 200;
const x = Array.from({ length: count }, (_, i) => i);
const sin = x.map(t => Math.sin(t / 8) * 40 + 50);
const cos = x.map(t => Math.cos(t / 8) * 30 + 50);
const saw = x.map(t => ((t % 40) / 40) * 80 + 10);

const opts = {
  series: [
    {},
    { stroke: 'cyan', label: 'Sin', width: 2 },
    { stroke: '#ff6600', label: 'Cos', width: 2 },
    { stroke: '#aa44ff', label: 'Saw', width: 2 },
  ],
  axes: [
    { stroke: '#555', grid: { stroke: '#222' } },
    { stroke: '#555', grid: { stroke: '#222' } },
  ],
};

const data: [number[], number[], number[], number[]] = [x, sin, cos, saw];

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
