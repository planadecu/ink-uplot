import type { RenderFormat } from './renderer.js';

// Native kitty terminals erase images when text is drawn over them, so they need
// direct stdout writes. iTerm2/sixels images are inline character cells — they can
// render through Ink normally. VSCode's xterm.js speaks the kitty protocol but treats
// images as inline content like iterm2, so it is NOT a "native" kitty for our purposes.
export const isNativeKitty = () => (process.env.TERM_PROGRAM ?? '') !== 'vscode';
export const isKitty = (f: string) => f === 'kitty';
export const isRawFormat = (f: string) => f === 'kitty' || f === 'sixels' || f === 'iterm2';

/** Delete a specific kitty image by ID. */
export const kittyDelete = (id: number) => `\x1b_Ga=d,d=i,i=${id}\x1b\\`;

/** Inject `i=<id>` into the first kitty escape sequence so we can delete it later. */
export function kittyTagImage(ansi: string, id: number): string {
  return ansi.replace('\x1b_Ga=T,', `\x1b_Ga=T,i=${id},`);
}

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
  if (termProgram === 'vscode') return 'kitty';

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
  return `\x1b]1337;File=inline=1;width=${cols};height=${rows};preserveAspectRatio=0:${b64}\x07`;
}
