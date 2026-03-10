import { createCanvas, type Canvas } from 'canvas';

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

export interface DOMShimResult {
  canvas: Canvas;
}

export function installDOMShim(canvasWidth: number, canvasHeight: number): DOMShimResult {
  if (installed) uninstallDOMShim();

  const realCanvas = createCanvas(canvasWidth, canvasHeight);
  let canvasUsed = false;

  function wrapCanvas(c: Canvas): any {
    const wrapped = c as any;
    if (!wrapped.classList) wrapped.classList = createClassList();
    if (!wrapped.style) {
      wrapped.style = new Proxy({} as Record<string, string>, {
        set(target, prop, value) { target[prop as string] = value; return true; },
        get(target, prop) { return target[prop as string] ?? ''; },
      });
    }
    wrapped.addEventListener = () => {};
    wrapped.removeEventListener = () => {};
    wrapped.appendChild = (child: any) => child;
    wrapped.insertBefore = (child: any) => child;
    wrapped.getBoundingClientRect = () => ({
      x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0,
      width: canvasWidth, height: canvasHeight, toJSON() {},
    });
    wrapped.ownerDocument = null;
    wrapped.parentNode = null;
    return wrapped;
  }

  const wrappedCanvas = wrapCanvas(realCanvas);

  const stubDocument: any = {
    createElement(tag: string) {
      if (tag === 'canvas') {
        if (!canvasUsed) {
          canvasUsed = true;
          wrappedCanvas.ownerDocument = stubDocument;
          return wrappedCanvas;
        }
        const extra = createCanvas(1, 1);
        return wrapCanvas(extra);
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

  const keys = ['window', 'document', 'navigator', 'devicePixelRatio',
    'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia',
    'getComputedStyle', 'ResizeObserver', 'CustomEvent', 'queueMicrotask'] as const;

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
    queueMicrotask: (fn: () => void) => fn(),
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

  const keys = ['window', 'document', 'navigator', 'devicePixelRatio',
    'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia',
    'getComputedStyle', 'ResizeObserver', 'CustomEvent', 'queueMicrotask'] as const;

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
