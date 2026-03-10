import { describe, it, expect, afterEach } from 'vitest';
import { installDOMShim, uninstallDOMShim } from '../src/dom-shim.js';

describe('DOM shim', () => {
  afterEach(() => {
    uninstallDOMShim();
  });

  it('installs document and window globals', () => {
    const shim = installDOMShim(200, 100);
    expect(globalThis.document).toBeDefined();
    expect(globalThis.window).toBeDefined();
    expect(globalThis.navigator).toBeDefined();
    expect(shim.canvas).toBeDefined();
  });

  it('createElement("canvas") returns a real canvas with getContext', () => {
    const shim = installDOMShim(200, 100);
    const canvas = (globalThis.document as any).createElement('canvas');
    const ctx = canvas.getContext('2d');
    expect(ctx).toBeDefined();
    expect(typeof ctx.fillRect).toBe('function');
  });

  it('createElement("div") returns a stub with classList and style', () => {
    installDOMShim(200, 100);
    const div = (globalThis.document as any).createElement('div');
    expect(div.classList).toBeDefined();
    div.classList.add('test');
    expect(div.classList.contains('test')).toBe(true);
    div.classList.remove('test');
    expect(div.classList.contains('test')).toBe(false);
    div.style.width = '100px';
    div.style.height = '50px';
  });

  it('stub elements support appendChild and insertBefore', () => {
    installDOMShim(200, 100);
    const parent = (globalThis.document as any).createElement('div');
    const child = (globalThis.document as any).createElement('div');
    expect(() => parent.appendChild(child)).not.toThrow();
    expect(() => parent.insertBefore(child, null)).not.toThrow();
  });

  it('stub elements support getBoundingClientRect', () => {
    installDOMShim(200, 100);
    const div = (globalThis.document as any).createElement('div');
    const rect = div.getBoundingClientRect();
    expect(rect).toHaveProperty('width');
    expect(rect).toHaveProperty('height');
  });

  it('window.devicePixelRatio is 1', () => {
    installDOMShim(200, 100);
    expect((globalThis as any).devicePixelRatio).toBe(1);
  });

  it('uninstallDOMShim removes globals', () => {
    installDOMShim(200, 100);
    uninstallDOMShim();
    expect((globalThis as any).document).toBeUndefined();
    expect((globalThis as any).window).toBeUndefined();
  });
});
