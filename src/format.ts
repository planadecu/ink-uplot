import type { RenderFormat } from './renderer.js';

export const isKitty = (f: string) => f === 'kitty';
export const isRawFormat = (f: string) => f === 'kitty' || f === 'sixels' || f === 'iterm2';

// Every kitty graphics command carries q=2 (quiet): otherwise the terminal answers each
// one with an OK/error reply (`ESC _G...;OK ESC \\`) on the host app's stdin, which Ink
// parses as keypresses — e.g. stray `\\` characters typed into a search box.

/** Delete a kitty image by ID and free its data (`d=I`; `d=i` only removes placements). */
export const kittyDelete = (id: number) => `\x1b_Ga=d,d=I,i=${id},q=2\x1b\\`;

/**
 * Inject into the first kitty escape: `i=<id>` (so we can delete it later), `q=2`, and
 * `C=1` (don't move the cursor — Ink positions its next frame relative to the cursor).
 */
export function kittyTagImage(ansi: string, id: number): string {
  return ansi.replace('\x1b_Ga=T,', `\x1b_Ga=T,i=${id},q=2,C=1,`);
}

/**
 * Wrap an out-of-band graphics write in save/restore cursor (DECSC/DECRC). Ink writes each
 * frame relative to where it left the cursor, so a write that moves it would shift the
 * host's next frame.
 */
export const withSavedCursor = (s: string) => `\x1b7${s}\x1b8`;

/** Move `up` lines up from the cursor, then to 1-based column `col`. */
export const cursorTo = (up: number, col: number) => `${up > 0 ? `\x1b[${up}A` : ''}\x1b[${col}G`;

/** Auto-detect the best graphics format for the current terminal. */
export function detectFormat(): RenderFormat {
  const env = process.env;
  const term = env.TERM ?? '';
  const termProgram = env.TERM_PROGRAM ?? '';

  // 1. Check TERM (most reliable — propagates through SSH/sudo)
  if (term === 'xterm-kitty') return 'kitty';
  if (term === 'xterm-ghostty') return 'kitty';
  if (term === 'foot' || term === 'foot-extra') return 'sixels';
  if (term === 'wezterm') return 'iterm2';

  // 2. Check TERM_PROGRAM
  if (termProgram === 'iTerm.app') return 'iterm2';
  if (termProgram === 'WezTerm') return 'iterm2';
  if (termProgram === 'ghostty') return 'kitty';
  // VSCode renders iTerm2 inline images but not our out-of-band kitty writes.
  if (termProgram === 'vscode') return 'iterm2';

  // 3. Check terminal-specific env vars
  if (env.KITTY_WINDOW_ID) return 'kitty';
  if (env.GHOSTTY_RESOURCES_DIR) return 'kitty';
  if (env.WEZTERM_EXECUTABLE) return 'iterm2';
  if (env.ITERM_SESSION_ID) return 'iterm2';
  if (env.KONSOLE_VERSION) return 'kitty';
  if (env.WT_SESSION) return 'sixels';

  return 'symbols';
}

/** Wrap a PNG buffer in an iTerm2 inline image escape sequence. */
export function iterm2Escape(png: Buffer, cols: number, rows: number): string {
  const b64 = png.toString('base64');
  // doNotMoveCursor=1: iTerm2 leaves the cursor in place (others ignore unknown keys; the
  // write is also wrapped in withSavedCursor).
  return `\x1b]1337;File=inline=1;width=${cols};height=${rows};preserveAspectRatio=0;doNotMoveCursor=1:${b64}\x07`;
}
