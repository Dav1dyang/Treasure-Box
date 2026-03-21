import type { BoxDimensions, DrawerStyle, DrawerStylePreset, HandleStyle, CornerStyle, DrawerAngle } from './types';
import { DEFAULT_BOX_DIMENSIONS, DEFAULT_STATES, STYLE_PRESETS } from './config';

// ═══════════════════════════════════════════════════════════════
// STYLE BASES — creative preset → base furniture description
// ═══════════════════════════════════════════════════════════════

interface StyleDefinition {
  furnitureStyle: string;
  mainColor: string;
  hardware: string;
  handleStyle: string;
  artStyle: string;
}

export const STYLE_BASES: Record<DrawerStylePreset, StyleDefinition> = {
  clay: {
    furnitureStyle: 'cute chunky claymation drawer from an Aardman Studios-style cabinet',
    mainColor: 'soft warm clay with visible fingerprint textures',
    hardware: 'clay with rounded sculpted shapes',
    handleStyle: 'round clay knob',
    artStyle: 'claymation stop-motion style with soft rounded forms and handmade charm',
  },
  metal: {
    furnitureStyle: 'steampunk brass and iron drawer from an industrial apothecary cabinet',
    mainColor: 'dark iron with brass accents and green patina',
    hardware: 'aged brass with rivets and patina',
    handleStyle: 'ornate metal ring-pull',
    artStyle: 'stylized steampunk game art with detailed metalwork and weathering',
  },
  wood: {
    furnitureStyle: 'ornate Victorian polished wooden drawer from an elegant dresser',
    mainColor: 'rich polished wood grain with warm lacquer',
    hardware: 'warm brass with corner brackets',
    handleStyle: 'round brass knob',
    artStyle: 'stylized game art with clean readable shapes and polished hand-painted detail',
  },
  pixel: {
    furnitureStyle: 'retro pixel art drawer from a 16-bit RPG inventory cabinet',
    mainColor: 'warm brown with limited pixel palette',
    hardware: 'pixel-styled metal with crisp edges',
    handleStyle: 'pixelated square knob',
    artStyle: '16-bit pixel art with crisp edges, limited colors, and no anti-aliasing',
  },
  paper: {
    furnitureStyle: 'origami papercraft drawer from a folded paper jewelry box',
    mainColor: 'cream and kraft paper with visible fold lines',
    hardware: 'folded paper with sharp creases',
    handleStyle: 'paper tab pull',
    artStyle: 'papercraft illustration with visible creases, folds, and layered paper depth',
  },
  glass: {
    furnitureStyle: 'translucent blown glass drawer from an iridescent crystal cabinet',
    mainColor: 'clear glass with soft refractions and iridescent edges',
    hardware: 'frosted glass with subtle shimmer',
    handleStyle: 'frosted glass knob',
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
      'orthographic flat front view only, 0% tilt, 0% rotation.',
    MOTION_DIRECTION: 'forward toward the camera',
  },
  'left-45': {
    ANGLE_SUBJECT: 'left 45 degree',
    PERSPECTIVE_RULE:
      'fixed 45 degree left front view only. Keep the same camera angle, same perspective, and no rotation drift across all 5 states.',
    MOTION_DIRECTION: 'outward along the drawer axis toward the left front camera view',
  },
  'right-45': {
    ANGLE_SUBJECT: 'right 45 degree',
    PERSPECTIVE_RULE:
      'fixed 45 degree right front view only. Keep the same camera angle, same perspective, and no rotation drift across all 5 states.',
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

export function mapMaterial(material: string): string {
  const map: Record<string, string> = {
    wood: 'wood material',
    'painted-wood': 'painted wood',
    metal: 'metal material',
    brass: 'brass material',
    steel: 'steel material',
    plastic: 'smooth plastic material',
    velvet: 'velvet covered surface',
    leather: 'leather wrapped surface',
  };
  return map[material] ?? `${material} material`;
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
  opts?: { hasKeyhole?: boolean; handleStyle?: string },
): string {
  const cleaned = decorItems
    .filter(Boolean)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => {
      if (!opts?.hasKeyhole && item.includes('keyhole')) return false;
      if (opts?.handleStyle && item.includes('ring pull') && opts.handleStyle !== 'ring-pull') return false;
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
  const materialDesc = def.furnitureStyle;
  const colorDesc = mapColors(style.color, style.accentColor);
  const handleDesc = mapHandle(d.handleStyle);
  const cornerDesc = mapCorner(d.cornerStyle);
  const rivetDesc = mapRivets(d.hasRivets);
  const keyholeDesc = mapKeyhole(d.hasKeyhole);
  const decorDesc = mapDecor(
    resolveDecorTags(style),
    { hasKeyhole: d.hasKeyhole, handleStyle: d.handleStyle },
  );
  const additionalDesc = mapAdditionalFeatures(
    style.customDecorText ? style.customDecorText.split(/[,\s]+/).filter(Boolean) : [],
  );

  const states = DEFAULT_STATES;

  return `A clean production sprite sheet for a web UI, horizontal strip with exactly 5 equal frames.
Subject: A single ${angle.ANGLE_SUBJECT} one-drawer cabinet, ${stylePreset} style, ${materialDesc}, ${colorDesc}, with ${handleDesc}, ${cornerDesc}, ${rivetDesc}, and ${keyholeDesc}. Decor details: ${decorDesc}. Extra visual details: ${additionalDesc}.
Perspective: ${angle.PERSPECTIVE_RULE}
Geometry: front width proportion ${d.boxWidth}, total height proportion ${d.boxHeight}, drawer face height proportion ${d.drawerHeight}. Keep the object clearly readable as exactly one cabinet shell with exactly one drawer. Do not create stacked drawers, split compartments, cabinet doors, or chest lids.
Sequence: Frame 1 drawer ${states[0]}% open, Frame 2 drawer ${states[1]}% open, Frame 3 drawer ${states[2]}% open, Frame 4 drawer ${states[3]}% open, Frame 5 drawer ${states[4]}% open.
The cabinet shell remains static and centered. Only the drawer slides directly ${angle.MOTION_DIRECTION}. The drawer front stays the same in every frame. Only drawer depth changes.
Requirements: Pure #00FF00 green background, no shadows, no floor, no gradients, no transparency, no checkerboard, no text, no numbers, no labels, no watermark. Do NOT use #00FF00 anywhere on the cabinet, drawer, handle, hardware, or decor. Crisp clean silhouettes, consistent lighting, consistent scale, consistent camera, and consistent hardware placement across all frames. Each frame must be fully self-contained with no overlap, no spill into adjacent frames, and enough internal margin so the most open drawer still fits completely inside its own frame. Drawer interior is completely empty. No props, no camera, no cat, no fabric, no dust, no debris.`;
}
