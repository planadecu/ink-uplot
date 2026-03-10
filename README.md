# ink-uplot

Render [uPlot](https://github.com/leeoniya/uPlot) charts in the terminal using Unicode Braille characters. Reuse your existing browser uPlot configuration objects in [React Ink](https://github.com/vadimdemedes/ink) CLI applications.

```
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⡆⠀⠀⠀⣀⣠⣤⣤⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⡇⠀⣠⣾⡿⠋⠉⠙⠿⣿⣶⣄⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣧⣾⡿⠋⠀⠀⠀⠀⠀⠀⠙⣿⣧⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⠟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢿⣷⣄⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⢿⣷⣦⣤⣶⣿
```

## Install

```bash
pnpm add ink-uplot uplot canvas ink react
```

> **Note:** `canvas` ([node-canvas](https://github.com/Automattic/node-canvas)) requires system dependencies (Cairo, Pango). See [node-canvas installation](https://github.com/Automattic/node-canvas#compiling) for platform-specific instructions. On macOS: `brew install pkg-config cairo pango`.

## Quick Start

```tsx
import React from 'react';
import { render } from 'ink';
import { InkUPlot } from 'ink-uplot';

const opts = {
  series: [
    {},
    { stroke: 'cyan', label: 'Price', width: 2 },
  ],
  axes: [
    { stroke: '#555', grid: { stroke: '#333' } },
    { stroke: '#555', grid: { stroke: '#333' } },
  ],
};

const data = [
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],  // x values
  [10, 25, 15, 30, 20, 35, 25, 40, 30, 45],  // y values
];

function App() {
  return <InkUPlot opts={opts} data={data} width={80} height={24} />;
}

render(<App />);
```

## How It Works

1. A minimal DOM shim provides fake `document`/`window` globals so uPlot can initialize in Node.js
2. uPlot renders axes, grid, and series data onto a [node-canvas](https://github.com/Automattic/node-canvas) instance
3. The canvas pixel buffer is read via `getImageData()`
4. Each 2x4 pixel block is mapped to a Unicode Braille character (U+2800-U+28FF)
5. Optional: dominant color per cell is sampled and mapped to ANSI terminal colors
6. Output is rendered via Ink `<Text>` components

The Braille dot grid gives 2x horizontal and 4x vertical resolution compared to regular characters, producing high-fidelity terminal charts.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `opts` | `uPlot.Options` | *required* | Standard uPlot options. Interactive options (cursor, select, legend) are automatically stripped. |
| `data` | `uPlot.AlignedData` | *required* | uPlot data array — same format as browser uPlot. |
| `width` | `number` | `stdout.columns` or `80` | Chart width in terminal columns. |
| `height` | `number` | `24` | Chart height in terminal rows. |
| `threshold` | `number` | `128` | Luminance threshold (0-255) for pixel-to-dot conversion. Lower = more dots. |
| `color` | `boolean` | `true` | Enable ANSI color output by sampling dominant color per Braille cell. |
| `background` | `'dark' \| 'light'` | `'dark'` | Terminal background. `'dark'` renders light-on-dark; `'light'` inverts. |

## Lower-Level API

For custom pipelines, the internal functions are exported:

```ts
import { renderToImageData, pixelsToBraille, sampleCellColors } from 'ink-uplot';

// Render uPlot to a pixel buffer
const imageData = await renderToImageData(opts, data, 160, 96);

// Convert pixels to Braille string
const braille = pixelsToBraille(imageData, { threshold: 100 });
console.log(braille);

// Get per-cell ANSI colors
const colors = sampleCellColors(imageData, 100);
// colors[row][col] = 'red' | 'green' | 'blue' | ... | null
```

## Tips

- **Threshold tuning:** Lower threshold values (30-80) render more dots, producing denser charts good for dark terminals. Higher values (150-200) render only the brightest pixels.
- **Embedded charts:** The component only occupies its `width` x `height` in terminal cells. Wrap it in an Ink `<Box>` to embed in larger layouts.
- **Axes:** uPlot renders axis labels directly on the canvas, so they appear in the Braille output automatically. Set `axes: [{ show: false }, { show: false }]` to hide them.
- **Series colors:** Use high-contrast colors (`'cyan'`, `'#ff0000'`, `'white'`) for best visibility in Braille.
- **Performance:** Rendering is async. The component shows "Rendering chart..." until the first frame is ready.

## Requirements

- Node.js >= 18
- System dependencies for [node-canvas](https://github.com/Automattic/node-canvas#compiling)

## License

ISC
