/**
 * Server-side contour extraction from raw RGBA pixel buffer.
 * Port of contour.ts (browser ImageData) for Node.js Buffer (Sharp raw output).
 */

export function extractContourFromBuffer(
  pixels: Buffer,
  width: number,
  height: number,
  numPoints = 12
): { x: number; y: number }[] {
  const alphaThreshold = 30;

  // Find bounding box of non-transparent pixels
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha > alphaThreshold) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (minX >= maxX || minY >= maxY) {
    // Fallback to rectangle
    return [
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 1, y: 1 }, { x: 0, y: 1 },
    ];
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const points: { x: number; y: number }[] = [];

  // Ray-cast from center at evenly spaced angles
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    // March outward until we hit transparent
    let lastOpaque = { x: cx, y: cy };
    const maxDist = Math.max(width, height);

    for (let d = 0; d < maxDist; d += 1) {
      const px = Math.round(cx + dx * d);
      const py = Math.round(cy + dy * d);

      if (px < 0 || px >= width || py < 0 || py >= height) break;

      const alpha = pixels[(py * width + px) * 4 + 3];
      if (alpha > alphaThreshold) {
        lastOpaque = { x: px, y: py };
      } else if (d > 5) {
        break;
      }
    }

    // Normalize to 0-1
    points.push({
      x: (lastOpaque.x - minX) / (maxX - minX),
      y: (lastOpaque.y - minY) / (maxY - minY),
    });
  }

  return points;
}
