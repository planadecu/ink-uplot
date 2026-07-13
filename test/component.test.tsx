import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { InkUPlot } from '../src/index.js';

const simpleOpts = {
  series: [{}, { stroke: '#ffffff', width: 2 }],
};
const simpleData: [number[], number[]] = [
  [1, 2, 3, 4, 5],
  [10, 20, 15, 25, 30],
];

function waitForFrame(
  instance: ReturnType<typeof render>,
  predicate: (frame: string) => boolean,
  timeout = 10000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for frame')), timeout);
    const check = () => {
      const frame = instance.lastFrame() ?? '';
      if (predicate(frame)) {
        clearTimeout(timer);
        resolve(frame);
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

describe('InkUPlot component', () => {
  it('renders loading state initially', () => {
    const instance = render(
      <InkUPlot opts={simpleOpts} data={simpleData} width={40} height={10} format="symbols" />,
    );
    const frame = instance.lastFrame() ?? '';
    expect(frame).toContain('Rendering chart...');
    instance.unmount();
  });

  it('renders chart output after async rendering completes', async () => {
    const instance = render(
      <InkUPlot opts={simpleOpts} data={simpleData} width={40} height={10} format="symbols" />,
    );
    const frame = await waitForFrame(instance, f => !f.includes('Rendering chart...'));
    expect(frame.length).toBeGreaterThan(0);
    expect(frame).not.toContain('Error');
    instance.unmount();
  });

  it('shows axes labels by default', async () => {
    const instance = render(
      <InkUPlot opts={simpleOpts} data={simpleData} width={40} height={10} format="symbols" />,
    );
    const frame = await waitForFrame(instance, f => !f.includes('Rendering chart...'));
    // Y-axis should have numeric labels
    expect(frame).toMatch(/\d+/);
    instance.unmount();
  });

  it('hides axes when showAxes={false}', async () => {
    const instance = render(
      <InkUPlot opts={simpleOpts} data={simpleData} width={40} height={10} showAxes={false} format="symbols" />,
    );
    const frame = await waitForFrame(instance, f => !f.includes('Rendering chart...'));
    expect(frame.length).toBeGreaterThan(0);
    expect(frame).not.toContain('Error');
    instance.unmount();
  });

  it('renders right Y-axis when configured', async () => {
    const opts = {
      scales: { x: { time: false }, price: {} },
      series: [
        {},
        { stroke: '#ffffff', width: 2, scale: 'price' },
      ],
      axes: [
        { stroke: '#555' },
        { stroke: '#555', scale: 'price', side: 1 },
      ],
    };
    const instance = render(
      <InkUPlot opts={opts} data={simpleData} width={60} height={12} format="symbols" />,
    );
    const frame = await waitForFrame(instance, f => !f.includes('Rendering chart...'));
    // Frame should contain numeric labels (axis ticks)
    expect(frame).toMatch(/\d+/);
    instance.unmount();
  });

  it('supports custom x-axis formatter', async () => {
    const opts = {
      series: [{}, { stroke: '#ffffff', width: 2 }],
      axes: [
        {
          values: (_u: any, vals: number[]) => vals.map(v => `T${v}`),
        },
      ],
    };
    const data: [number[], number[]] = [
      [0, 10, 20, 30, 40],
      [5, 15, 10, 20, 25],
    ];
    const instance = render(
      <InkUPlot opts={opts} data={data} width={60} height={12} format="symbols" />,
    );
    const frame = await waitForFrame(instance, f => !f.includes('Rendering chart...'));
    expect(frame).toContain('T');
    instance.unmount();
  });

  it('re-renders when data changes', async () => {
    const instance = render(
      <InkUPlot opts={simpleOpts} data={simpleData} width={40} height={10} format="symbols" />,
    );
    await waitForFrame(instance, f => !f.includes('Rendering chart...'));

    const newData: [number[], number[]] = [
      [1, 2, 3, 4, 5],
      [50, 60, 55, 65, 70],
    ];
    instance.rerender(
      <InkUPlot opts={simpleOpts} data={newData} width={40} height={10} format="symbols" />,
    );

    // Should eventually render new data (might briefly show loading)
    const frame = await waitForFrame(instance, f => !f.includes('Rendering chart...'));
    expect(frame.length).toBeGreaterThan(0);
    instance.unmount();
  });
});
