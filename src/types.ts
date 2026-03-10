import type uPlot from 'uplot';

export interface BrailleOptions {
  /** Luminance threshold 0-255. Pixels brighter than this become dots. Default: 128 */
  threshold?: number;
  /** If true, pixels darker than threshold become dots (for light backgrounds). Default: false */
  invert?: boolean;
}

export interface ColoredChar {
  char: string;
  color: string | null;
}

export interface BrailleResult {
  /** Plain braille string (newline-separated rows) */
  text: string;
  /** Colored segments per row, for ANSI rendering */
  colored: ColoredChar[][];
  /** Number of terminal columns */
  cols: number;
  /** Number of terminal rows */
  rows: number;
}

export interface InkUPlotProps {
  /** Standard uPlot options object. width/height are optional (overridden by component props). Interactive options are automatically stripped. */
  opts: Omit<uPlot.Options, 'width' | 'height'> & { width?: number; height?: number };
  /** uPlot data array — same format as browser uPlot. */
  data: uPlot.AlignedData;
  /** Chart width in terminal columns. Defaults to stdout.columns or 80. */
  width?: number;
  /** Chart height in terminal rows. Defaults to 24. */
  height?: number;
  /** Luminance threshold for 1-bit conversion (0–255). Default: 128. */
  threshold?: number;
  /** Enable ANSI color output. Default: true. */
  color?: boolean;
  /** Background color assumption. 'dark' = light-on-dark (default). */
  background?: 'dark' | 'light';
}
