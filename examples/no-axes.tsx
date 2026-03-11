// Minimal chart with no axes — just the data curve filling the terminal
import React, { useState, useEffect } from 'react';
import { render, useStdout, useInput } from 'ink';
import { InkUPlot } from '../src/index.js';

const count = 300;
const x = Array.from({ length: count }, (_, i) => i);
const y = x.map(t => Math.sin(t / 10) * Math.cos(t / 30) * 50 + 50);

const opts = {
  series: [
    {},
    { stroke: '#00ff88', width: 3 },
  ],
};

const data: [number[], number[]] = [x, y];

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

  return <InkUPlot opts={opts} data={data} width={size.cols} height={size.rows} showAxes={false} />;
}

const app = render(<App exit={() => app.unmount()} />);
await app.waitUntilExit();
