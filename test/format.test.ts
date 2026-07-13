import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectFormat,
  isKitty,
  isRawFormat,
  kittyDelete,
  kittyTagImage,
  iterm2Escape,
} from '../src/format.js';

// Env vars that detectFormat inspects. Cleared before each test so cases are isolated.
const FORMAT_ENV_VARS = [
  'TERM', 'TERM_PROGRAM',
  'KITTY_WINDOW_ID', 'GHOSTTY_RESOURCES_DIR', 'WEZTERM_EXECUTABLE',
  'ITERM_SESSION_ID', 'KONSOLE_VERSION', 'WT_SESSION',
];

describe('detectFormat', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of FORMAT_ENV_VARS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of FORMAT_ENV_VARS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('falls back to symbols when nothing matches', () => {
    process.env.TERM = 'xterm-256color';
    expect(detectFormat()).toBe('symbols');
  });

  it('detects kitty via TERM', () => {
    process.env.TERM = 'xterm-kitty';
    expect(detectFormat()).toBe('kitty');
  });

  it('detects ghostty (kitty protocol) via TERM', () => {
    process.env.TERM = 'xterm-ghostty';
    expect(detectFormat()).toBe('kitty');
  });

  it('detects foot (sixels) via TERM', () => {
    process.env.TERM = 'foot';
    expect(detectFormat()).toBe('sixels');
  });

  it('detects wezterm (iterm2) via TERM', () => {
    process.env.TERM = 'wezterm';
    expect(detectFormat()).toBe('iterm2');
  });

  it('detects iTerm2 via TERM_PROGRAM', () => {
    process.env.TERM_PROGRAM = 'iTerm.app';
    expect(detectFormat()).toBe('iterm2');
  });

  it('detects vscode as iterm2 via TERM_PROGRAM (kitty out-of-band writes do not display there)', () => {
    process.env.TERM_PROGRAM = 'vscode';
    expect(detectFormat()).toBe('iterm2');
  });

  it('TERM wins over TERM_PROGRAM (propagates through SSH)', () => {
    process.env.TERM = 'xterm-kitty';
    process.env.TERM_PROGRAM = 'iTerm.app';
    expect(detectFormat()).toBe('kitty');
  });

  it('detects kitty via KITTY_WINDOW_ID env var', () => {
    process.env.KITTY_WINDOW_ID = '1';
    expect(detectFormat()).toBe('kitty');
  });

  it('detects Windows Terminal (sixels) via WT_SESSION', () => {
    process.env.WT_SESSION = 'abc';
    expect(detectFormat()).toBe('sixels');
  });
});

describe('format predicates', () => {
  it('isKitty only matches kitty', () => {
    expect(isKitty('kitty')).toBe(true);
    expect(isKitty('iterm2')).toBe(false);
    expect(isKitty('symbols')).toBe(false);
  });

  it('isRawFormat matches all graphics protocols but not symbols', () => {
    expect(isRawFormat('kitty')).toBe(true);
    expect(isRawFormat('sixels')).toBe(true);
    expect(isRawFormat('iterm2')).toBe(true);
    expect(isRawFormat('symbols')).toBe(false);
  });
});

describe('kitty escape helpers', () => {
  it('kittyDelete targets a specific image id', () => {
    expect(kittyDelete(3)).toBe('\x1b_Ga=d,d=i,i=3\x1b\\');
  });

  it('kittyTagImage injects the id into the transmit escape', () => {
    const ansi = '\x1b_Ga=T,f=32,s=8,v=8;BASE64DATA\x1b\\';
    const tagged = kittyTagImage(ansi, 7);
    expect(tagged).toContain('\x1b_Ga=T,i=7,');
    expect(tagged).toContain('BASE64DATA');
  });

  it('kittyTagImage leaves non-matching strings untouched', () => {
    expect(kittyTagImage('no escape here', 1)).toBe('no escape here');
  });
});

describe('iterm2Escape', () => {
  it('wraps a PNG buffer in an inline image sequence with base64 payload', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const seq = iterm2Escape(png, 40, 12);
    expect(seq.startsWith('\x1b]1337;File=inline=1;width=40;height=12')).toBe(true);
    expect(seq.endsWith('\x07')).toBe(true);
    expect(seq).toContain(png.toString('base64'));
  });
});
