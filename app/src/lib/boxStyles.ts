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
  PERSPECTIVE_RULE: string;
  MOTION_DIRECTION: string;
}> = {
  front: {
    ANGLE_SUBJECT: 'front-facing',
    PERSPECTIVE_RULE:
      'orthographic flat front view only, 0% tilt, 0% rotation, no perspective skew, no three-quarter view, no side reveal.',
    MOTION_DIRECTION: 'forward toward the camera',
  },
  'left-45': {
    ANGLE_SUBJECT: 'left 45 degree',
    PERSPECTIVE_RULE:
      'fixed 45 degree left front view only. Same camera angle, same horizon, same vanishing direction, same scale, same centering, and no camera drift across all 5 states. Do not rotate the cabinet between states.',
    MOTION_DIRECTION: 'outward along the drawer axis toward the left front camera view',
  },
  'right-45': {
    ANGLE_SUBJECT: 'right 45 degree',
    PERSPECTIVE_RULE:
      'fixed 45 degree right front view only. Same camera angle, same horizon, same vanishing direction, same scale, same centering, and no camera drift across all 5 states. Do not rotate the cabinet between states.',
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

  // Map drawerWidth/drawerHeight sliders (1-5) into prompt geometry
  const widthScale = (style.drawerWidth ?? 3) / 3;    // 1→0.33, 3→1.0, 5→1.67
  const heightScale = (style.drawerHeight ?? 2) / 2;   // 1→0.5, 2→1.0, 5→2.5
  const promptWidth = Math.round(d.boxWidth * widthScale);
  const promptHeight = Math.round(d.boxHeight * heightScale);
  const promptDrawerHeight = Math.round(d.drawerHeight * heightScale);

  const states = DEFAULT_STATES;

  return `A clean production sprite sheet for a web UI. A single seamless horizontal row of 5 equal sprite cells with invisible boundaries, showing 5 aligned sprite states of the same exact one-drawer cabinet.

Subject: a single ${angle.ANGLE_SUBJECT} one-drawer cabinet, ${stylePreset} style, ${materialDesc}, colored ${colorDesc}, with ${handleDesc}, ${cornerDesc}, ${rivetDesc}, and ${keyholeDesc}. Attached surface decor only: ${decorDesc}. Extra visual details: ${additionalDesc}.

Art direction: ${artStyleDesc}

Perspective: ${angle.PERSPECTIVE_RULE}

Geometry: width proportion ${promptWidth}, height proportion ${promptHeight}, drawer face height proportion ${promptDrawerHeight}. Keep it clearly readable as exactly one cabinet shell with exactly one drawer. Do not create stacked drawers, split sections, cabinet doors, chest lids, safes, crates, trunks, boxes with lids, or extra compartments.

Motion: progressive linear mechanical movement of the same drawer from fully closed to fully open across the 5 cells: ${states[0]}%, ${states[1]}%, ${states[2]}%, ${states[3]}%, ${states[4]}%. The cabinet shell remains static and centered. Only the drawer slides directly ${angle.MOTION_DIRECTION}. The drawer front remains the same object in every state. Only drawer depth changes.

Requirements:
• pure flat #00FF00 green background, exact #00FF00
• do NOT use #00FF00 anywhere on the cabinet, drawer, handle, hardware, or decor
• no shadows, no floor shadow, no contact shadow, no glow, no halo
• no gradients, no transparency, no checkerboard, no texture on background
• no text, no numbers, no labels, no logo, no watermark
• no divider lines, no vertical lines, no panel borders between cells
• crisp clean silhouettes only
• consistent lighting, scale, camera, hardware placement, and decorative placement across all 5 states
• no overlap, no cross-cell spill, no remnants from adjacent states
• enough internal margin so the fully open drawer fits completely inside the final cell
• drawer interior is completely empty — no props, no objects, no fabric, no dust

Interpretation rules:
• style, material, and decor may only affect surface appearance and attached ornament
• they must not change the one-drawer structure, add extra compartments, add extra handles, override the camera, introduce visible text, or place objects inside the drawer
• if keyhole is not enabled, do not show a keyhole regardless of decor
• if rivets are not enabled, do not show rivets or metal studs
• handle style is authoritative — decor must not replace or add handles`;
}
