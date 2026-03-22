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
    artStyle: 'clean stylized claymation game asset with soft rounded forms and handmade charm, but structural accuracy and flat projection are higher priority than dramatic rendering',
  },
  metal: {
    material: 'metal material with brass accents and aged patina',
    artStyle: 'clean stylized game asset with decorative metal trim and weathering, but structural accuracy and flat projection are higher priority than dramatic rendering',
  },
  wood: {
    material: 'wood material with polished grain and warm lacquer',
    artStyle: 'clean stylized game asset with readable shapes and polished hand-painted detail, but structural accuracy and flat projection are higher priority than dramatic rendering',
  },
  pixel: {
    material: 'pixel-art inspired surface treatment',
    artStyle: '16-bit pixel art game asset with crisp edges, limited colors, and no anti-aliasing, but structural accuracy and flat projection are higher priority than dramatic rendering',
  },
  paper: {
    material: 'paper-crafted material with visible fold lines and creases',
    artStyle: 'clean stylized papercraft game asset with visible creases and folds, but structural accuracy and flat projection are higher priority than dramatic rendering',
  },
  glass: {
    material: 'glass material with soft refractions and iridescent edges',
    artStyle: 'clean stylized glasswork game asset with soft light refractions, but structural accuracy and flat projection are higher priority than dramatic rendering',
  },
};

// ═══════════════════════════════════════════════════════════════
// ANGLE MAP
// ═══════════════════════════════════════════════════════════════

const ANGLE_MAP: Record<DrawerAngle, {
  ANGLE_SUBJECT: string;
  PROJECTION_LOCK: string;
  CAMERA_LOCK: string;
  MOTION_AXIS_LOCK: string;
  DEPTH_RULE: string;
  MOTION_DIRECTION: string;
}> = {
  front: {
    ANGLE_SUBJECT: 'front-facing',
    PROJECTION_LOCK: `Use a flat front elevation view only.
The cabinet front plane must be perfectly parallel to the image plane.
The front face must read as a straight rectangle, not an angled plane.
No three-quarter view.
No perspective showcase angle.
No product-photo angle.
No left side plane visible.
No right side plane visible.
No top plane visible.
No bottom plane visible.
No corner depth reveal on the cabinet shell.
Vertical front edges must stay perfectly vertical and parallel.
Horizontal front edges must stay perfectly horizontal and parallel.
Do not use an off-center vanishing point.
Do not use a vanishing point above the cabinet.
Do not use a vanishing point below the cabinet.`,
    CAMERA_LOCK: `Dead center.
Straight on.
Eye level.
0% tilt.
0% rotation.
0% yaw drift.
0% pitch drift.
0% roll drift.
No lens shift.
No perspective skew.
The exact same camera must be reused for all 5 frames.
Do not move the camera.
Do not rotate the cabinet.
Do not zoom in.
Do not zoom out.
Do not change framing.`,
    MOTION_AXIS_LOCK: `Treat the image as having three axes:
X = horizontal left to right.
Y = vertical top to bottom.
Z = depth toward the viewer.
The drawer moves only along the positive Z axis.
The drawer must not move along X.
The drawer must not move along Y.
No horizontal translation.
No vertical translation.
No diagonal translation.
No sideways sliding.
No drifting left.
No drifting right.
No drifting up.
No drifting down.
The center point of the drawer front must stay at the exact same X and Y coordinates in all 5 frames.
Only its depth changes.`,
    DEPTH_RULE: `Because the drawer is opening toward the viewer, show depth only as a centered symmetric cavity reveal and a centered symmetric drawer box.
Do not show the cabinet shell from the side.
Do not turn the cabinet into a perspective object.
The drawer box may show minimal symmetric side walls only if needed to communicate forward motion, but the overall camera must still read as flat front elevation.`,
    MOTION_DIRECTION: 'outward on the Z axis toward the viewer',
  },
  'left-45': {
    ANGLE_SUBJECT: 'left 45 degree',
    PROJECTION_LOCK: `Use a fixed left 45 degree front view only.
Show a consistent left side reveal.
Do not switch toward flatter front view.
Do not switch toward stronger side view.
Do not show top down reveal.`,
    CAMERA_LOCK: `The cabinet must be viewed from the same exact left front angle in all 5 frames.
Do not change horizon.
Do not change vanishing direction.
Do not change field of view.
Do not rotate the cabinet between states.
Do not move the camera between states.
Do not zoom in or out.
The same exact camera must be reused for all 5 frames.
The cabinet shell, angle, scale, and framing remain unchanged.`,
    MOTION_AXIS_LOCK: `The drawer moves only along its own depth axis, outward toward the left front camera view.
The drawer must not slide sideways.
The drawer must not drift vertically.
The center point of the drawer front must stay aligned with the same single opening in all 5 frames.
Only depth changes.`,
    DEPTH_RULE: '',
    MOTION_DIRECTION: 'outward along the drawer axis toward the left front camera view',
  },
  'right-45': {
    ANGLE_SUBJECT: 'right 45 degree',
    PROJECTION_LOCK: `Use a fixed right 45 degree front view only.
Show a consistent right side reveal.
Do not switch toward flatter front view.
Do not switch toward stronger side view.
Do not show top down reveal.`,
    CAMERA_LOCK: `The cabinet must be viewed from the same exact right front angle in all 5 frames.
Do not change horizon.
Do not change vanishing direction.
Do not change field of view.
Do not rotate the cabinet between states.
Do not move the camera between states.
Do not zoom in or out.
The same exact camera must be reused for all 5 frames.
The cabinet shell, angle, scale, and framing remain unchanged.`,
    MOTION_AXIS_LOCK: `The drawer moves only along its own depth axis, outward toward the right front camera view.
The drawer must not slide sideways.
The drawer must not drift vertically.
The center point of the drawer front must stay aligned with the same single opening in all 5 frames.
Only depth changes.`,
    DEPTH_RULE: '',
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
  if (style.decor && style.decor.trim()) return style.decor.split(/\s*,\s*/).filter(Boolean);
  return [];
}

// ═══════════════════════════════════════════════════════════════
// FRONT SHAPE RATIO — shared cabinet + drawer front silhouette
// ═══════════════════════════════════════════════════════════════

export function mapFrontRatio(drawerWidth?: number, drawerHeight?: number): string {
  const w = drawerWidth ?? 3;
  const h = drawerHeight ?? 2;
  const ratio = w / h;

  if (ratio >= 1.6) return 'a wide landscape rectangle, clearly wider than tall';
  if (ratio >= 1.25) return 'a moderately wide rectangle, wider than tall';
  if (ratio >= 0.95) return 'a near-square rectangle';
  if (ratio >= 0.75) return 'a slightly tall rectangle';
  return 'a tall portrait rectangle, clearly taller than wide';
}

function getCameraPriorityLabel(angle: DrawerAngle): string {
  switch (angle) {
    case 'left-45':
      return 'Fixed left 45 degree camera stays locked';
    case 'right-45':
      return 'Fixed right 45 degree camera stays locked';
    default:
      return 'Centered front-facing camera stays locked';
  }
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
  const angleKey = style.angle || 'front';
  const angle = ANGLE_MAP[angleKey];
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
    style.customDecorText ? style.customDecorText.split(/\s*,\s*/).filter(Boolean) : [],
  );

  const frontRatio = mapFrontRatio(style.drawerWidth, style.drawerHeight);

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
Do not generate extra compartments, extra front panels, doors, shelves, or secondary units.
Do not interpret the 5 frames as 5 separate cabinets. They are 5 states of the same single cabinet.

PROJECTION LOCK:
${angle.PROJECTION_LOCK}

CAMERA LOCK:
${angle.CAMERA_LOCK}

SUBJECT:
A single ${angle.ANGLE_SUBJECT} one-drawer cabinet, ${stylePreset} style, ${materialDesc}, colored ${colorDesc}, with ${handleDesc}, ${cornerDesc}, ${rivetDesc}, and ${keyholeDesc}. Attached surface decor only: ${decorDesc}. Extra visual details: ${additionalDesc}.

ART DIRECTION: ${artStyleDesc}

OBJECT LOCK:
The cabinet shell must remain the same exact object in all 5 frames.
Same outer silhouette.
Same front ratio.
Same position.
Same scale.
Same lighting.
Same handle placement.
Same hardware placement.
Same decorative placement.
Do not resize, stretch, squash, narrow, widen, crop, zoom, or redesign the cabinet shell.

FRONT SHAPE RATIO:
The cabinet front silhouette and the drawer front panel must follow the same configurable width to height ratio: ${frontRatio}.
The drawer front is inset inside the cabinet shell and follows the same proportion family, only slightly smaller due to the cabinet frame margin.
This ratio applies only to the front-facing object shape inside each sprite cell.
Do not reinterpret it as the frame ratio, sprite sheet ratio, canvas ratio, or motion depth.

MOTION AXIS LOCK:
${angle.MOTION_AXIS_LOCK}

SINGLE OPENING LOCK:
The cabinet has exactly one centered drawer opening.
The drawer starts fully closed and flush inside that one opening.
The drawer opening stays centered in all 5 frames.
The drawer front stays centered in all 5 frames.
Do not create multiple horizontal bands that look like additional drawers.
Do not create a top drawer.
Do not create a bottom drawer.
Do not create decorative seams that read as extra compartments.
Do not offset the drawer opening to the left or right.
Do not reinterpret the object as a multi-drawer cabinet.
Do not create stacked drawer sections.
Do not create extra front panels that look like other drawers.

SYMMETRY LOCK:
The cabinet front is symmetric around its vertical centerline.
The drawer front is symmetric around its vertical centerline.
As the drawer opens, the visible gap around it must remain centered and symmetric.
The left and right margins must stay balanced.
The drawer must not lean, skew, or bias to one side.
${angle.DEPTH_RULE ? `\nDEPTH VISIBILITY RULE:\n${angle.DEPTH_RULE}\n` : ''}
MOTION:
Show progressive linear mechanical movement of the same drawer across 5 states: ${states[0]}%, ${states[1]}%, ${states[2]}%, ${states[3]}%, ${states[4]}% open.
The cabinet shell remains static and centered.
Only the drawer translates ${angle.MOTION_DIRECTION}.
Only drawer depth changes.
The drawer front must remain the same size, same position, and same centered alignment in all 5 frames.
The front silhouette ratio remains unchanged.

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
2. Exactly 5 equal cells
3. Exactly one cabinet and exactly one drawer
4. ${getCameraPriorityLabel(angleKey)}
5. Drawer moves only on depth axis
6. Drawer remains centered in the same opening
7. No cross-frame spill
8. Style fidelity`;
}
