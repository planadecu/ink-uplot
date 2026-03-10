type AnsiColor = 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray';

function rgbToAnsi(r: number, g: number, b: number): AnsiColor {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  if (max - min < 30) {
    if (max < 60) return 'black';
    if (max < 180) return 'gray';
    return 'white';
  }

  // Two-channel composites: yellow, cyan, magenta
  if (r > 100 && g > 100 && b < 100) return 'yellow';
  if (g > 100 && b > 100 && r < 100) return 'cyan';
  if (r > 100 && b > 100 && g < 100) return 'magenta';

  // Single dominant channel
  if (r >= g && r >= b) return 'red';
  if (g >= r && g >= b) return 'green';
  if (b >= r && b >= g) return 'blue';

  return 'white';
}

export function sampleCellColors(
  imageData: { data: Uint8ClampedArray; width: number; height: number },
  threshold: number,
): (AnsiColor | null)[][] {
  const { width, height, data } = imageData;
  const cols = Math.floor(width / 2);
  const rows = Math.floor(height / 4);
  const result: (AnsiColor | null)[][] = [];

  for (let row = 0; row < rows; row++) {
    const rowColors: (AnsiColor | null)[] = [];
    for (let col = 0; col < cols; col++) {
      const px = col * 2;
      const py = row * 4;

      let totalR = 0, totalG = 0, totalB = 0;
      let activeCount = 0;

      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const idx = ((py + dy) * width + (px + dx)) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          if (luminance > threshold) {
            totalR += r;
            totalG += g;
            totalB += b;
            activeCount++;
          }
        }
      }

      if (activeCount === 0) {
        rowColors.push(null);
      } else {
        rowColors.push(rgbToAnsi(
          Math.round(totalR / activeCount),
          Math.round(totalG / activeCount),
          Math.round(totalB / activeCount),
        ));
      }
    }
    result.push(rowColors);
  }

  return result;
}
