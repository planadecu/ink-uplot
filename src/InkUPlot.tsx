import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { renderToImageData } from './renderer.js';
import { pixelsToTerminal } from './chafa.js';
import type { InkUPlotProps } from './types.js';

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
  // Render at higher resolution for chafa to downsample with better quality
  const canvasWidth = termCols * 8;
  const canvasHeight = height * 16;

  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const imageData = await renderToImageData(opts, data, canvasWidth, canvasHeight, { brailleMode: false });
        if (cancelled) return;

        const ansi = await pixelsToTerminal(imageData, {
          width: termCols,
          height,
          colors: color ? 'truecolor' : 'none',
        });
        if (cancelled) return;

        setOutput(ansi);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [opts, data, canvasWidth, canvasHeight, termCols, height, color]);

  if (error) {
    return <Text color="red">Error rendering chart: {error}</Text>;
  }

  if (!output) {
    return <Text dimColor>Rendering chart...</Text>;
  }

  // chafa output contains ANSI escape sequences that Ink's Text can pass through
  return (
    <Box flexDirection="column">
      {output.split('\n').map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </Box>
  );
}
