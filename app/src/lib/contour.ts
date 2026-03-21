/**
 * Extract contour points from an image for irregular physics shapes.
 * Uses alpha channel marching to find the outline of a transparent-bg image.
 */

export function extractContourFromImage(
  imageData: ImageData,
  numPoints: number = 12
): { x: number; y: number }[] {
  const { width, height, data } = imageData;
  const alphaThreshold = 30;

  // Find bounding box of non-transparent pixels
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
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

      const alpha = data[(py * width + px) * 4 + 3];
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

/**
 * Convert normalized contour points to Matter.js vertices
 */
export function contourToVertices(
  contour: { x: number; y: number }[],
  width: number,
  height: number
): { x: number; y: number }[] {
  return contour.map(p => ({
    x: (p.x - 0.5) * width,
    y: (p.y - 0.5) * height,
  }));
}

/**
 * Extract a single frame from a horizontal sprite sheet as ImageData.
 */
export function extractFrameFromSprite(
  img: HTMLImageElement,
  frameIndex: number,
  frameCount: number
): ImageData | null {
  const frameW = Math.floor(img.naturalWidth / frameCount);
  const frameH = img.naturalHeight;
  if (frameW <= 0 || frameH <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = frameW;
  canvas.height = frameH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(img, frameIndex * frameW, 0, frameW, frameH, 0, 0, frameW, frameH);
  return ctx.getImageData(0, 0, frameW, frameH);
}

/**
 * Extract a U-shaped wall path from a drawer frame image.
 * The top portion (topOpenFraction, default 2/5) is left open so items fall in.
 * Returns an ordered array of normalized 0-1 points tracing the drawer's
 * left wall → bottom → right wall path (a "U" shape, open at top).
 * Returns null if contour extraction fails.
 *
 * These points are used to create a chain of thin rectangular static bodies
 * in Matter.js (since poly-decomp is not available for concave fromVertices).
 *
 * @param imageData - ImageData of a single drawer frame (bg-removed)
 * @param topOpenFraction - fraction of the top to leave open (0-1), default 0.4
 * @param numPoints - number of contour sample points, default 24
 */
export function extractDrawerWallPath(
  imageData: ImageData,
  topOpenFraction: number = 0.4,
  numPoints: number = 24,
): { x: number; y: number }[] | null {
  // Extract the full outer contour of the drawer image
  const fullContour = extractContourFromImage(imageData, numPoints);
  if (fullContour.length < 4) return null;

  // Sort contour points by angle from center for consistent ordering
  const cx = fullContour.reduce((s, p) => s + p.x, 0) / fullContour.length;
  const cy = fullContour.reduce((s, p) => s + p.y, 0) / fullContour.length;
  const sorted = [...fullContour].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );

  // Keep only points in the bottom portion (y >= topOpenFraction)
  const bottomPoints = sorted.filter(p => p.y >= topOpenFraction);
  if (bottomPoints.length < 3) return null;

  // Find the leftmost and rightmost bottom points to define the top opening
  const leftMost = bottomPoints.reduce((a, b) => a.x < b.x ? a : b);
  const rightMost = bottomPoints.reduce((a, b) => a.x > b.x ? a : b);

  // Add lip points at the cutoff line (top of the U opening)
  const topLeft = { x: leftMost.x, y: topOpenFraction };
  const topRight = { x: rightMost.x, y: topOpenFraction };

  // Build the U path: topLeft → left wall → bottom → right wall → topRight
  // Sort bottom points clockwise around the center of the bottom region
  const bcx = bottomPoints.reduce((s, p) => s + p.x, 0) / bottomPoints.length;
  const bcy = bottomPoints.reduce((s, p) => s + p.y, 0) / bottomPoints.length;
  bottomPoints.sort(
    (a, b) => Math.atan2(a.y - bcy, a.x - bcx) - Math.atan2(b.y - bcy, b.x - bcx)
  );

  // Find the index of the topmost-left point to start the path correctly
  // We want the path to go: top-left lip → down left side → across bottom → up right side → top-right lip
  let startIdx = 0;
  let minAngleFromTopLeft = Infinity;
  for (let i = 0; i < bottomPoints.length; i++) {
    const angle = Math.atan2(bottomPoints[i].y - bcy, bottomPoints[i].x - bcx);
    const targetAngle = Math.atan2(topLeft.y - bcy, topLeft.x - bcx);
    const diff = Math.abs(angle - targetAngle);
    if (diff < minAngleFromTopLeft) {
      minAngleFromTopLeft = diff;
      startIdx = i;
    }
  }

  // Reorder so path starts near top-left and goes clockwise (down-left, across bottom, up-right)
  const reordered = [
    ...bottomPoints.slice(startIdx),
    ...bottomPoints.slice(0, startIdx),
  ];

  return [topLeft, ...reordered, topRight];
}
