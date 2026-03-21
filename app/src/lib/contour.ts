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
 * Extract a U-shaped wall path from a drawer frame image using edge scanning.
 * The top portion (topOpenFraction, default 2/5) is left open so items fall in.
 * Returns an ordered array of normalized 0-1 points tracing the drawer's
 * left wall → bottom → right wall path (a "U" shape, open at top).
 * Returns null if contour extraction fails.
 *
 * Points are normalized to the full frame dimensions (not the opaque bounding
 * box), so they map correctly when scaled to the rendered element size.
 *
 * These points are used to create a chain of thin rectangular static bodies
 * in Matter.js (since poly-decomp is not available for concave fromVertices).
 *
 * @param imageData - ImageData of a single drawer frame (bg-removed)
 * @param topOpenFraction - fraction of the top to leave open (0-1), default 0.4
 * @param numPoints - total target point count across all 3 segments, default 24
 */
export function extractDrawerWallPath(
  imageData: ImageData,
  topOpenFraction: number = 0.4,
  numPoints: number = 24,
): { x: number; y: number }[] | null {
  const { width, height, data } = imageData;
  const alphaThreshold = 30;
  const topCutoff = Math.floor(height * topOpenFraction);

  // 1. Scan each row in the bottom region to find left and right outer edges
  const leftEdges: { x: number; y: number }[] = [];
  const rightEdges: { x: number; y: number }[] = [];

  for (let y = topCutoff; y < height; y++) {
    let leftX = -1;
    let rightX = -1;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > alphaThreshold) {
        leftX = x;
        break;
      }
    }
    for (let x = width - 1; x >= 0; x--) {
      if (data[(y * width + x) * 4 + 3] > alphaThreshold) {
        rightX = x;
        break;
      }
    }
    if (leftX >= 0 && rightX >= 0 && rightX > leftX) {
      leftEdges.push({ x: leftX, y });
      rightEdges.push({ x: rightX, y });
    }
  }

  if (leftEdges.length < 3) return null;

  // 2. Noise filter: discard rows where edge span deviates wildly from median
  //    (handles protruding handles, bg-removal artifacts, stray pixels)
  const spans = leftEdges.map((le, i) => rightEdges[i].x - le.x);
  const sortedSpans = [...spans].sort((a, b) => a - b);
  const medianSpan = sortedSpans[Math.floor(sortedSpans.length / 2)];
  const maxSpan = medianSpan * 2;
  const minSpan = medianSpan * 0.3;

  const filteredLeft: { x: number; y: number }[] = [];
  const filteredRight: { x: number; y: number }[] = [];
  for (let i = 0; i < leftEdges.length; i++) {
    if (spans[i] >= minSpan && spans[i] <= maxSpan) {
      filteredLeft.push(leftEdges[i]);
      filteredRight.push(rightEdges[i]);
    }
  }

  if (filteredLeft.length < 3) return null;

  // 3. Scan columns from bottom up to find the bottom edge profile
  const minCol = Math.min(...filteredLeft.map(e => e.x));
  const maxCol = Math.max(...filteredRight.map(e => e.x));
  const bottomEdge: { x: number; y: number }[] = [];

  for (let x = minCol; x <= maxCol; x++) {
    for (let y = height - 1; y >= topCutoff; y--) {
      if (data[(y * width + x) * 4 + 3] > alphaThreshold) {
        bottomEdge.push({ x, y });
        break;
      }
    }
  }

  if (bottomEdge.length < 3) return null;

  // 4. Subsample each segment evenly (minimum 3 points per segment)
  const perSeg = Math.max(3, Math.floor(numPoints / 3));

  const sampleEvenly = (arr: { x: number; y: number }[], n: number) => {
    if (arr.length <= n) return [...arr];
    const result: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const idx = Math.round(i * (arr.length - 1) / (n - 1));
      result.push(arr[idx]);
    }
    return result;
  };

  const leftSampled = sampleEvenly(filteredLeft, perSeg);    // top to bottom
  const bottomSampled = sampleEvenly(bottomEdge, perSeg);    // left to right
  const rightSampled = sampleEvenly(filteredRight, perSeg).reverse(); // bottom to top

  // 5. Normalize to full frame dimensions and build U-path
  const normalize = (p: { x: number; y: number }) => ({
    x: width > 1 ? p.x / (width - 1) : 0.5,
    y: height > 1 ? p.y / (height - 1) : 0.5,
  });

  // Lip points use actual first/last edge y for seamless connection
  const lipY = normalize(leftSampled[0]).y;
  const topLeftLip = { x: normalize(leftSampled[0]).x, y: lipY };
  const topRightLip = { x: normalize(rightSampled[rightSampled.length - 1]).x, y: lipY };

  const path = [
    topLeftLip,
    ...leftSampled.map(normalize),
    ...bottomSampled.map(normalize),
    ...rightSampled.map(normalize),
    topRightLip,
  ];

  // 6. Deduplicate consecutive near-identical points
  const deduplicated = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const prev = deduplicated[deduplicated.length - 1];
    const dist = Math.sqrt((path[i].x - prev.x) ** 2 + (path[i].y - prev.y) ** 2);
    if (dist > 0.005) deduplicated.push(path[i]);
  }

  return deduplicated.length >= 4 ? deduplicated : null;
}
