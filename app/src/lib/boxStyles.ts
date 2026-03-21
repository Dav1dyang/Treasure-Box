import type { BoxDimensions, BoxState, DrawerStyle, DrawerStylePreset } from './types';
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

/** The 5 sprite frames in order, mapped to BoxState keys and their pullout percentages. */
const FRAME_STATES: { state: BoxState; label: string }[] = [
  { state: 'IDLE', label: 'IDLE' },
  { state: 'HOVER_PEEK', label: 'HOVER_PEEK' },
  { state: 'CLOSING', label: 'CLOSING' },
  { state: 'HOVER_CLOSE', label: 'HOVER_CLOSE' },
  { state: 'OPEN', label: 'OPEN' },
];

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
  const angle = resolveAngle(style.angle || 'front');

  // Build frame state lines
  const frameLines = FRAME_STATES.map((f, i) => {
    const pct = d.drawerPullout[f.state] ?? 0;
    return `Frame ${i + 1} = ${f.label}, pullout ${pct}%`;
  }).join('\n');

  return `Create exactly ONE production sprite sheet image.  This is a clean UI asset for interactive web use. It is NOT a poster, concept sheet, storyboard, infographic, labeled diagram, or marketing image.

GOAL:
Generate a single horizontal 5-frame sprite sheet showing the SAME exact one-drawer cabinet across 5 drawer pullout states.

SPRITE SHEET LAYOUT:
- Exactly 5 frames in one horizontal row
- Overall ratio exactly 5:1
- Equal frame widths and heights
- No gaps
- No padding
- No borders
- No separators
- Each frame must be fully self-contained
- No pixels may spill into adjacent frames
- Leave enough internal empty margin so even the most open drawer fits entirely inside its own frame

BACKGROUND:
- Pure flat vivid green background
- Exact #00FF00 / RGB (0, 255, 0)
- No transparency
- No checkerboard
- No texture
- No gradient
- No vignette
- No lighting variation

IMPORTANT COLOR RULE:
- Do NOT use vivid green (#00FF00) anywhere on the furniture body, hardware, or decorations
- Do NOT use any bright or neon green tones on the furniture
- Light colors (white, cream, ivory) are perfectly fine on the furniture
- Ensure enough contrast between the furniture and the green background for clean separation

TEXT RULE:
- No text
- No numbers
- No labels
- No watermark
- No logo
- No signature
- Never render any drawer label as visible text
- Treat drawer label as metadata only, not an image element

OBJECT RULE:
Generate exactly one standalone cabinet shell containing exactly one sliding drawer.
Do not generate:
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

MECHANICS:
- Only the drawer moves
- The cabinet shell stays fixed
- The drawer slides straight outward on one axis
- No hinge motion
- No rotation
- No tilt
- No morphing between furniture types

CONSISTENCY:
- Same exact cabinet in all 5 frames
- Same exact camera angle in all 5 frames
- Same exact scale in all 5 frames
- Same exact centering in all 5 frames
- Same exact lighting in all 5 frames
- Same exact handle placement in all 5 frames
- Same exact keyhole placement in all 5 frames if present
- Same exact trim and decorative placement in all 5 frames
- No jitter
- No zoom drift
- No shape drift
- No hardware drift

CAMERA:
Use this fixed camera for all 5 frames:
${angle}

GEOMETRY:
Use these proportions as guidance for the cabinet front and drawer face:
- overall width units: ${d.boxWidth}
- overall height units: ${d.boxHeight}
- drawer face height units: ${d.drawerHeight}

The cabinet must still clearly read as a single-drawer cabinet. Do not let proportions cause multiple drawers or stacked compartments.

HARDWARE:
- handle style: ${d.handleStyle}
- corner style: ${d.cornerStyle}
- has rivets: ${d.hasRivets}
- has keyhole: ${d.hasKeyhole}

If has keyhole is false, do not show a keyhole unless explicitly required by decor.
If has rivets is true, keep rivets subtle, evenly placed, and fully inside the object silhouette.

SURFACE STYLE:
- material: ${material}
- style preset: ${stylePreset}
- decor items: ${decorItems}
- additional feature keywords: ${additionalFeatures}

Style rules:
- Style preset affects ornament language only
- Material affects surface appearance only
- Decor must not add extra compartments, extra drawers, props, or interior objects
- Decorative details must stay fully attached to the cabinet and drawer front
- Do not place any decorative element outside frame bounds

INTERIOR:
- Drawer interior must be completely empty
- No props
- No camera
- No cat
- No fabric
- No dust
- No debris
- No scratches
- No magical effects
- No extra objects of any kind

NO SHADOW RULE:
- No floor shadow
- No cast shadow
- No contact shadow
- No drop shadow
- No glow
- No halo
- No object outline stroke
- Use crisp clean edges only

FRAME STATE SEQUENCE:
${frameLines}

Interpret pullout as the linear outward travel of the same drawer. A larger percentage means the same drawer is pulled farther outward. Do not change furniture type between states.

NEGATIVE CONSTRAINTS:
Do not generate:
- text
- numbers
- labels
- multi-drawer furniture
- doors
- safes
- chests
- trunks
- lid boxes
- props
- animals
- cameras
- interior contents
- frame overlap
- cross-frame spill
- background shadows
- inconsistent proportions
- inconsistent hardware
- inconsistent object count

QUALITY PRIORITY:
1. Exact 5 equal frames
2. No text at all
3. No cross-frame overlap or spill
4. Exactly one drawer only
5. True sliding-drawer mechanics
6. Consistent geometry and hardware across all frames
7. No background shadows
8. Empty interior
9. Clean green background
10. Style fidelity`;
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
    return `Three-quarter view from the left side (approximately 45° from front-left)
- Slightly above eye-level
- Left side panel partially visible, front face dominant`;
  }
  if (angle === 'right-45') {
    return `Three-quarter view from the right side (approximately 45° from front-right)
- Slightly above eye-level
- Right side panel partially visible, front face dominant`;
  }
  return `Three-quarter front view from slightly above
- Front face dominant
- Slight downward perspective`;
}
