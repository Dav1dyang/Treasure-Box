import type { BoxDimensions, DrawerStyle, DrawerStylePreset, HandleStyle, CornerStyle } from './types';
import { DEFAULT_BOX_DIMENSIONS, DECOR_ITEMS } from './config';

// ═══════════════════════════════════════════════════════════════
// MATERIAL MAP — one-liner per material preset
// ═══════════════════════════════════════════════════════════════

export const MATERIAL_MAP: Record<DrawerStylePreset, string> = {
  clay: 'clay with visible claymation handmade textures really fluffy and thick',
  metal: 'metal with brass accents and aged patina',
  wood: 'wood with polished grain and warm lacquer',
  pixel: 'pixel-art surface, 8-bit crisp edges, limited palette',
  paper: 'paper-craft with visible fold lines and creases',
  glass: 'glass with soft refractions and iridescent edges',
};

// ═══════════════════════════════════════════════════════════════
// STYLE MAP — descriptive phrase per style preset
// ═══════════════════════════════════════════════════════════════

export const STYLE_MAP: Record<string, string> = {
  'mid-century-modern': 'mid-century modern',
  'victorian-ornate': 'Victorian ornate',
  'art-deco-glam': 'Art Deco glam',
  'rustic-farmhouse': 'rustic farmhouse',
  'modern-minimal': 'modern minimal',
};

// ═══════════════════════════════════════════════════════════════
// DECOR LABEL MAP — natural language per decor ID
// ═══════════════════════════════════════════════════════════════

export const DECOR_LABEL_MAP: Record<string, string> = {
  'old-keyhole': 'an old-fashioned keyhole',
  'corner-caps': 'decorative corner caps',
  'metal-studs': 'metal studs',
  'ring-pull': 'a ring pull',
  'engraved-trim': 'engraved trim',
};

// ═══════════════════════════════════════════════════════════════
// HANDLE / CORNER DESCRIPTION MAPS
// ═══════════════════════════════════════════════════════════════

const HANDLE_DESC: Record<HandleStyle, string> = {
  'round-knob': 'A round knob handle',
  'pull-bar': 'A pull bar handle',
  'ring-pull': 'A ring pull handle',
  'half-moon': 'A half moon pull handle',
  'slot-pull': 'A slot pull handle',
  'none': 'No visible handle',
};

const CORNER_DESC: Record<CornerStyle, string> = {
  rounded: 'Rounded corners',
  square: 'Square corners',
  beveled: 'Beveled corners',
  double: 'Double corner treatment',
  reinforced: 'Reinforced corners',
};

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
// PROMPT BUILDER — clean fixed template with variable substitution
// ═══════════════════════════════════════════════════════════════

/**
 * Build a single sprite-sheet prompt using a fixed template.
 * Only the predefined variables get swapped in — the prose never changes.
 */
export function buildDrawerPrompt(style: DrawerStyle, dims?: BoxDimensions): string {
  const d = normalizeDimensions(dims ?? DEFAULT_BOX_DIMENSIONS);

  // Resolve variables
  const ANGLE = 'left 45-degree';
  const STYLE = STYLE_MAP[style.stylePattern ?? 'modern-minimal'] ?? 'modern minimal';
  const MATERIAL = MATERIAL_MAP[style.preset];
  const MAIN_COLOR = style.color || '#8B4513';
  const ACCENT_COLOR = style.accentColor || '#B08D57';
  const HANDLE = HANDLE_DESC[d.handleStyle] ?? `${d.handleStyle} handle`;
  const CORNERS = CORNER_DESC[d.cornerStyle] ?? `${d.cornerStyle} corners`;

  // Resolve decor from toggle pills + custom text
  const decorParts: string[] = [];
  if (style.decor) {
    for (const label of style.decor.split(/\s*,\s*/).filter(Boolean)) {
      // Map known decor item labels to natural language
      const item = DECOR_ITEMS.find(di => di.label === label);
      if (item) {
        decorParts.push(DECOR_LABEL_MAP[item.id] ?? label);
      } else {
        decorParts.push(label);
      }
    }
  }
  if (style.customDecorText) {
    for (const kw of style.customDecorText.split(/\s*,\s*/).filter(Boolean)) {
      decorParts.push(kw.trim());
    }
  }
  const DECOR = decorParts.length > 0
    ? decorParts.join(', ')
    : 'No extra hardware or ornamentation';

  return `Sprite sheet: 5 evenly spaced sprites on a single continuous #00FF00 green canvas, 5:1 aspect ratio. No borders, dividers, separators, panel outlines, or black lines anywhere. One unbroken flat green background.

Each sprite is centered within its cell and must fit within the center 70% of its cell, 30% green margin on every side, even at 100% open with the drawer fully extended. Zero bleed between cells.

Subject: a single one-drawer cabinet, ${ANGLE} view, ${STYLE} style, ${MATERIAL}. ${MAIN_COLOR} body with ${ACCENT_COLOR} accents. ${HANDLE}, ${CORNERS}. ${DECOR}. Exactly one drawer, no stacked drawers, no multi-drawer, no extra compartments.

Sprite 1: drawer closed (0%). Sprite 2: drawer slightly open (25%). Sprite 3: drawer half open (50%). Sprite 4: drawer mostly open (75%). Sprite 5: drawer fully open (100%). Progression is linear and mechanical. Cabinet shell stays identical across all 5 sprites. Same angle, scale, position, lighting. Only the drawer translates outward along depth axis. Drawer interior empty.

No shadows, no floor, no text, no labels, no watermark. No props inside drawer. Game asset style, clean edges.`;
}
