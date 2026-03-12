import ChafaFactory from 'chafa-wasm';

let chafaModule: any | null = null;

async function getChafa() {
  if (!chafaModule) {
    chafaModule = await ChafaFactory();
  }
  return chafaModule;
}

export interface ChafaOptions {
  /** Output width in terminal columns. */
  width: number;
  /** Output height in terminal rows. */
  height: number;
  /** Font aspect ratio (width/height). Default: 0.5. */
  fontRatio?: number;
  /** Output format. Default: 'symbols'. */
  format?: 'symbols' | 'sixels' | 'kitty' | 'iterm2';
  /** Color mode. Default: 'truecolor'. */
  colors?: 'truecolor' | '256' | '16' | '2' | 'none';
}

/**
 * Convert pixel buffer to terminal output string using chafa.
 * Supports sixel, kitty, iterm2, and unicode symbol output.
 *
 * For 'symbols' format: uses braille characters with max quality (work: 9).
 * For pixel formats: uses default chafa settings (work: 5).
 */
export async function pixelsToTerminal(
  imageData: { data: Uint8ClampedArray; width: number; height: number },
  opts: ChafaOptions,
): Promise<string> {
  const chafa = await getChafa();

  const formatEnum: Record<string, number> = {
    symbols: chafa.ChafaPixelMode.CHAFA_PIXEL_MODE_SYMBOLS.value,
    sixels: chafa.ChafaPixelMode.CHAFA_PIXEL_MODE_SIXELS.value,
    kitty: chafa.ChafaPixelMode.CHAFA_PIXEL_MODE_KITTY.value,
    iterm2: chafa.ChafaPixelMode.CHAFA_PIXEL_MODE_ITERM2.value,
  };

  const colorsEnum: Record<string, number> = {
    truecolor: chafa.ChafaCanvasMode.CHAFA_CANVAS_MODE_TRUECOLOR.value,
    '256': chafa.ChafaCanvasMode.CHAFA_CANVAS_MODE_INDEXED_256.value,
    '16': chafa.ChafaCanvasMode.CHAFA_CANVAS_MODE_INDEXED_16.value,
    '2': chafa.ChafaCanvasMode.CHAFA_CANVAS_MODE_FGBG.value,
    none: chafa.ChafaCanvasMode.CHAFA_CANVAS_MODE_FGBG.value,
  };

  const fmt = opts.format ?? 'symbols';
  const format = formatEnum[fmt];
  const colors = colorsEnum[opts.colors ?? 'truecolor'];
  const isSymbols = fmt === 'symbols';

  return new Promise((resolve, reject) => {
    chafa.imageToAnsi(imageData, {
      width: opts.width,
      height: opts.height,
      fontRatio: opts.fontRatio ?? 0.5,
      format,
      colors,
      work: isSymbols ? 9 : 5,
      ...(isSymbols ? { symbols: 'braille' } : {}),
    }, (error: unknown, result: { ansi: string }) => {
      if (error) reject(error);
      else resolve(result.ansi);
    });
  });
}
