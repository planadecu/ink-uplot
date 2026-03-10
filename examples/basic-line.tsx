import React from 'react';
import { render } from 'ink';
import { InkUPlot } from '../src/index.js';

const count = 50;
const timestamps = Array.from({ length: count }, (_, i) => i);
const values = timestamps.map(t => Math.sin(t / 5) * 40 + 50);

const opts = {
  title: 'Sine Wave',
  width: 160,
  height: 96,
  series: [
    {},
    { stroke: 'cyan', label: 'Value', width: 2 },
  ],
  axes: [
    { stroke: '#555', grid: { stroke: '#333' } },
    { stroke: '#555', grid: { stroke: '#333' } },
  ],
};

const data: [number[], number[]] = [timestamps, values];

function App() {
  return <InkUPlot opts={opts} data={data} width={80} height={24} threshold={30} />;
}

render(<App />);
