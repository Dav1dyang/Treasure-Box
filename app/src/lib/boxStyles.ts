import type { BoxDimensions, DrawerStyle, DrawerStylePreset, HandleStyle, CornerStyle, DrawerAngle } from './types';
import { DEFAULT_BOX_DIMENSIONS, DEFAULT_STATES, STYLE_PRESETS } from './config';

// ═══════════════════════════════════════════════════════════════
// STYLE BASES — creative preset → base furniture description
// ═══════════════════════════════════════════════════════════════

interface StyleDefinition {
  material: string;   // surface description only — no furniture category words
  artStyle: string;   // rendering direction per preset
}

export const STYLE_BASES: Record<DrawerStylePreset, StyleDefinition> = {
  clay: {
    material: 'clay material with visible fingerprint textures',
    artStyle: 'claymation stop-motion style with soft rounded forms and handmade charm',
  },
  metal: {
    material: 'metal material with brass accents and aged patina',
    artStyle: 'stylized steampunk game art with detailed metalwork and weathering',
  },
  wood: {
    material: 'wood material with polished grain and warm lacquer',
    artStyle: 'stylized game art with clean readable shapes and polished hand-painted detail',
  },
  pixel: {
    material: 'pixel-art inspired surface treatment',
    artStyle: '16-bit pixel art with crisp edges, limited colors, and no anti-aliasing',
  },
  paper: {
    material: 'paper-crafted material with visible fold lines and creases',
    artStyle: 'papercraft illustration with visible creases, folds, and layered paper depth',
  },
  glass: {
    material: 'glass material with soft refractions and iridescent edges',
    artStyle: 'ethereal glasswork illustration with soft light refractions and translucency',
  },
};

// ═══════════════════════════════════════════════════════════════
// ANGLE MAP
// ═══════════════════════════════════════════════════════════════

const ANGLE_MAP: Record<DrawerAngle, {
  ANGLE_SUBJECT: string;
  CAMERA_LOCK: string;
  IMAGE_PLANE_LOCK: string;
  MOTION_DIRECTION: string;
}> = {
  front: {
    ANGLE_SUBJECT: 'front-facing',
    CAMERA_LOCK: `Use one single orthographic flat front camera only.
The cabinet must face directly forward, perfectly square to the viewer.
Dead center.
Eye level.
Straight on.
0% tilt.
0% rotation.
0% yaw drift.
0% pitch drift.
0% roll drift.
No perspective skew.
No lens shift.
No three quarter view.
No side reveal.
No top reveal.
Do not show the left exterior side.
Do not show the right exterior side.
Do not show the top exterior surface.
The front face must read as a perfect straight rectangle, not an angled plane.`,
    IMAGE_PLANE_LOCK: `The cabinet front must stay parallel to the image plane.
The drawer front must stay parallel to the image plane.
The front face must not become trapezoidal.
The front face must not angle away from the viewer.
The front face must stay centered and rectangular in every frame.`,
    MOTION_DIRECTION: 'straight forward toward the camera',
  },
  'left-45': {
    ANGLE_SUBJECT: 'left 45 degree',
    CAMERA_LOCK: `Use one single fixed left 45 degree front view only.
The cabinet must be viewed from the same exact left front angle in all 5 frames.
Show a consistent left side reveal.
Do not switch toward flatter front view.
Do not switch toward stronger side view.
Do not show top down reveal.
Do not change horizon.
Do not change vanishing direction.
Do not change field of view.
Do not rotate the cabinet between states.
Do not move the camera between states.
Do not zoom in or out.
The same exact camera must be reused for all 5 frames.
Only the drawer moves.
The cabinet shell, angle, scale, and framing remain unchanged.`,
    IMAGE_PLANE_LOCK: '',
    MOTION_DIRECTION: 'outward along the drawer axis toward the left front camera view',
  },
  'right-45': {
    ANGLE_SUBJECT: 'right 45 degree',
    CAMERA_LOCK: `Use one single fixed right 45 degree front view only.
The cabinet must be viewed from the same exact right front angle in all 5 frames.
Show a consistent right side reveal.
Do not switch toward flatter front view.
Do not switch toward stronger side view.
Do not show top down reveal.
Do not change horizon.
Do not change vanishing direction.
Do not change field of view.
Do not rotate the cabinet between states.
Do not move the camera between states.
Do not zoom in or out.
The same exact camera must be reused for all 5 frames.
Only the drawer moves.
The cabinet shell, angle, scale, and framing remain unchanged.`,
    IMAGE_PLANE_LOCK: '',
    MOTION_DIRECTION: 'outward along the drawer axis toward the right front camera view',
  },
} as const;

// ═══════════════════════════════════════════════════════════════
// TOKEN MAPPING FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export function mapHandle(handleStyle: HandleStyle): string {
  const map: Record<string, string> = {
    'round-knob': 'a round knob',
    'pull-bar': 'a pull bar handle',
    'ring-pull': 'a ring pull handle',
    'half-moon': 'a half moon pull',
    'slot-pull': 'a slot pull',
    'none': 'no visible handle',
  };
  return map[handleStyle] ?? `${handleStyle} handle`;
}

export function mapCorner(cornerStyle: CornerStyle): string {
  const map: Record<string, string> = {
    rounded: 'rounded corners',
    square: 'square corners',
    beveled: 'beveled corners',
    double: 'double corner treatment',
    reinforced: 'reinforced corners',
  };
  return map[cornerStyle] ?? `${cornerStyle} corners`;
}

export function mapRivets(hasRivets: boolean): string {
  return hasRivets ? 'subtle rivets' : 'no rivets';
}

export function mapKeyhole(hasKeyhole: boolean): string {
  return hasKeyhole ? 'a visible keyhole' : 'no keyhole';
}

export function mapColors(primaryColor?: string, accentColor?: string): string {
  if (primaryColor && accentColor) {
    return `${primaryColor} with ${accentColor} accents`;
  }
  if (primaryColor) return primaryColor;
  if (accentColor) return `neutral base with ${accentColor} accents`;
  return 'balanced color treatment';
}

export function mapDecor(
  decorItems: string[] = [],
  opts?: { hasKeyhole?: boolean; hasRivets?: boolean; handleStyle?: string },
): string {
  const cleaned = decorItems
    .filter(Boolean)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => {
      if (!opts?.hasKeyhole && item.includes('keyhole')) return false;
      if (opts?.handleStyle && item.includes('ring pull') && opts.handleStyle !== 'ring-pull') return false;
      if (!opts?.hasRivets && (item.includes('metal studs') || item.includes('metal-studs'))) return false;
      return true;
    });

  if (!cleaned.length) return 'none';

  return cleaned.join(', ');
}

export function mapAdditionalFeatures(features: string[] = []): string {
  const cleaned = features
    .filter(Boolean)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

  return cleaned.length ? cleaned.join(', ') : 'none';
}

// ═══════════════════════════════════════════════════════════════
// BACKWARD COMPATIBILITY — normalize old Firestore values
// ═══════════════════════════════════════════════════════════════

const HANDLE_COMPAT: Record<string, HandleStyle> = {
  knob: 'round-knob',
  ring: 'ring-pull',
  tab: 'slot-pull',
};

const CORNER_COMPAT: Record<string, CornerStyle> = {
  sharp: 'square',
};

/** Normalize old handle/corner values from Firestore to current types. */
export function normalizeDimensions(dims: BoxDimensions): BoxDimensions {
  const handleStyle = HANDLE_COMPAT[dims.handleStyle] ?? dims.handleStyle;
  const cornerStyle = CORNER_COMPAT[dims.cornerStyle] ?? dims.cornerStyle;
  if (handleStyle === dims.handleStyle && cornerStyle === dims.cornerStyle) return dims;
  return { ...dims, handleStyle: handleStyle as HandleStyle, cornerStyle: cornerStyle as CornerStyle };
}

// ═══════════════════════════════════════════════════════════════
// STYLE RESOLUTION HELPERS
// ═══════════════════════════════════════════════════════════════

function resolveStyleTags(style: DrawerStyle): string {
  if (style.stylePattern) {
    const preset = STYLE_PRESETS.find(s => s.id === style.stylePattern);
    return preset ? preset.label : 'Modern Minimal';
  }
  // Backward compat: old docs stored the label in customPrompt
  if (style.customPrompt) return style.customPrompt;
  return 'Modern Minimal';
}

function resolveDecorTags(style: DrawerStyle): string[] {
  if (style.decor && style.decor.trim()) return style.decor.split(', ').filter(Boolean);
  return [];
}

// ═══════════════════════════════════════════════════════════════
// DRAWER FACE RATIO — natural language instead of numeric geometry
// ═══════════════════════════════════════════════════════════════

export function mapDrawerFaceRatio(drawerWidth?: number, drawerHeight?: number): string {
  const w = drawerWidth ?? 3;
  const h = drawerHeight ?? 2;
  const ratio = w / h;

  if (ratio >= 1.6) return 'The drawer front is a wide landscape rectangle, clearly wider than tall.';
  if (ratio >= 1.25) return 'The drawer front is a slightly wide rectangle, moderately wider than tall.';
  if (ratio >= 0.9) return 'The drawer front is a near-square rectangle.';
  if (ratio >= 0.7) return 'The drawer front is a slightly tall rectangle.';
  return 'The drawer front is a tall portrait rectangle, clearly taller than wide.';
}

// ═══════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════

/**
 * Build a single sprite-sheet prompt — all 5 states in one image.
 *
 * Config-driven template: every UI selection maps directly to a named token.
 */
export function buildSpriteSheetPrompt(style: DrawerStyle, dims?: BoxDimensions): string {
  const d = normalizeDimensions(dims ?? DEFAULT_BOX_DIMENSIONS);
  const def = STYLE_BASES[style.preset];

  // Resolve all tokens
  const angle = ANGLE_MAP[style.angle || 'front'];
  const stylePreset = resolveStyleTags(style);
  const materialDesc = def.material;
  const artStyleDesc = def.artStyle;
  const colorDesc = mapColors(style.color, style.accentColor);
  const handleDesc = mapHandle(d.handleStyle);
  const cornerDesc = mapCorner(d.cornerStyle);
  const rivetDesc = mapRivets(d.hasRivets);
  const keyholeDesc = mapKeyhole(d.hasKeyhole);
  const decorDesc = mapDecor(
    resolveDecorTags(style),
    { hasKeyhole: d.hasKeyhole, hasRivets: d.hasRivets, handleStyle: d.handleStyle },
  );
  const additionalDesc = mapAdditionalFeatures(
    style.customDecorText ? style.customDecorText.split(/[,\s]+/).filter(Boolean) : [],
  );

  const drawerFaceRatio = mapDrawerFaceRatio(style.drawerWidth, style.drawerHeight);

  const states = DEFAULT_STATES;

  return `Create exactly 1 production sprite sheet image for interactive web use.

OUTPUT FORMAT:
Exactly 5 frames arranged side by side in a single horizontal row.
Overall image ratio must be exactly 5:1.
Each frame must be exactly the same size.
Each frame must occupy exactly one fifth of the total image width.
Zero gaps.
Zero padding.
Zero borders.
Zero separators.
Frames must tile edge to edge with perfectly clean invisible frame boundaries.
This sheet will be sliced programmatically, so alignment must be exact.

LAYOUT RULE:
Treat the canvas as an invisible 5 column grid with 5 equal width cells.
Each sprite state must stay fully inside its own cell.
No pixels, shadows, highlights, handles, drawer edges, or decorative details may cross into a neighboring cell.
No remnants of one state may appear inside another cell.

OBJECT COUNT LOCK:
Generate exactly one cabinet total.
Generate exactly one drawer total.
Show exactly one standalone cabinet containing exactly one drawer.
Do not generate multiple cabinets.
Do not generate multiple drawers.
Do not generate stacked drawers.
Do not generate side-by-side cabinets.
Do not generate repeated furniture.
Do not generate background furniture.
Do not generate extra compartments, doors, shelves, or secondary units.
Do not interpret the 5 frames as 5 separate cabinets. They are 5 states of the same single cabinet.

CAMERA LOCK:
${angle.CAMERA_LOCK}
The camera is locked and identical across all 5 frames.
${angle.IMAGE_PLANE_LOCK ? `\nIMAGE PLANE LOCK:\n${angle.IMAGE_PLANE_LOCK}\n` : ''}
ANTI DRIFT RULE:
Across all 5 frames, keep the exact same camera, exact same object position, exact same scale, exact same framing, exact same horizon, exact same lighting, and exact same cabinet silhouette.
Do not move the camera.
Do not rotate the cabinet.
Do not zoom in.
Do not zoom out.
Do not pan left or right.
Do not pan up or down.
Do not recompose the shot.
Do not reinterpret the object from a different angle in later frames.
The 5 frames must look like the same cabinet copied 5 times under one locked camera, with only drawer depth changing.

SUBJECT:
A single ${angle.ANGLE_SUBJECT} one-drawer cabinet, ${stylePreset} style, ${materialDesc}, colored ${colorDesc}, with ${handleDesc}, ${cornerDesc}, ${rivetDesc}, and ${keyholeDesc}. Attached surface decor only: ${decorDesc}. Extra visual details: ${additionalDesc}.

ART DIRECTION: ${artStyleDesc}

DRAWER SHAPE:
${drawerFaceRatio}
This drawer shape setting applies only to the drawer front panel inside the fixed cabinet shell.
Do not reinterpret drawer shape as the overall cabinet ratio, sprite ratio, frame ratio, or canvas ratio.

MOTION:
Show progressive linear mechanical movement of the same drawer across 5 states: ${states[0]}%, ${states[1]}%, ${states[2]}%, ${states[3]}%, ${states[4]}% open.
The cabinet shell remains static and centered.
Only the drawer slides directly ${angle.MOTION_DIRECTION}.
The drawer front remains the same object in every frame.
Only drawer depth changes.
Drawer width and drawer face height remain constant during motion.

MOTION LOCK:
The cabinet shell is completely static.
The cabinet shell does not move.
The cabinet shell does not rotate.
The cabinet shell does not resize.
The cabinet shell does not shift position.
Only the drawer translates outward along its own opening axis.
No other part of the furniture moves.

CONTAINMENT:
Even at 100% open, the entire cabinet and drawer must remain fully contained inside frame 5.
Leave enough empty margin inside every cell so the open drawer never touches or crosses a frame boundary.

BACKGROUND:
Pure flat #00FF00 green background, exact #00FF00.
Do NOT use #00FF00 anywhere on the cabinet, drawer, handle, hardware, or decor.
No gradients.
No transparency.
No checkerboard.
No texture.
No floor.

NEGATIVE CONSTRAINTS:
No shadows. No floor shadows. No contact shadows. No glow. No halo.
No text. No numbers. No labels. No logo. No watermark.
No divider lines. No vertical lines. No panel borders.
No multiple cabinets. No multiple drawers. No stacked drawers.
No repeated furniture. No background furniture.
No extra compartments. No cabinet doors. No shelves. No chest lids. No safes.
No second unit of any kind.
No props. No objects inside the drawer.

INTERIOR:
Drawer interior is completely empty.

INTERPRETATION RULES:
Style, material, and decor may only affect surface appearance and attached ornament.
They must not change the one-drawer structure, add extra compartments, add extra handles, override the camera, introduce visible text, or place objects inside the drawer.
${d.hasKeyhole ? '' : 'Do not show a keyhole regardless of decor. '}${d.hasRivets ? '' : 'Do not show rivets or metal studs. '}Handle style is authoritative — decor must not replace or add handles.

PRIORITY ORDER:
1. Exact 5:1 sprite sheet layout
2. Exactly 5 equal frames
3. Exactly one cabinet and exactly one drawer total
4. No cross frame spill
5. Fixed camera and fixed cabinet shell
6. Only drawer depth changes
7. Clean programmatic slicing boundaries
8. Style and material fidelity`;
}
