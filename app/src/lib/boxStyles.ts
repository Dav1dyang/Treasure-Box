import type { DrawerStyle, DrawerStylePreset } from './types';
import { STYLE_PRESETS } from './config';

/**
 * Structured style definitions for each preset.
 * These slot into the proven Gemini sprite-sheet prompt template.
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
 * Parameter-driven template: every UI selection maps to a [PLACEHOLDER]
 * with interpretation rules so Gemini respects each choice.
 */
export function buildSpriteSheetPrompt(style: DrawerStyle): string {
  const def = STYLE_BASES[style.preset];

  // Resolve placeholder values
  const material = def.furnitureStyle;
  const primaryColor = style.color ? `${style.color} ${colorLabel(style.color)}` : def.mainColor;
  const accentColor = style.accentColor ? `${style.accentColor} ${colorLabel(style.accentColor)}` : 'warm brass';
  const styleTags = resolveStyleTags(style);
  const decorTags = resolveDecorTags(style);
  const additionalFeatures = style.customDecorText || 'none';
  const widthRatio = style.drawerWidth || 3;
  const heightRatio = style.drawerHeight || 2;
  const openingAngle = resolveAngle(style.angle || 'front');
  const handleType = def.handleStyle;
  const artStyle = def.artStyle;

  return `Create exactly ONE single sprite sheet image for a web creative project.

GOAL:
Generate a horizontal 5-frame animation sprite sheet of the SAME decorative furniture drawer progressively opening.
This must read clearly as a normal SLIDING DRAWER, not a tilt-out bin, not a hinged lid, not a flap door, and not a box opening upward.

OUTPUT FORMAT:
- Exactly 1 image
- Exactly 5 frames arranged side by side in a single horizontal row
- Overall image ratio must be exactly 5:1
- Example valid sizes: 2500×500 px, 2000×400 px, 1500×300 px
- Each frame must be exactly the same size (one-fifth of total width)
- Zero gaps, zero padding, zero borders, zero separators
- Frames must tile edge to edge with perfectly clean frame boundaries
- This sheet will be sliced programmatically, so alignment must be exact

BACKGROUND:
Completely flat pure white across the entire image.
- Exact color: Hex #FFFFFF / RGB (255, 255, 255)
- Absolutely uniform — no gradients, noise, texture, shadows, vignette, lighting changes, or edge discoloration
- White must extend to every edge of the image

IMPORTANT COLOR RULE:
- Do NOT use pure white (#FFFFFF) as a dominant color on the furniture body
- Ensure enough contrast between the furniture and the white background for clean separation

OUTLINE:
- No outline, border, or silhouette line around the furniture shape
- The furniture edges should blend naturally with no added stroke or glow

NO TEXT:
No text, labels, numbers, captions, frame markers, logo, watermark, or signature anywhere.

SUBJECT:
A refined single furniture drawer from an elegant cabinet, dresser, jewelry box, or apothecary cabinet. It should feel like crafted furniture.

DO NOT DEPICT: chest, crate, trunk, shipping box, toolbox, tilt-out bin, bread box, hinged lid box, flap door, drop-front desk.

═══════════════════════════════════════════
PARAMETERS — interpret each one carefully
═══════════════════════════════════════════

[MATERIAL]: ${material}
→ This defines the fundamental construction and surface treatment of the drawer.
→ Treat it as the primary visual identity — all surfaces, edges, and joins should match this material.

[PRIMARY_COLOR]: ${primaryColor}
→ The dominant color of the drawer body and front face.
→ If a hex code is provided, match it closely while maintaining the material's natural texture.
→ The material texture should show through the color (wood grain through stain, brush marks through paint, etc).

[ACCENT_COLOR]: ${accentColor}
→ Used for hardware, trim, handles, keyholes, corner brackets, and decorative metal elements.
→ Should contrast with the primary color for visual clarity.

[STYLE_TAGS]: ${styleTags}
→ Surface pattern and aesthetic treatment for the front drawer face.
→ If "plain" — use clean, smooth surfaces with no patterns.
→ If decorative tags given — carve, emboss, or inlay them into the front face as period-appropriate ornament.

[DECOR_TAGS]: ${decorTags}
→ Specific hardware and decorative elements to include on the drawer.
→ Each tag is a distinct visible element — render ALL of them, even if small.
→ "keyhole" = escutcheon plate with keyhole below the handle
→ "corner brackets" = decorative metal corner reinforcements on front face
→ "studs" = small round decorative rivets/nailheads along edges
→ "ring pull" = metal ring-pull handle (may replace default handle)
→ "hinges" = visible decorative hinge plates
→ "lock plate" = ornamental metal plate around keyhole
→ "inlay" = contrasting material inlay pattern (wood, metal, or mother-of-pearl)
→ "engravings" = fine line engravings etched into the surface
→ IMPORTANT: small decor items (studs, keyholes) must still be individually visible at final resolution.

[ADDITIONAL_FEATURES]: ${additionalFeatures}
→ Free-form user request for additional features or styles.
→ If "none" — ignore this field.
→ If text is given — treat these as the user's most important creative request. Render them prominently.
→ Additional features should integrate naturally with the material and style, not look pasted on.

[DRAWER_SHAPE]: ${widthRatio}:${heightRatio} (width:height)
→ This is the proportions of the DRAWER OBJECT itself, NOT the frame size.
→ The drawer front face should be drawn with approximately ${widthRatio}:${heightRatio} proportions.
→ ${widthRatio > heightRatio ? 'The drawer is wider than tall — a wide, flat shape.' : widthRatio < heightRatio ? 'The drawer is taller than wide — a tall, narrow shape.' : 'The drawer is roughly square.'}
→ The frame size stays fixed (square-ish) — the drawer shape sits inside each frame with white background around it.

[OPENING_ANGLE]: ${openingAngle}

[HANDLE_TYPE]: ${handleType}
→ The primary handle on the front face center.
→ Rendered in the accent color material.

[ART_STYLE]: ${artStyle}
→ The overall rendering style for the entire image.
→ All elements (material, decor, hardware) should be rendered consistently in this style.

═══════════════════════════════════════════
CORE DESIGN
═══════════════════════════════════════════

The object consists of two visible parts:

1. FRONT DRAWER FACE — the decorative front panel, always visible in all 5 frames.
   - Rectangular, approximately ${widthRatio}:${heightRatio} ratio
   - Fine decorative border or beveled molding
   - Centered [HANDLE_TYPE] handle in [ACCENT_COLOR]
   - All [DECOR_TAGS] and [ADDITIONAL_FEATURES] elements rendered here
   - Must remain PIXEL-IDENTICAL in all 5 frames (same size, position, handle, details, lighting)

2. SLIDING DRAWER TRAY — the drawer body behind the front face, visible only when open.
   - Reads as a true sliding drawer moving straight outward toward the viewer
   - NOT a lid rotating upward, NOT a tilted container
   - Visible above the front face due to foreshortening
   - Shallow and believable proportions (modest side walls)
   - Interior always completely empty — no contents of any kind

CAMERA:
${openingAngle}
The furniture must remain locked in the same position in every frame. No jitter, drifting, scaling, or perspective changes.

FRAME SEQUENCE (left to right):
1. CLOSED — fully shut, front face flush, no visible tray or gap
2. 25% OPEN — small visible extension, shallow tray above front face
3. 50% OPEN — medium extension, tray clearly visible, interior readable
4. 75% OPEN — large extension, clearly more open than frame 3
5. 100% OPEN — maximum extension, most dramatic, empty interior fully visible

CONSISTENCY RULES:
- Front drawer face pixel-identical across all 5 frames (only tray extension changes)
- Same material, design language, and lighting in all states
- Object centered in same position every frame
- Lighting and shadow direction constant

QUALITY PRIORITY (if any instruction conflicts):
1. Exactly 5 equal frames in one horizontal strip
2. Exact flat #FFFFFF background
3. No text
4. Front drawer face pixel-identical across all frames
5. Drawer reads as true sliding drawer
6. Clear progression: closed → 25% → 50% → 75% → 100%
7. No outline or border around furniture silhouette
8. All [DECOR_TAGS] and [ADDITIONAL_FEATURES] visible
9. Style and decorative detail`;
}

/** Map hex color to a human-readable hint for the prompt */
function colorLabel(hex: string): string {
  const labels: Record<string, string> = {
    '#8B4513': 'rich brown wood tones',
    '#C0C0C0': 'silver metallic',
    '#3E2723': 'deep dark walnut',
    '#B71C1C': 'deep crimson red',
    '#1565C0': 'royal blue',
    '#FFB300': 'warm gold',
    '#212121': 'matte black',
    '#F5F5F5': 'off-white ivory',
    '#B08D57': 'warm brass',
    '#333333': 'dark iron',
    '#B87333': 'antique copper',
    '#DDD': 'polished chrome',
  };
  return labels[hex] || 'tones';
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
- Eye-level
- Left side panel partially visible, front face dominant
- Consistent camera angle across all 5 frames
- No camera movement, zoom, or rotation between frames`;
  }
  if (angle === 'right-45') {
    return `Three-quarter view from the right side (approximately 45° from front-right)
- Eye-level
- Right side panel partially visible, front face dominant
- Consistent camera angle across all 5 frames
- No camera movement, zoom, or rotation between frames`;
  }
  return `Dead-center front view
- Eye-level, straight-on
- No camera movement, zoom, perspective shift, rotation, or tilt
- Do not show top, left, or right exterior surfaces of the outer cabinet`;
}
