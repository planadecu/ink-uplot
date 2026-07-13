// Minimal STATIC chart — no animation, no header, no live updates.
// Isolates the core question: does InkUPlot render one chart in this terminal?
//   npx tsx examples/simple-chart.tsx      (auto-detect format)
//   INK_UPLOT_FORMAT=kitty  npx tsx examples/simple-chart.tsx
//   INK_UPLOT_FORMAT=iterm2 npx tsx examples/simple-chart.tsx
//   INK_UPLOT_FORMAT=sixels npx tsx examples/simple-chart.tsx
//   INK_UPLOT_FORMAT=symbols npx tsx examples/simple-chart.tsx
// Press q or Ctrl-C to quit.
import React from 'react';
import { render, useApp, useInput } from 'ink';
import { InkUPlot } from '../src/index.js';

const xs = Array.from({ length: 64 }, (_, i) => i);
const ys = xs.map(x => Math.sin(x / 6) * 10 + 50);

const opts = {
  series: [{}, { stroke: 'cyan', width: 2, fill: 'rgba(0,220,255,0.2)' }],
};

function App() {
  const { exit } = useApp();
  useInput((input, key) => { if (input === 'q' || key.escape) exit(); });

  const fmt = process.env.INK_UPLOT_FORMAT as any;
  return (
    <InkUPlot
      opts={opts}
      data={[xs, ys]}
      height={20}
      {...(fmt ? { format: fmt } : {})}
    />
  );
}

render(<App />);
