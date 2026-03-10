# CLAUDE.md — ink-uplot

## Project Overview

ink-uplot renders uPlot charts as Unicode Braille characters in the terminal via React Ink. It reuses standard browser uPlot configuration objects.

## Tech Stack

- **Language:** TypeScript (strict mode, ESM)
- **Package manager:** pnpm
- **Build:** tsup (ESM output with .d.ts)
- **Test:** Vitest (`pnpm test`)
- **Runtime deps:** uplot, canvas (node-canvas), path2d, ink, react
- **Peer deps:** uplot >=1.6.0, ink >=4.0.0, react >=18.0.0

## Commands

```bash
pnpm test          # Run all tests (30 tests, ~260ms)
pnpm run build     # Build to dist/ (ESM + DTS)
npx tsc --noEmit   # Type-check without emitting
npx tsx examples/basic-line.tsx  # Run example
```

## Architecture

```
opts + data → [DOM shim] → [uPlot on node-canvas] → [getImageData] → [Braille encoding] → [Ink <Text>]
```

### Source Files

| File | Responsibility |
|------|---------------|
| `src/dom-shim.ts` | Fake DOM globals (document, window, navigator) for uPlot. Persistent singleton document — uPlot caches `doc` at import time. |
| `src/renderer.ts` | Orchestrates shim + dynamic uPlot import + canvas extraction. Returns ImageData. |
| `src/braille.ts` | Pure function: pixel buffer → Unicode Braille string. 2x4 dot grid per character cell. |
| `src/color-sampler.ts` | Per-cell dominant color extraction → ANSI color name. |
| `src/InkUPlot.tsx` | React Ink component wiring everything together. |
| `src/types.ts` | Shared TypeScript interfaces. |
| `src/index.ts` | Public API exports. |

### Critical Design Decisions

1. **Persistent document singleton** — uPlot captures `doc = document` at module load time (line 60 of uPlot.esm.js). `installDOMShim()` reuses the same document object across calls, swapping a mutable canvas factory function instead.

2. **Dynamic import of uPlot** — Must happen AFTER `installDOMShim()` sets globals. The renderer uses `await import('uplot')` and caches the constructor.

3. **Path2D polyfill** — uPlot uses `Path2D` for canvas clipping regions. node-canvas doesn't provide it. The `path2d` npm package is used, with `ctx.stroke/fill/clip` patched to replay path commands via `buildPathInCanvas()`.

4. **Async microtask flushing** — Synchronous `queueMicrotask` override breaks uPlot's internal ordering (causes NaN canvas dimensions). The renderer leaves `queueMicrotask` as native async and uses `await Promise.resolve()` x2 to flush.

5. **opts sanitization** — `cursor`, `select`, `legend` are disabled; `focus.alpha` set to 1. These are DOM-only features that would crash in the shim.

## Testing

Tests are in `test/`. Each source module has a corresponding test file:

- `test/braille.test.ts` — 10 tests for Braille encoding correctness (dot positions, threshold, invert)
- `test/dom-shim.test.ts` — 7 tests for DOM shim globals and stub elements
- `test/renderer.test.ts` — 3 tests for uPlot rendering (no crash, pixels present, dimensions)
- `test/color-sampler.test.ts` — 9 tests for RGB → ANSI color mapping
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
- Color mapping is limited to 8 ANSI colors (red, green, blue, cyan, magenta, yellow, white, gray)
