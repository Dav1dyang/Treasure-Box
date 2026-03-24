/**
 * Extract contour points from an image for irregular physics shapes.
 *
 * Uses a two-pass approach:
 * 1. Build a binary alpha mask and trace the outer boundary using Moore-Neighbor contour tracing
 * 2. Simplify the resulting polygon with Ramer-Douglas-Peucker to a manageable vertex count
 *
 * This produces collision boundaries that closely follow the actual item silhouette,
 * including concavities, rather than the old ray-cast approach which could only produce
 * star-convex approximations.
 */

type Point = { x: number; y: number };

// ─── Binary alpha mask helpers ───────────────────────────────────────────────

function buildAlphaMask(imageData: ImageData, threshold: number): Uint8Array {
  const { width, height, data } = imageData;
  // Pad by 1 on each side so contour tracing never goes out of bounds
  const pw = width + 2;
  const ph = height + 2;
  const mask = new Uint8Array(pw * ph); // all 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > threshold) {
        mask[(y + 1) * pw + (x + 1)] = 1;
      }
    }
  }
  return mask;
}

// ─── Moore-Neighbor contour tracing ──────────────────────────────────────────
// Traces the outer boundary of the first connected opaque region found by
// scanning top-to-bottom, left-to-right.  Returns pixel coordinates (in the
// padded mask coordinate system, offset back to image coords at the end).

const MOORE_DX = [1, 1, 0, -1, -1, -1, 0, 1]; // 8-connected neighbor offsets
const MOORE_DY = [0, 1, 1, 1, 0, -1, -1, -1]; // starting East, going CW

function traceContour(mask: Uint8Array, maskW: number, maskH: number): Point[] {
  // Find the first opaque pixel (topmost, then leftmost)
  let startX = -1, startY = -1;
  outer: for (let y = 0; y < maskH; y++) {
    for (let x = 0; x < maskW; x++) {
      if (mask[y * maskW + x] === 1) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }
  if (startX < 0) return [];

  const contour: Point[] = [];
  let cx = startX, cy = startY;
  // The backtrack direction: we entered from the left (west), so start checking from west neighbor
  let dir = 7; // start direction: NW (backtrack from W means start scanning at NW)

  const maxIter = maskW * maskH * 2; // safety limit
  let iter = 0;

  do {
    // Offset back to image coordinates (remove padding)
    contour.push({ x: cx - 1, y: cy - 1 });

    // Scan 8 neighbors starting from (dir+1)%8, going clockwise
    let found = false;
    const startDir = (dir + 6) % 8; // backtrack: start from 2 before last direction (Moore's rule)
    for (let i = 0; i < 8; i++) {
      const d = (startDir + i) % 8;
      const nx = cx + MOORE_DX[d];
      const ny = cy + MOORE_DY[d];
      if (nx >= 0 && nx < maskW && ny >= 0 && ny < maskH && mask[ny * maskW + nx] === 1) {
        // Advance to this neighbor
        dir = d;
        cx = nx;
        cy = ny;
        found = true;
        break;
      }
    }

    if (!found) break; // isolated pixel
    iter++;
  } while ((cx !== startX || cy !== startY) && iter < maxIter);

  return contour;
}

// ─── Ramer-Douglas-Peucker polygon simplification ───────────────────────────

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = p.x - a.x, ey = p.y - a.y;
    return Math.sqrt(ex * ex + ey * ey);
  }
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const ex = p.x - projX, ey = p.y - projY;
  return Math.sqrt(ex * ex + ey * ey);
}

function rdpSimplify(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

// ─── Ensure counter-clockwise winding (required by Matter.js) ───────────────

function signedArea(pts: Point[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return area / 2;
}

function ensureCCW(pts: Point[]): Point[] {
  if (signedArea(pts) > 0) return pts; // already CCW
  return [...pts].reverse();
}

// ─── Remove duplicate/near-duplicate consecutive points ─────────────────────

function dedup(pts: Point[], minDist: number): Point[] {
  if (pts.length === 0) return pts;
  const result = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = result[result.length - 1];
    const dx = pts[i].x - prev.x, dy = pts[i].y - prev.y;
    if (dx * dx + dy * dy >= minDist * minDist) {
      result.push(pts[i]);
    }
  }
  return result;
}

// ─── Downsample to N evenly-spaced points along the perimeter ───────────────

function downsampleByArcLength(pts: Point[], maxPoints: number): Point[] {
  if (pts.length <= maxPoints) return pts;

  // Compute cumulative arc lengths
  const cumLen = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    cumLen.push(cumLen[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const totalLen = cumLen[cumLen.length - 1];
  if (totalLen === 0) return [pts[0]];

  const step = totalLen / maxPoints;
  const result: Point[] = [pts[0]];
  let target = step;
  let j = 1;

  for (let i = 1; i < maxPoints; i++) {
    while (j < pts.length - 1 && cumLen[j] < target) j++;
    // Interpolate between j-1 and j
    const segLen = cumLen[j] - cumLen[j - 1];
    const t = segLen > 0 ? (target - cumLen[j - 1]) / segLen : 0;
    result.push({
      x: pts[j - 1].x + t * (pts[j].x - pts[j - 1].x),
      y: pts[j - 1].y + t * (pts[j].y - pts[j - 1].y),
    });
    target += step;
  }

  return result;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Extract contour points from an image with a transparent background.
 *
 * Returns normalized 0-1 coordinates (relative to the opaque bounding box)
 * suitable for storage and later conversion to Matter.js vertices.
 *
 * @param imageData  - ImageData from a canvas
 * @param maxPoints  - Maximum vertices in the output polygon (default 24)
 */
export function extractContourFromImage(
  imageData: ImageData,
  maxPoints: number = 24
): Point[] {
  const { width, height } = imageData;
  const alphaThreshold = 30;

  // 1. Build padded binary mask
  const paddedW = width + 2;
  const paddedH = height + 2;
  const mask = buildAlphaMask(imageData, alphaThreshold);

  // 2. Trace the outer contour
  let rawContour = traceContour(mask, paddedW, paddedH);
  if (rawContour.length < 4) {
    // Fallback to rectangle
    return [
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 1, y: 1 }, { x: 0, y: 1 },
    ];
  }

  // 3. Find bounding box of non-transparent pixels for normalization
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (const p of rawContour) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  if (minX >= maxX || minY >= maxY) {
    return [
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 1, y: 1 }, { x: 0, y: 1 },
    ];
  }

  // 4. Remove near-duplicate points
  rawContour = dedup(rawContour, 1);

  // 5. Simplify with RDP — use epsilon proportional to image size
  const diagSize = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
  const epsilon = diagSize * 0.015; // ~1.5% of diagonal — tight fit
  let simplified = rdpSimplify(rawContour, epsilon);

  // 6. If still too many points, downsample by arc length
  if (simplified.length > maxPoints) {
    simplified = downsampleByArcLength(simplified, maxPoints);
  }

  // 7. Ensure minimum point count
  if (simplified.length < 4) {
    return [
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 1, y: 1 }, { x: 0, y: 1 },
    ];
  }

  // 8. Ensure CCW winding for Matter.js
  simplified = ensureCCW(simplified);

  // 9. Normalize to 0-1 range
  const bw = maxX - minX;
  const bh = maxY - minY;
  return simplified.map(p => ({
    x: Math.max(0, Math.min(1, (p.x - minX) / bw)),
    y: Math.max(0, Math.min(1, (p.y - minY) / bh)),
  }));
}

/**
 * Convert normalized contour points to Matter.js vertices
 */
export function contourToVertices(
  contour: Point[],
  width: number,
  height: number
): Point[] {
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
 * in Matter.js for the drawer walls.
 *
 * @param imageData - ImageData of a single drawer frame (bg-removed)
 * @param topOpenFraction - fraction of the top to leave open (0-1), default 0.4
 * @param numPoints - number of contour sample points, default 32
 */
export function extractDrawerWallPath(
  imageData: ImageData,
  topOpenFraction: number = 0.4,
  numPoints: number = 32,
): Point[] | null {
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
