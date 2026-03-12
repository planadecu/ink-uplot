# CLAUDE.md — ink-uplot

## Project Overview

ink-uplot renders uPlot charts in the terminal via React Ink. It reuses standard browser uPlot configuration objects and produces truecolor Unicode block art using chafa-wasm, with text-based axes rendered as Ink `<Text>` components. Supports multiple output formats: symbols (Unicode art), kitty graphics protocol, sixels, and iTerm2 inline images — auto-detected from the terminal environment.

## Tech Stack

- **Language:** TypeScript (strict mode, ESM)
- **Package manager:** pnpm
- **Build:** tsup (ESM output with .d.ts)
- **Test:** Vitest (`pnpm test`)
- **Runtime deps:** uplot, canvas (node-canvas), path2d, chafa-wasm, ink, react
- **Peer deps:** uplot >=1.6.0, ink >=4.0.0, react >=18.0.0

## Commands

```bash
pnpm test          # Run all tests (53 tests, ~1.3s)
pnpm run build     # Build to dist/ (ESM + DTS)
npx tsc --noEmit   # Type-check without emitting
npx tsx examples/basic-line.tsx  # Run example
```

## Architecture

```
symbols mode:
  opts + data → [DOM shim] → [uPlot on node-canvas] → [getImageData] → [chafa-wasm] → [Ink <Text>]
                                                                           ↓
                                                                text axes (axes.ts) → [Ink <Text>]

raw mode (kitty/sixels/iterm2):
  opts + data → [DOM shim] → [uPlot on node-canvas + axes] → [getImageData] → [chafa-wasm] → stdout
                                                                                  (Ink renders placeholder lines only)
```

### Source Files

| File | Responsibility |
|------|---------------|
| `src/dom-shim.ts` | Fake DOM globals (document, window, navigator) for uPlot. Persistent singleton document — uPlot caches `doc` at import time. |
| `src/renderer.ts` | Orchestrates shim + dynamic uPlot import + canvas extraction. Returns ImageData. Handles braille vs pixel rendering modes. |
| `src/chafa.ts` | Wrapper around chafa-wasm. Converts pixel buffer to truecolor Unicode block art (symbols, sixels, kitty, iterm2). |
| `src/axes.ts` | Nice-numbers tick calculation (Heckbert 1990), tick positioning, timestamp auto-detection and formatting. |
| `src/braille.ts` | Pure function: pixel buffer → Unicode Braille string. 2x4 dot grid per character cell. Legacy/alternative renderer. |
| `src/color-sampler.ts` | Per-cell dominant color extraction → ANSI color name. Used with braille renderer. |
| `src/InkUPlot.tsx` | React Ink component. Auto-detects terminal format via `detectFormat()`. Symbols mode: renders chart via chafa-wasm with text axes. Raw mode (kitty/sixels/iterm2): writes image directly to stdout, Ink renders placeholder lines. |
| `src/types.ts` | Shared TypeScript interfaces (InkUPlotProps, BrailleOptions, etc.). |
| `src/index.ts` | Public API exports. |

### Critical Design Decisions

1. **Persistent document singleton** — uPlot captures `doc = document` at module load time (line 60 of uPlot.esm.js). `installDOMShim()` reuses the same document object across calls, swapping a mutable canvas factory function instead.

2. **Dynamic import of uPlot** — Must happen AFTER `installDOMShim()` sets globals. The renderer uses `await import('uplot')` and caches the constructor.

3. **Path2D polyfill** — uPlot uses `Path2D` for canvas clipping regions. node-canvas doesn't provide it. The `path2d` npm package is used, with `ctx.stroke/fill/clip` patched to replay path commands via `buildPathInCanvas()`.

4. **Async microtask flushing** — Synchronous `queueMicrotask` override breaks uPlot's internal ordering (causes NaN canvas dimensions). The renderer leaves `queueMicrotask` as native async and uses `await Promise.resolve()` x2 to flush.

5. **opts sanitization** — `cursor`, `select`, `legend` are disabled; `focus.alpha` set to 1. These are DOM-only features that would crash in the shim.

6. **chafa-wasm for rendering** — Replaced braille encoding with chafa-wasm for truecolor Unicode block art. Config values use `.value` on Emscripten enum objects (not strings). Canvas axes are hidden; text axes are rendered separately by the component.

7. **Text axes from data** — uPlot's canvas-rendered axes are hidden (`show: false`). The component calculates tick positions using the nice-numbers algorithm, renders Y-axis labels as `<Text>` (left/right based on `side` in opts.axes), and X-axis ticks at the bottom. Supports custom `values` formatter on axes (uPlot-compatible signature).

8. **Canvas dimension cap** — `MAX_DIM = 4096` and `MAX_PIXELS = 2M` prevent chafa-wasm WASM heap OOB access on large terminals.

9. **Terminal format auto-detection** — `detectFormat()` checks env vars in priority order: `TERM` (most reliable, propagates through SSH) → `TERM_PROGRAM` → terminal-specific vars (`KITTY_WINDOW_ID`, `ITERM_SESSION_ID`, etc.) → fallback to 'symbols'. Result is cached at module level.

10. **Raw format rendering** — Kitty/sixels/iterm2 images bypass Ink's text rendering entirely. The image is written directly to `process.stdout.write()` with absolute cursor positioning (`\x1b[1;1H`). Ink only renders invisible placeholder lines to reserve vertical space. `setOutput()` is NOT called in raw mode — Ink re-renders write spaces that erase kitty images.

11. **Render serialization** — `renderToImageData` uses global DOM state and is not reentrant. A module-level `renderLock` promise chain serializes all async render calls.

## Examples

Examples are in `examples/`. Run with `npx tsx examples/<name>.tsx`.

| Example | What it demonstrates |
|---------|---------------------|
| `basic-line.tsx` | Simple sine wave with axes |
| `multi-series.tsx` | Three overlapping colored series |
| `dual-y-axis.tsx` | Left + right Y-axis via `scale` and `side` config |
| `shaded-area.tsx` | Area charts with translucent `fill` |
| `timestamps.tsx` | Unix timestamp X-axis with auto date formatting |
| `live-trading.tsx` | Streaming data at 100ms, mm:ss X-axis, last-value highlight |
| `no-axes.tsx` | Borderless chart with `showAxes={false}` |
| `line-width-test.tsx` | Interactive line width comparison (←/→ keys) |

## Testing

Tests are in `test/`. Each source module has a corresponding test file:

- `test/braille.test.ts` — 10 tests for Braille encoding correctness (dot positions, threshold, invert)
- `test/dom-shim.test.ts` — 7 tests for DOM shim globals and stub elements
- `test/renderer.test.ts` — 3 tests for uPlot rendering (no crash, pixels present, dimensions)
- `test/color-sampler.test.ts` — 9 tests for RGB → ANSI color mapping
- `test/axes.test.ts` — 13 tests for tick calculation, positioning, timestamp detection/formatting
- `test/chafa.test.ts` — 3 tests for chafa-wasm pixel-to-terminal conversion
- `test/component.test.tsx` — 7 tests for InkUPlot React component (uses ink-testing-library)
- `test/integration.test.ts` — 1 full pipeline test (opts → braille string)

## Conventions

- All imports use `.js` extensions (ESM requirement)
- No default exports — named exports only
- `any` types allowed in dom-shim.ts (necessary for DOM stub interfaces)
- Vitest globals enabled (`describe`, `it`, `expect` without imports)

## Known Limitations

- `renderToImageData` must not be called concurrently (global DOM state)
- uPlot must not be statically imported elsewhere before the renderer's first call
- node-canvas requires system Cairo/Pango libraries
- Shaded area fills need alpha >= 0.3 to be visible through chafa
