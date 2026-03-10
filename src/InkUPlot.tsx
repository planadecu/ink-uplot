import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { renderToImageData } from './renderer.js';
import { pixelsToBraille } from './braille.js';
import { sampleCellColors } from './color-sampler.js';
import type { InkUPlotProps, ColoredChar } from './types.js';

export function InkUPlot({
  opts,
  data,
  width,
  height = 24,
  threshold = 128,
  color = true,
  background = 'dark',
}: InkUPlotProps) {
  const termCols = width ?? process.stdout.columns ?? 80;
  const canvasWidth = termCols * 2;
  const canvasHeight = height * 4;
  const invert = background === 'light';

  const [lines, setLines] = useState<ColoredChar[][] | null>(null);
  const [plainText, setPlainText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const imageData = await renderToImageData(opts, data, canvasWidth, canvasHeight);

        if (cancelled) return;

        const braille = pixelsToBraille(imageData, { threshold, invert });

        if (color) {
          const colors = sampleCellColors(imageData, threshold);
          const brailleLines = braille.split('\n');
          const colored: ColoredChar[][] = brailleLines.map((line, rowIdx) => {
            const chars: ColoredChar[] = [];
            for (let i = 0; i < line.length; i++) {
              chars.push({
                char: line[i],
                color: colors[rowIdx]?.[i] ?? null,
              });
            }
            return chars;
          });
          setLines(colored);
          setPlainText(null);
        } else {
          setPlainText(braille);
          setLines(null);
        }

        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [opts, data, canvasWidth, canvasHeight, threshold, invert, color]);

  if (error) {
    return <Text color="red">Error rendering chart: {error}</Text>;
  }

  if (!lines && !plainText) {
    return <Text dimColor>Rendering chart...</Text>;
  }

  if (plainText) {
    return (
      <Box flexDirection="column">
        {plainText.split('\n').map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {lines!.map((segments, i) => (
        <Text key={i}>
          {renderColoredLine(segments)}
        </Text>
      ))}
    </Box>
  );
}

function renderColoredLine(segments: ColoredChar[]): React.ReactNode[] {
  const groups: { chars: string; color: string | null }[] = [];

  for (const seg of segments) {
    const last = groups[groups.length - 1];
    if (last && last.color === seg.color) {
      last.chars += seg.char;
    } else {
      groups.push({ chars: seg.char, color: seg.color });
    }
  }

  return groups.map((g, j) =>
    g.color ? (
      <Text key={j} color={g.color}>{g.chars}</Text>
    ) : (
      <Text key={j}>{g.chars}</Text>
    )
  );
}
