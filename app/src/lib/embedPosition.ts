import type { AnchorCorner } from './types';

/** Reference viewport dimensions (design space — offsets are specified relative to this) */
export const REFERENCE_W = 1440;
export const REFERENCE_H = 900;

/**
 * Compute CSS position for the drawer given an anchor corner and pixel offsets.
 * Returns { left, top, transform } for center-point positioning.
 *
 * @param anchor  Which corner the offsets are relative to
 * @param offsetX Pixels from the anchor's X edge (in reference space)
 * @param offsetY Pixels from the anchor's Y edge (in reference space)
 * @param containerW Actual container width in pixels
 * @param containerH Actual container height in pixels
 */
export function computeDrawerPosition(
  anchor: AnchorCorner,
  offsetX: number,
  offsetY: number,
  containerW: number,
  containerH: number,
): React.CSSProperties {
  const scaleX = containerW / REFERENCE_W;
  const scaleY = containerH / REFERENCE_H;

  let cx: number, cy: number;
  if (anchor.includes('right')) cx = containerW - offsetX * scaleX;
  else cx = offsetX * scaleX;
  if (anchor.includes('bottom')) cy = containerH - offsetY * scaleY;
  else cy = offsetY * scaleY;

  return { left: cx, top: cy, transform: 'translate(-50%, -50%)' };
}

/**
 * Compute spawn origin as a fraction of the container (0-1).
 * Clamped to [0.1, 0.9] to keep items in view.
 */
export function computeSpawnOrigin(
  anchor: AnchorCorner,
  offsetX: number,
  offsetY: number,
  containerW: number,
  containerH: number,
): { x: number; y: number } {
  const scaleX = containerW / REFERENCE_W;
  const scaleY = containerH / REFERENCE_H;

  let x: number, y: number;
  if (anchor.includes('right')) x = (containerW - offsetX * scaleX) / containerW;
  else x = (offsetX * scaleX) / containerW;
  if (anchor.includes('bottom')) y = (containerH - offsetY * scaleY) / containerH;
  else y = (offsetY * scaleY) / containerH;

  return {
    x: Math.max(0.1, Math.min(0.9, x)),
    y: Math.max(0.1, Math.min(0.9, y)),
  };
}

/**
 * Given a pointer position within the container, determine the best anchor corner
 * and compute the offsets in reference space.
 */
export function positionFromPointer(
  pointerX: number,
  pointerY: number,
  containerW: number,
  containerH: number,
): { anchor: AnchorCorner; offsetX: number; offsetY: number } {
  const scaleX = containerW / REFERENCE_W;
  const scaleY = containerH / REFERENCE_H;

  const anchor: AnchorCorner =
    pointerX < containerW / 2 && pointerY < containerH / 2 ? 'top-left' :
    pointerX >= containerW / 2 && pointerY < containerH / 2 ? 'top-right' :
    pointerX < containerW / 2 ? 'bottom-left' : 'bottom-right';

  let offsetX: number, offsetY: number;
  if (anchor.includes('right')) offsetX = (containerW - pointerX) / scaleX;
  else offsetX = pointerX / scaleX;
  if (anchor.includes('bottom')) offsetY = (containerH - pointerY) / scaleY;
  else offsetY = pointerY / scaleY;

  return {
    anchor,
    offsetX: Math.round(Math.max(0, offsetX)),
    offsetY: Math.round(Math.max(0, offsetY)),
  };
}
