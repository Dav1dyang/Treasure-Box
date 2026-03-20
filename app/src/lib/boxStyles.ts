import type { DrawerStyle, DrawerStylePreset, DrawerMaterial } from './types';

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
 * Material definitions — maps material ID to descriptive strings
 * for the prompt template. Merged with preset as a modifier.
 */
interface MaterialDefinition {
  label: string;
  surface: string;    // describes the material surface/texture
  hardware: string;   // what hardware looks like in this material
  artHint: string;    // art style hint
}

export const MATERIALS: Record<DrawerMaterial, MaterialDefinition> = {
  wood: {
    label: 'Wood',
    surface: 'polished wood grain with warm lacquer finish',
    hardware: 'warm brass fittings',
    artHint: 'hand-painted woodwork illustration',
  },
  metal: {
    label: 'Metal',
    surface: 'brushed metal with subtle reflections',
    hardware: 'industrial steel with rivets',
    artHint: 'detailed metalwork rendering with weathering',
  },
  ceramic: {
    label: 'Ceramic',
    surface: 'smooth glazed ceramic with subtle sheen',
    hardware: 'delicate porcelain with painted details',
    artHint: 'fine ceramic illustration with clean glaze reflections',
  },
  stone: {
    label: 'Stone',
    surface: 'carved stone with natural grain and subtle moss',
    hardware: 'rough-hewn stone with iron reinforcement',
    artHint: 'stone carving illustration with natural texture',
  },
  glass: {
    label: 'Glass',
    surface: 'translucent glass with soft refractions and iridescent edges',
    hardware: 'frosted glass with subtle shimmer',
    artHint: 'ethereal glasswork with soft light and translucency',
  },
  fabric: {
    label: 'Fabric / Leather',
    surface: 'rich textured fabric or leather with visible stitching',
    hardware: 'leather straps with brass buckles',
    artHint: 'textile illustration with visible weave and stitch detail',
  },
  clay: {
    label: 'Clay',
    surface: 'soft warm clay with visible fingerprint textures',
    hardware: 'clay with rounded sculpted shapes',
    artHint: 'claymation stop-motion style with soft rounded forms',
  },
  pixel: {
    label: 'Pixel Art',
    surface: 'crisp pixel blocks with limited color palette',
    hardware: 'pixel-styled with crisp edges',
    artHint: '16-bit pixel art with crisp edges and no anti-aliasing',
  },
  paper: {
    label: 'Paper / Origami',
    surface: 'cream and kraft paper with visible fold lines',
    hardware: 'folded paper with sharp creases',
    artHint: 'papercraft illustration with visible creases and layered depth',
  },
  watercolor: {
    label: 'Watercolor',
    surface: 'soft watercolor wash with visible brush strokes and pigment blooms',
    hardware: 'painted with loose watercolor brush strokes',
    artHint: 'watercolor painting style with soft edges and visible paper texture',
  },
  neon: {
    label: 'Neon / Cyberpunk',
    surface: 'dark matte surface with bright neon edge lighting and glow effects',
    hardware: 'glowing neon strips and LED accents',
    artHint: 'cyberpunk neon illustration with dark base and vivid glow effects',
  },
};

/**
 * Style presets — surface patterns / aesthetics (was "decor presets").
 */
export const STYLE_PRESETS = [
  { id: 'plain', label: 'Plain / Smooth' },
  { id: 'floral', label: 'Floral Carving' },
  { id: 'geometric', label: 'Geometric Pattern' },
  { id: 'vintage', label: 'Vintage Ornate' },
  { id: 'modern', label: 'Modern Minimal' },
] as const;

/**
 * Decor items — hardware & decorative elements (multi-select).
 */
export const DECOR_ITEMS = [
  { id: 'keyhole', label: 'Keyhole' },
  { id: 'corner-brackets', label: 'Corner Brackets' },
  { id: 'studs', label: 'Studs' },
  { id: 'ring-pull', label: 'Ring Pull' },
  { id: 'hinges', label: 'Hinges' },
  { id: 'lock-plate', label: 'Lock Plate' },
  { id: 'inlay', label: 'Inlay' },
  { id: 'engravings', label: 'Engravings' },
] as const;

/**
 * Build a single sprite-sheet prompt — all 5 states in one image.
 *
 * Parameter-driven template: every UI selection maps to a [PLACEHOLDER]
 * with interpretation rules so Gemini respects each choice.
 */
export function buildSpriteSheetPrompt(style: DrawerStyle): string {
  const def = STYLE_BASES[style.preset];
  const mat = style.material ? MATERIALS[style.material] : null;

  // Resolve placeholder values
  const material = mat ? `${def.furnitureStyle} rendered in ${mat.label} (${mat.surface})` : def.furnitureStyle;
  const primaryColor = style.color ? `${style.color} ${colorLabel(style.color)}` : def.mainColor;
  const accentColor = style.accentColor ? `${style.accentColor} ${colorLabel(style.accentColor)}` : 'warm brass';
  const styleTags = resolveStyleTags(style);
  const decorTags = resolveDecorTags(style);
  const customDecor = style.customPrompt || 'none';
  const widthRatio = style.drawerWidth || 3;
  const heightRatio = style.drawerHeight || 2;
  const openingAngle = resolveAngle(style.angle || 'front');
  const handleType = def.handleStyle;
  const artStyle = mat ? `${def.artStyle}, rendered with ${mat.artHint}` : def.artStyle;

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
Completely flat chroma key green across the entire image.
- Exact color: Hex #00FF00 / RGB (0, 255, 0)
- Absolutely uniform — no gradients, noise, texture, shadows, vignette, lighting changes, or edge discoloration
- Green must extend to every edge of the image

IMPORTANT COLOR RULE:
- Do NOT use green on the furniture at all
- Do NOT use #00FF00 or similar bright greens anywhere on the drawer, tray, hardware, highlights, or ornament
- Avoid green reflections or green-tinted shading

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

[CUSTOM_DECOR]: ${customDecor}
→ Free-form user request for additional decorative elements.
→ If "none" — ignore this field.
→ If text is given — treat these as the user's most important creative request. Render them prominently.
→ Custom decor should integrate naturally with the material and style, not look pasted on.

[DRAWER_SHAPE]: ${widthRatio}:${heightRatio} (width:height)
→ This is the proportions of the DRAWER OBJECT itself, NOT the frame size.
→ The drawer front face should be drawn with approximately ${widthRatio}:${heightRatio} proportions.
→ ${widthRatio > heightRatio ? 'The drawer is wider than tall — a wide, flat shape.' : widthRatio < heightRatio ? 'The drawer is taller than wide — a tall, narrow shape.' : 'The drawer is roughly square.'}
→ The frame size stays fixed (square-ish) — the drawer shape sits inside each frame with green background around it.

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
   - All [DECOR_TAGS] and [CUSTOM_DECOR] elements rendered here
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
2. Exact flat #00FF00 background
3. No text
4. Front drawer face pixel-identical across all frames
5. Drawer reads as true sliding drawer
6. Clear progression: closed → 25% → 50% → 75% → 100%
7. No outline or border around furniture silhouette
8. All [DECOR_TAGS] and [CUSTOM_DECOR] visible
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
  // customPrompt is used for style pattern label from STYLE_PRESETS
  if (style.customPrompt) return style.customPrompt;
  return 'plain';
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

/**
 * Color presets for the style picker UI.
 */
export const COLOR_PRESETS = [
  { label: 'brown', value: '#8B4513' },
  { label: 'silver', value: '#C0C0C0' },
  { label: 'dark wood', value: '#3E2723' },
  { label: 'red', value: '#B71C1C' },
  { label: 'blue', value: '#1565C0' },
  { label: 'gold', value: '#FFB300' },
  { label: 'black', value: '#212121' },
  { label: 'white', value: '#F5F5F5' },
];
