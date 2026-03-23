/**
 * Compute a centered drawer position within a container.
 * Places the drawer at 50% horizontal, 60% vertical (lower portion, leaving room above for items).
 */
export function computeCenteredDrawerPosition(
  containerW: number,
  containerH: number,
): React.CSSProperties {
  return { left: containerW / 2, top: containerH * 0.6, transform: 'translate(-50%, -50%)' };
}

/**
 * Spawn origin for centered drawer: items spawn at center of container.
 */
export function computeCenteredSpawnOrigin(): { x: number; y: number } {
  return { x: 0.5, y: 0.5 };
}
