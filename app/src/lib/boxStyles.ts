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

  return `Create exactly 1 production sprite sheet for a web UI.
Generate a single horizontal strip with exactly 5 equal frames showing the SAME exact one-drawer cabinet at 5 pullout states. This is a clean asset, not a poster, not a diagram, and not a labeled sheet.
Hard constraints:
• overall layout: 5 frames in 1 row, equal size, no gaps, no borders, no separators
• every frame must be fully self contained
• no pixels may spill into adjacent frames
• leave enough internal margin so the 100% open drawer still fits completely inside its own frame
• pure flat #00FF00 green background, exact #00FF00
• no transparency, no checkerboard, no gradient, no texture
• no text, no numbers, no labels, no logo, no watermark
• never render any drawer label as visible text
• no cast shadow, no floor shadow, no contact shadow, no glow, no halo
• do NOT use #00FF00 anywhere on the cabinet, drawer, handle, hardware, or decor
• crisp clean silhouette only
Subject:
Exactly one standalone cabinet shell containing exactly one sliding drawer.
Not two drawers.
Not stacked drawers.
Not a cabinet door.
Not a safe door.
Not a treasure chest.
Not a trunk.
Not a hinged lid box.
Not a crate.
A single ${angle.ANGLE_SUBJECT} one-drawer cabinet, ${stylePreset} style, ${materialDesc}, ${colorDesc}, with ${handleDesc}, ${cornerDesc}, ${rivetDesc}, and ${keyholeDesc}. Decor details: ${decorDesc}. Extra visual details: ${additionalDesc}.
Mechanics:
Only the drawer moves.
The cabinet shell stays fixed.
The drawer slides straight ${angle.MOTION_DIRECTION}.
No hinge motion.
No rotation.
No tilting.
No morphing into another furniture type.
Consistency across all 5 frames:
Same camera angle
Same scale
Same centering
Same lighting
Same cabinet shape
Same drawer front shape
Same handle position
Same keyhole position if present
Same decorative placement
No jitter
No drift
No zoom change
Camera:
${angle.PERSPECTIVE_RULE}
Geometry:
Use these proportions as guidance while keeping the object clearly readable as a single-drawer cabinet:
overall width: ${d.boxWidth}
overall height: ${d.boxHeight}
drawer face height: ${d.drawerHeight}
Hardware:
handle style: ${handleDesc}
corner style: ${cornerDesc}
rivets: ${rivetDesc}
keyhole: ${keyholeDesc}
Style:
material: ${materialDesc}
style preset: ${stylePreset}
decor items: ${decorDesc}
additional feature keywords: ${additionalDesc}
Interpretation rules:
• style and decor may change surface design only
• do not add extra drawers, extra compartments, doors, props, or interior objects
• if any style choice conflicts with the single-drawer structure, preserve the single-drawer structure first
• if keyhole is not enabled, do not show a keyhole unless explicitly required by decor
• if rivets are enabled, keep rivets subtle and fully inside the silhouette
Interior:
Drawer interior must be completely empty.
No props.
No camera.
No cat.
No fabric.
No dust.
No debris.
Frame sequence from left to right:
1. closed, pullout ${states[0]}%
2. slightly open, pullout ${states[1]}%
3. half open, pullout ${states[2]}%
4. mostly open, pullout ${states[3]}%
5. fully open, pullout ${states[4]}%
Important:
The front drawer face must remain the same object in every frame.
Only the drawer depth changes.
The 100% open state must still be fully contained inside frame 5.
No overlap, no cross-frame bleed, no remnants from neighboring states.`;
}
