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
pnpm test          # Run all tests (79 tests, ~1.3s)
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

raw mode — kitty/sixels:
  opts + data → [DOM shim] → [uPlot on node-canvas + axes] → [getImageData] → [chafa-wasm] → stdout
raw mode — iterm2 (fast path):
  opts + data → [DOM shim] → [uPlot on node-canvas + axes] → [canvas.toBuffer PNG] → iterm2 escape → stdout
                                                             (Ink renders an empty reserved <Box>; image written out-of-band)
```

### Source Files

| File | Responsibility |
|------|---------------|
| `src/dom-shim.ts` | Fake DOM globals (document, window, navigator) for uPlot. Persistent singleton document — uPlot caches `doc` at import time. Caches/reuses Cairo canvas surfaces across renders (per-frame allocation leaked native memory at high fps). |
| `src/renderer.ts` | Orchestrates shim + dynamic uPlot import. `renderToImageData` (pixel buffer, for symbols/kitty/sixels via chafa) and `renderToPNG` (native node-canvas PNG, the iterm2 fast path). `sanitizeOpts` hides/styles/auto-sizes axes per format and `showAxes`. |
| `src/format.ts` | Terminal format detection (`detectFormat`) and escape-sequence helpers: `isRawFormat`/`isKitty`, kitty image tag/delete, `iterm2Escape`. |
| `src/chafa.ts` | Wrapper around chafa-wasm. Converts pixel buffer to truecolor Unicode block art (symbols, sixels, kitty). Recreates the module periodically to bound a WASM heap leak (see decision 12). |
| `src/axes.ts` | Nice-numbers tick calculation (Heckbert 1990), tick positioning, timestamp auto-detection/formatting, and text-axis layout (`computeScales`/`buildYLabels`/`buildXLabelLine`) for symbols mode. |
| `src/braille.ts` | Pure function: pixel buffer → Unicode Braille string. 2x4 dot grid per character cell. Legacy/alternative renderer. |
| `src/color-sampler.ts` | Per-cell dominant color extraction → ANSI color name. Used with braille renderer. |
| `src/InkUPlot.tsx` | React Ink component. Auto-detects format via `detectFormat()`. Symbols mode: chafa block art + text axes as `<Text>`. Raw mode (kitty/sixels/iterm2): reserves an empty `<Box>` and writes the image out-of-band to stdout, positioned inside that box via the box's on-screen geometry. Handles resize (freeze + pause) and clears the image on unmount. |
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

9. **Terminal format auto-detection** — `detectFormat()` (in `format.ts`) checks env vars in priority order: `TERM` (most reliable, propagates through SSH) → `TERM_PROGRAM` → terminal-specific vars (`KITTY_WINDOW_ID`, `ITERM_SESSION_ID`, etc.) → fallback to 'symbols'. Result is cached at module level. Note **VSCode → `iterm2`** (not kitty): VSCode's terminal renders iTerm2 inline images but not our out-of-band kitty writes.

10. **Raw format rendering** — Kitty/sixels/iterm2 images bypass Ink's text rendering entirely. The component reserves an empty `<Box>` (via `boxRef`) and writes the image directly to `process.stdout.write()`, positioned *inside* that box by reading its on-screen geometry from Ink's Yoga layout (`boxScreenGeom` sums computed offsets up the node tree) — so a chart can be embedded in a larger TUI layout, not just the top-left. Kitty uses absolute positioning + double-buffered image IDs (place new, delete old); iterm2/sixels move relative to the cursor Ink leaves. `setOutput()` is NOT called in raw mode (Ink re-renders would erase the image). On unmount, the image is cleared so it doesn't linger after exit.

11. **Render serialization** — `renderToImageData` uses global DOM state and is not reentrant. A module-level `renderLock` promise chain serializes all async render calls.

12. **chafa-wasm leak workaround** — chafa-wasm 0.3.3 leaks ~1.7MB of WASM heap per `imageToAnsi` call (leak is in its compiled C; Emscripten never shrinks the heap). At 10fps this exhausts native memory and aborts the process (Cairo/GLib OOM) within ~1 min. `getChafa()` drops and recreates the module every `RECREATE_EVERY_CALLS` (60) calls so GC reclaims the leaked ArrayBuffer — reinit is ~5-8ms (compiled module is cached), bounding peak memory to a few hundred MB. Only affects chafa formats (symbols/kitty/sixels); iterm2 uses `renderToPNG` and is unaffected.

13. **Resize handling** — Transmitting a large out-of-band image while a terminal reflows can wedge it. During a resize the component *freezes* layout to a `committed` size and *pauses* image writes (guarded by `resizingRef`, checked before and after the slow render), redrawing once ~250ms after the last resize event. Examples also debounce their own `stdout` resize handler ("resize on release"). Fixes freezes on kitty/ghostty; VSCode still wedges reflowing the displayed image (see Known Limitations).

14. **Raw-format render quality** — Canvas is rendered at **2x cell density** (`chartCols*16 × chartRows*32`, capped by `MAX_DIM`/`MAX_PIXELS`) so charts stay crisp when the terminal upscales the image. For pixel-perfect formats, uPlot's canvas axes are kept and **vertical axes auto-size** to their widest label (uPlot's default width clips large labels like `13,000`). `showAxes={false}` hides axes/grid/ticks (defaulting to `[x, y]` since uPlot draws implicit axes for an empty array).

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
- `test/renderer.test.ts` — 4 tests for uPlot rendering (`renderToImageData` + `renderToPNG`)
- `test/color-sampler.test.ts` — 9 tests for RGB → ANSI color mapping
- `test/axes.test.ts` — 21 tests for tick calc, positioning, timestamp detect/format, and scale/label layout (`computeScales`/`buildYLabels`/`buildXLabelLine`)
- `test/format.test.ts` — 17 tests for format detection (env matrix) and kitty/iterm2 escape helpers
- `test/chafa.test.ts` — 3 tests for chafa-wasm pixel-to-terminal conversion
- `test/component.test.tsx` — 7 tests for InkUPlot React component (uses ink-testing-library)
- `test/integration.test.ts` — 1 full pipeline test (opts → braille string)

## Conventions

- All imports use `.js` extensions (ESM requirement)
- No default exports — named exports only
- `any` types allowed in dom-shim.ts (necessary for DOM stub interfaces)
- Vitest globals enabled (`describe`, `it`, `expect` without imports)

## Releases

Pushing to `main` triggers `.github/workflows/publish.yml`: build → test → patch-bump (`[skip ci]` commit) → `npm publish` via **OIDC trusted publishing** (no token; provenance attached, npm ≥ 11.5.1). A Trusted Publisher for `planadecu/ink-uplot` + `publish.yml` must exist on npmjs.com. `.npmrc` hardens installs (`onlyBuiltDependencies`, `minimum-release-age`); do NOT set `ignore-scripts` — it blocks canvas's native build.

## Known Limitations

- `renderToImageData` must not be called concurrently (global DOM state)
- uPlot must not be statically imported elsewhere before the renderer's first call
- node-canvas requires system Cairo/Pango libraries
- Shaded area fills need alpha >= 0.3 to be visible through chafa
- **VSCode terminal + live resize:** VSCode's integrated terminal renders iTerm2 inline
  images fine in steady state, but its image renderer wedges (hard freeze) when you resize
  the terminal *during* a continuously updating chart — it can't reflow + decode the image
  stream mid-drag. The component pauses image writes and freezes layout during a resize
  (see `resizingRef`/`committed` in `InkUPlot.tsx`), which is enough for kitty/ghostty, but
  VSCode still freezes because it chokes on the already-displayed image during reflow. This
  is a VSCode/xterm.js limitation, not fixable from our side. Static charts resize fine.
  Real iTerm2, WezTerm, kitty, ghostty are unaffected.
