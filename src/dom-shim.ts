import { createCanvas, type Canvas } from 'canvas';
import { Path2D } from 'path2d';

let installed = false;
const savedGlobals: Record<string, any> = {};

function createClassList() {
  const classes = new Set<string>();
  return {
    add(c: string) { classes.add(c); },
    remove(c: string) { classes.delete(c); },
    contains(c: string) { return classes.has(c); },
    toggle(c: string) { classes.has(c) ? classes.delete(c) : classes.add(c); },
  };
}

function createStubElement(tag: string): any {
  const el: any = {
    tagName: tag.toUpperCase(),
    classList: createClassList(),
    style: new Proxy({} as Record<string, string>, {
      set(target, prop, value) {
        target[prop as string] = value;
        return true;
      },
      get(target, prop) {
        return target[prop as string] ?? '';
      },
    }),
    children: [],
    childNodes: [],
    ownerDocument: null,
    parentNode: null,
    textContent: '',
    innerHTML: '',
    id: '',

    appendChild(child: any) { el.children.push(child); child.parentNode = el; return child; },
    insertBefore(child: any, _ref: any) { el.children.push(child); child.parentNode = el; return child; },
    removeChild(child: any) { return child; },
    remove() {},
    contains(_other: any) { return false; },
    querySelector(_sel: string) { return null; },
    querySelectorAll(_sel: string) { return []; },
    addEventListener(_ev: string, _cb: any, _opts?: any) {},
    removeEventListener(_ev: string, _cb: any, _opts?: any) {},
    dispatchEvent(_ev: any) { return true; },
    getBoundingClientRect() {
      return { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON() {} };
    },
    setAttribute(_name: string, _value: string) {},
    getAttribute(_name: string) { return null; },
    getContext(_type: string) { return null; },
  };
  return el;
}

/**
 * Patch a canvas 2D context so that stroke(path), fill(path), and clip(path)
 * work with path2d's Path2D polyfill by replaying the recorded path commands
 * before calling the native method.
 */
function patchCtxForPath2D(ctx: any): void {
  const origStroke = ctx.stroke.bind(ctx);
  const origFill = ctx.fill.bind(ctx);
  const origClip = ctx.clip.bind(ctx);
  const origIsPointInPath = ctx.isPointInPath?.bind(ctx);

  ctx.stroke = function (pathOrRule?: any) {
    if (pathOrRule instanceof Path2D) {
      ctx.beginPath();
      (pathOrRule as any).buildPathInCanvas(ctx);
      return origStroke();
    }
    return origStroke(pathOrRule);
  };

  ctx.fill = function (pathOrRule?: any, fillRule?: any) {
    if (pathOrRule instanceof Path2D) {
      ctx.beginPath();
      (pathOrRule as any).buildPathInCanvas(ctx);
      return fillRule != null ? origFill(fillRule) : origFill();
    }
    return pathOrRule != null ? origFill(pathOrRule) : origFill();
  };

  ctx.clip = function (pathOrRule?: any, fillRule?: any) {
    if (pathOrRule instanceof Path2D) {
      ctx.beginPath();
      (pathOrRule as any).buildPathInCanvas(ctx);
      return fillRule != null ? origClip(fillRule) : origClip();
    }
    return pathOrRule != null ? origClip(pathOrRule) : origClip();
  };

  if (origIsPointInPath) {
    ctx.isPointInPath = function (pathOrX?: any, xOrY?: any, yOrRule?: any, rule?: any) {
      if (pathOrX instanceof Path2D) {
        ctx.beginPath();
        (pathOrX as any).buildPathInCanvas(ctx);
        return rule != null
          ? origIsPointInPath(xOrY, yOrRule, rule)
          : origIsPointInPath(xOrY, yOrRule);
      }
      return origIsPointInPath(pathOrX, xOrY, yOrRule);
    };
  }
}

export interface DOMShimResult {
  canvas: Canvas;
}

// Module-level mutable state for the current canvas factory.
// uPlot captures `doc = document` at module load time, so we must keep the
// same document object across multiple installDOMShim calls. We achieve this
// by having createElement delegate to a mutable `_currentCreateCanvas` function.
let _currentCreateCanvas: (() => any) | null = null;

// Canvas cache — reuse native Cairo surfaces to prevent memory leak.
// At high frame rates (10fps), creating a new ~4.6MB native surface per frame
// exhausts native heap before GC can collect the old ones.
let _cachedMainCanvas: Canvas | null = null;
let _cachedExtraCanvas: Canvas | null = null;

// The single persistent document stub, shared across all installs.
// uPlot's `doc` will always reference this same object.
const stubDocument: any = {
  createElement(tag: string) {
    if (tag === 'canvas' && _currentCreateCanvas) {
      return _currentCreateCanvas();
    }
    const el = createStubElement(tag);
    el.ownerDocument = stubDocument;
    return el;
  },
  createElementNS(_ns: string, tag: string) {
    return stubDocument.createElement(tag);
  },
  createTextNode(_text: string) {
    return createStubElement('#text');
  },
  body: createStubElement('body'),
  documentElement: createStubElement('html'),
  head: createStubElement('head'),
};

export function installDOMShim(canvasWidth: number, canvasHeight: number): DOMShimResult {
  if (installed) uninstallDOMShim();

  // Reuse cached canvas — setting width/height resets its state (clears content, resets transform).
  if (!_cachedMainCanvas) {
    _cachedMainCanvas = createCanvas(canvasWidth, canvasHeight);
  } else {
    _cachedMainCanvas.width = canvasWidth;
    _cachedMainCanvas.height = canvasHeight;
  }
  const realCanvas = _cachedMainCanvas;

  if (!_cachedExtraCanvas) {
    _cachedExtraCanvas = createCanvas(1, 1);
  }

  let canvasUsed = false;

  function wrapCanvas(c: Canvas, w: number, h: number): any {
    const wrapped = c as any;
    // Only patch once — avoid re-wrapping getContext on reuse
    if (!wrapped.__inkPatched) {
      wrapped.classList = createClassList();
      wrapped.style = new Proxy({} as Record<string, string>, {
        set(target, prop, value) { target[prop as string] = value; return true; },
        get(target, prop) { return target[prop as string] ?? ''; },
      });
      wrapped.addEventListener = () => {};
      wrapped.removeEventListener = () => {};
      wrapped.appendChild = (child: any) => child;
      wrapped.insertBefore = (child: any) => child;
      wrapped.ownerDocument = stubDocument;
      wrapped.parentNode = null;

      // Patch the 2D context for Path2D support
      const origGetContext = wrapped.getContext.bind(wrapped);
      let patchedCtx: any = null;
      wrapped.getContext = (type: string) => {
        const ctx = origGetContext(type);
        if (type === '2d' && ctx && !patchedCtx) {
          patchCtxForPath2D(ctx);
          patchedCtx = ctx;
        }
        return ctx;
      };

      wrapped.__inkPatched = true;
    }
    // Always update dimensions (may change between frames)
    wrapped.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0,
      width: w, height: h, toJSON() {},
    });
    return wrapped;
  }

  const wrappedCanvas = wrapCanvas(realCanvas, canvasWidth, canvasHeight);

  // Update the canvas factory for the persistent document.
  _currentCreateCanvas = () => {
    if (!canvasUsed) {
      canvasUsed = true;
      return wrappedCanvas;
    }
    return wrapCanvas(_cachedExtraCanvas!, 1, 1);
  };

  const stubMatchMedia = (_query: string) => ({
    matches: false,
    media: _query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => true,
  });

  const stubWindow: any = {
    devicePixelRatio: 1,
    requestAnimationFrame: (cb: () => void) => { cb(); return 0; },
    cancelAnimationFrame: () => {},
    matchMedia: stubMatchMedia,
    getComputedStyle: () =>
      new Proxy({} as Record<string, string>, {
        get(_, prop) {
          if (prop === 'font') return '10px monospace';
          if (prop === 'getPropertyValue') return () => '';
          return '';
        },
      }),
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
    document: stubDocument,
    navigator: { userAgent: 'node' },
    CustomEvent: class CustomEvent {
      type: string;
      constructor(type: string) { this.type = type; }
    },
    location: { protocol: 'https:' },
    setTimeout,
    clearTimeout,
  };

  // Stub HTMLElement class so uPlot's `instanceof HTMLElement` checks work
  class StubHTMLElement {}

  const keys = ['window', 'document', 'navigator', 'devicePixelRatio',
    'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia',
    'getComputedStyle', 'ResizeObserver', 'CustomEvent', 'HTMLElement',
    'Path2D'] as const;

  for (const key of keys) {
    savedGlobals[key] = (globalThis as any)[key];
  }

  const globals: Record<string, any> = {
    window: stubWindow,
    document: stubDocument,
    navigator: stubWindow.navigator,
    devicePixelRatio: 1,
    requestAnimationFrame: stubWindow.requestAnimationFrame,
    cancelAnimationFrame: stubWindow.cancelAnimationFrame,
    matchMedia: stubMatchMedia,
    getComputedStyle: stubWindow.getComputedStyle,
    ResizeObserver: stubWindow.ResizeObserver,
    CustomEvent: stubWindow.CustomEvent,
    HTMLElement: StubHTMLElement,
    Path2D,
  };

  for (const [key, value] of Object.entries(globals)) {
    try {
      (globalThis as any)[key] = value;
    } catch {
      Object.defineProperty(globalThis, key, {
        value,
        writable: true,
        configurable: true,
      });
    }
  }

  installed = true;
  return { canvas: realCanvas };
}

export function uninstallDOMShim(): void {
  if (!installed) return;

  _currentCreateCanvas = null;

  const keys = ['window', 'document', 'navigator', 'devicePixelRatio',
    'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia',
    'getComputedStyle', 'ResizeObserver', 'CustomEvent', 'HTMLElement',
    'Path2D'] as const;

  for (const key of keys) {
    if (savedGlobals[key] === undefined) {
      try {
        delete (globalThis as any)[key];
      } catch {
        Object.defineProperty(globalThis, key, {
          value: undefined,
          writable: true,
          configurable: true,
        });
      }
    } else {
      try {
        (globalThis as any)[key] = savedGlobals[key];
      } catch {
        Object.defineProperty(globalThis, key, {
          value: savedGlobals[key],
          writable: true,
          configurable: true,
        });
      }
    }
  }

  installed = false;
}
