import type { AnchorCorner } from './types';

/** Padding (px) between the drawer edge and the container edge when anchored */
const ANCHOR_PAD = 0;

/**
 * Compute drawer CSS position within an iframe/container based on the anchor corner.
 * The drawer is placed near the anchor edge with minimal padding so it hugs the corner.
 */
export function computeAnchoredDrawerPosition(
  containerW: number,
  containerH: number,
  anchor: AnchorCorner = 'bottom-right',
  padding: number = ANCHOR_PAD,
): React.CSSProperties {
  const style: React.CSSProperties = { position: 'absolute' };

  // Vertical
  if (anchor.startsWith('top')) {
    style.top = padding;
  } else if (anchor.startsWith('middle')) {
    style.top = containerH / 2;
    style.transform = 'translateY(-50%)';
  } else {
    // bottom (default)
    style.bottom = padding;
  }

  // Horizontal
  if (anchor.endsWith('left')) {
    style.left = padding;
  } else if (anchor.endsWith('center')) {
    style.left = containerW / 2;
    style.transform = (style.transform || '') + ' translateX(-50%)';
  } else {
    // right (default)
    style.right = padding;
  }

  return style;
}

/**
 * Compute spawn origin (0-1 fraction) for items based on anchor.
 * Items spawn from the anchor corner where the drawer lives.
 */
export function computeAnchoredSpawnOrigin(anchor: AnchorCorner = 'bottom-right'): { x: number; y: number } {
  let x = 0.5;
  let y = 0.5;

  if (anchor.endsWith('left')) x = 0.15;
  else if (anchor.endsWith('right')) x = 0.85;

  if (anchor.startsWith('top')) y = 0.15;
  else if (anchor.startsWith('bottom')) y = 0.85;

  return { x, y };
}

// ---- Backward-compatible aliases ----

export function computeCenteredDrawerPosition(
  containerW: number,
  containerH: number,
): React.CSSProperties {
  return computeAnchoredDrawerPosition(containerW, containerH, 'middle-center');
}

export function computeCenteredSpawnOrigin(): { x: number; y: number } {
  return computeAnchoredSpawnOrigin('middle-center');
}
