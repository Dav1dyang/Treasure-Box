import type { BoxDimensions, DrawerStyle, DrawerStylePreset } from './types';
import { DEFAULT_BOX_DIMENSIONS, STYLE_PRESETS } from './config';

/**
 * Structured style definitions for each preset.
 * Only furnitureStyle is used in the current prompt template.
 */
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

/**
 * Build a single sprite-sheet prompt — all 5 states in one image.
 *
 * Config-driven template: every UI selection maps directly to a placeholder.
 */
export function buildSpriteSheetPrompt(style: DrawerStyle, dims?: BoxDimensions): string {
  const d = dims ?? DEFAULT_BOX_DIMENSIONS;
  const def = STYLE_BASES[style.preset];

  const material = def.furnitureStyle;
  const stylePreset = resolveStyleTags(style);
  const decorItems = resolveDecorTags(style);
  const additionalFeatures = style.customDecorText || 'none';
  const resolvedCameraBlock = resolveAngle(style.angle || 'front');

  return `Create exactly ONE production sprite sheet image for interactive web use.  This is a strict UI asset. It is NOT a poster, concept sheet, storyboard, infographic, labeled diagram, product render, marketing image, or scene illustration.

CONFIG PRECEDENCE: All resolved configuration values below are HARD REQUIREMENTS. They must be followed literally. Do not substitute, reinterpret, stylize away, or approximate them. If any style instruction conflicts with a resolved configuration value, the resolved configuration value wins.

GOAL: Generate one single horizontal 5-frame sprite sheet showing the SAME exact one-drawer cabinet across 5 drawer pullout states.

OUTPUT STRUCTURE:
- Exactly 5 frames
- One horizontal row only
- Overall aspect ratio exactly 5:1
- Equal frame width and equal frame height
- No gaps
- No padding
- No borders
- No separators
- No overlapping between frames
- No object may spill into adjacent frames
- Each frame must be fully self-contained
- Leave enough empty margin inside each frame so the most open drawer fits completely within its own frame

BACKGROUND:
- Pure flat vivid green background
- Exact hex #00FF00
- RGB 0,255,0
- No transparency
- No checkerboard
- No texture
- No gradient
- No vignette
- No lighting variation

IMPORTANT COLOR RESTRICTION:
- Do NOT use #00FF00 anywhere on the cabinet, drawer, handle, hardware, or decor
- Do NOT use neon green or bright chroma green on the furniture
- White, cream, ivory, beige, wood, metal, muted colors are allowed
- Ensure strong contrast against the green background for clean cutout use

TEXT RESTRICTION:
- No text
- No letters
- No numbers
- No symbols
- No logos
- No labels
- No watermark
- No signature
- Drawer label is metadata only and must never appear visually

OBJECT LOCK:
Generate exactly one standalone cabinet shell containing exactly one sliding drawer. Nothing else.

ABSOLUTELY DO NOT GENERATE:
- two drawers
- multiple compartments
- cabinet doors
- safes
- treasure chests
- trunks
- crates
- hinged lids
- flap doors
- tilt-out bins
- shelves
- props
- contents inside drawer
- animals
- people
- room scene

MECHANICAL LOCK:
- Only the drawer moves
- Cabinet shell stays fixed
- Drawer slides straight outward along one axis
- No rotation
- No hinge motion
- No tilt
- No morphing
- No transformation into another furniture type
- Drawer interior must remain completely empty in every frame

CAMERA LOCK:
${resolvedCameraBlock}

CONSISTENCY LOCK:
The following must remain identical in all 5 frames:
- same cabinet
- same camera angle
- same scale
- same centering
- same lighting
- same proportions
- same handle placement
- same keyhole placement
- same trim placement
- same drawer face shape
- same cabinet shell shape
- same hardware count
- same decor placement

No jitter. No zoom drift. No shape drift. No perspective drift. No hardware drift.

GEOMETRY:
- overall width units: ${d.boxWidth}
- overall height units: ${d.boxHeight}
- drawer face height units: ${d.drawerHeight}

HARDWARE:
- handle style: ${d.handleStyle}
- corner style: ${d.cornerStyle}
- has rivets: ${d.hasRivets}
- has keyhole: ${d.hasKeyhole}

SURFACE STYLE:
- material: ${material}
- style preset: ${stylePreset}
- decor items: ${decorItems}
- additional feature keywords: ${additionalFeatures}

STYLE INTERPRETATION RULE:
Apply the style only to surface design, material feel, trim language, and decorative details. Do NOT let style change:
- camera angle
- object count
- cabinet type
- number of drawers
- drawer mechanics
- frame layout

NO SHADOW RULE:
- No floor shadow
- No cast shadow
- No contact shadow
- No drop shadow
- No glow
- No halo
- No outline stroke
- No reflected ground shadow
- Crisp clean edges only

FRAME STATES:
Frame 1: drawer pullout 0%
Frame 2: drawer pullout 12%
Frame 3: drawer pullout 28%
Frame 4: drawer pullout 55%
Frame 5: drawer pullout 82%

Important:
- Pullout must increase monotonically from frame 1 to frame 5
- The cabinet shell never moves
- The drawer remains aligned on the same axis in every frame

NEGATIVE CONSTRAINTS:
Do not generate:
- angled view different from resolved camera
- extra drawers
- merged drawer sections
- perspective drift
- text
- numbers
- labels
- frame overlap
- cross-frame spill
- shadows on background
- interior contents
- inconsistent proportions
- inconsistent hardware
- inconsistent object count

QUALITY PRIORITY:
1. Obey all resolved configuration values literally
2. Exact camera angle lock
3. Exact 5 equal self-contained frames
4. No text at all
5. Exactly one drawer only
6. True straight sliding-drawer mechanics
7. No cross-frame overlap or spill
8. Consistent geometry and hardware across all 5 frames
9. No shadows
10. Empty interior
11. Clean pure green background
12. Style fidelity`;
}

function resolveStyleTags(style: DrawerStyle): string {
  if (style.stylePattern) {
    const preset = STYLE_PRESETS.find(s => s.id === style.stylePattern);
    return preset ? preset.label : 'Modern Minimal';
  }
  // Backward compat: old docs stored the label in customPrompt
  if (style.customPrompt) return style.customPrompt;
  return 'Modern Minimal';
}

function resolveDecorTags(style: DrawerStyle): string {
  if (style.decor && style.decor.trim()) return style.decor;
  return 'none';
}

function resolveAngle(angle: string): string {
  if (angle === 'left-45') {
    return `- View = fixed left three-quarter view
- Cabinet is rotated so the left side is visible and the front remains clearly visible
- Keep the same exact left 45-degree style view in all 5 frames
- Do not switch to front view
- Do not switch to right 45-degree view
- Do not switch to isometric
- Do not change perspective between frames
- Top surface visibility must remain consistent across all frames`;
  }
  if (angle === 'right-45') {
    return `- View = fixed right three-quarter view
- Cabinet is rotated so the right side is visible and the front remains clearly visible
- Keep the same exact right 45-degree style view in all 5 frames
- Do not switch to front view
- Do not switch to left 45-degree view
- Do not switch to isometric
- Do not change perspective between frames
- Top surface visibility must remain consistent across all frames`;
  }
  return `- View = straight front view
- Drawer front must face directly toward the viewer
- Drawer front plane is parallel to the image plane
- No left 45-degree view
- No right 45-degree view
- No three-quarter view
- No isometric view
- No top-down view
- No bottom-up view
- No side panel visible
- No cabinet depth emphasis from perspective rotation
- Top surface should not be visible
- Left and right outer edges appear vertical and front-facing
- This must read as a flat straight-on elevation view, not an angled product render`;
}
