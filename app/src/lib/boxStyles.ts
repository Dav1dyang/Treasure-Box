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
 * Accepts the new extended DrawerStyle fields (material, accentColor,
 * decor, size ratio, camera angle) and slots them into the proven
 * prompt structure without breaking existing generation quality.
 */
export function buildSpriteSheetPrompt(style: DrawerStyle): string {
  const def = STYLE_BASES[style.preset];

  // Material override — if set, override preset surface/hardware/art hints
  const mat = style.material ? MATERIALS[style.material] : null;

  const mainColor = style.color
    ? `${style.color} tones`
    : def.mainColor;

  const surface = mat ? mat.surface : def.mainColor;
  const hardware = mat ? mat.hardware : def.hardware;
  const handleStyle = def.handleStyle;
  const artStyle = mat ? `${def.artStyle}, rendered with ${mat.artHint}` : def.artStyle;

  // Accent color for hardware/trim
  const accentHint = style.accentColor
    ? `\n- Hardware and trim accent color: ${style.accentColor} tones`
    : '';

  // Decor description
  const decorHint = style.decor
    ? `\n- Surface decoration: ${style.decor}`
    : '';

  // Custom prompt
  const custom = style.customPrompt ? `\nAdditional details: ${style.customPrompt}.` : '';

  // Size ratio — adjusts the drawer face proportions description
  const w = style.drawerWidth || 3;
  const h = style.drawerHeight || 2;
  const ratioDesc = w > h
    ? `wider than tall, about ${w}:${h} ratio`
    : w < h
    ? `taller than wide, about ${w}:${h} ratio`
    : `roughly square, about 1:1 ratio`;

  // Camera angle
  const angle = style.angle || 'front';
  let cameraDesc: string;
  if (angle === 'left-45') {
    cameraDesc = `- Three-quarter view from the left side (approximately 45 degrees from front-left)
- Eye-level
- The left side panel of the cabinet should be partially visible
- The front face is still the dominant visible surface
- Consistent camera angle across all 5 frames
- No camera movement, zoom, or rotation between frames`;
  } else if (angle === 'right-45') {
    cameraDesc = `- Three-quarter view from the right side (approximately 45 degrees from front-right)
- Eye-level
- The right side panel of the cabinet should be partially visible
- The front face is still the dominant visible surface
- Consistent camera angle across all 5 frames
- No camera movement, zoom, or rotation between frames`;
  } else {
    cameraDesc = `- Dead-center front view
- Eye-level
- Straight-on
- No camera movement
- No zoom change
- No perspective shift
- No rotation
- No tilt
- Do not show the top exterior surface of the outer cabinet
- Do not show the left exterior side
- Do not show the right exterior side`;
  }

  return `Create exactly ONE single sprite sheet image for a web creative project.

GOAL:
Generate a horizontal 5-frame animation sprite sheet of the SAME decorative furniture drawer progressively opening.
This must read clearly as a normal SLIDING DRAWER, not a tilt-out bin, not a hinged lid, not a flap door, and not a box opening upward.

OUTPUT FORMAT:
- Exactly 1 image
- Exactly 5 frames
- Frames arranged side by side in a single horizontal row
- Overall image ratio must be exactly 5:1
- Example valid sizes: 2500x500 px, 2000x400 px, 1500x300 px
- Each frame must be exactly the same size
- Each frame must occupy exactly one-fifth of the total image width
- Zero gaps
- Zero padding
- Zero borders
- Zero separators
- Frames must tile edge to edge with perfectly clean frame boundaries
- This sheet will be sliced programmatically, so alignment must be exact

BACKGROUND:
Use a completely flat chroma key green background across the entire image.
Required exact background color:
- Hex #00FF00
- RGB 0,255,0
Background rules:
- Absolutely uniform green
- No gradients
- No noise
- No texture
- No shadows on the background
- No vignette
- No lighting changes
- No edge discoloration
- Green must extend to every edge of the image

IMPORTANT COLOR RULE:
- Do not use green on the furniture at all
- Do not use #00FF00 or similar bright greens anywhere on the drawer, tray, hardware, highlights, or ornament
- Avoid green reflections or green-tinted shading

OUTLINE:
Add a thin clean white silhouette outline around the entire furniture shape in every frame.
- Outline width about 1 to 2 pixels
- Keep the outline consistent across all frames
- The outline should cleanly separate the object from the green background

NO TEXT:
- No text anywhere
- No labels
- No numbers
- No captions
- No frame markers
- No logo
- No watermark
- No signature

SUBJECT:
A refined single furniture drawer from an elegant cabinet, dresser, jewelry box, or apothecary cabinet.
It should feel like crafted furniture.

DO NOT DEPICT:
- chest
- crate
- trunk
- shipping box
- toolbox
- tilt-out bin
- bread box
- hinged lid box
- flap door
- drop-front desk

CORE DESIGN:
The object consists of two visible parts:

1. FRONT DRAWER FACE
This is the decorative front panel of the drawer.
It is always visible in all 5 frames.
Requirements:
- Viewed from the specified camera angle
- Rectangular
- ${ratioDesc}
- Fine decorative border or beveled molding
- Centered handle
- Optional subtle keyhole or ornamental carving
- Must remain pixel-identical in all 5 frames
- Same exact size
- Same exact position
- Same exact handle placement
- Same exact decorative details
- Same exact lighting and rendering

2. SLIDING DRAWER TRAY
This is the drawer body behind the front face.
It only becomes visible when the drawer is pulled outward.
Critical behavior:
- It must read as a true sliding drawer moving straight outward toward the viewer
- It must NOT read as a lid rotating upward
- It must NOT read as a tilted container
- It must NOT read as the whole cabinet opening
Tray appearance:
- When open, the tray becomes visible above the front face because of foreshortening from a straight-on view
- The visible tray should be relatively shallow and believable
- The tray side walls should be modest, not exaggerated
- The opening above the front panel should not become extremely tall
- The tray interior bottom may become visible when more open
- The interior must always be completely empty
- No contents of any kind

CAMERA:
Use the exact same camera in every frame.
${cameraDesc}

IMPORTANT VISUAL RULE:
The furniture must remain locked in the same position in every frame.
No jitter, no drifting, no scaling changes, no perspective changes.

FRAME SEQUENCE:
Show exactly these 5 frames from left to right:

FRAME 1: CLOSED
- Drawer fully shut
- Front face flush
- No visible tray
- No visible opening gap

FRAME 2: 25% OPEN
- Small but clearly visible extension
- A shallow section of tray visible above the front face
- Must read as the first stage of opening

FRAME 3: 50% OPEN
- Medium extension
- Tray clearly visible
- Interior begins to read more clearly

FRAME 4: 75% OPEN
- Large extension
- Clearly more open than frame 3
- Empty interior more visible

FRAME 5: 100% OPEN
- Maximum extension
- Most dramatic frame
- Empty tray interior visible most clearly
- Still must read as a sliding drawer, not a hinged lid
- Keep proportions believable and not too tall

CONSISTENCY RULES:
- The front drawer face must be pixel-identical across all 5 frames
- Only the tray extension changes
- The tray must keep the same material, same design language, and same lighting in all open states
- The entire object must stay centered in the same place in every frame
- Lighting direction must not change
- Shadow style must not change
- Material rendering must not change

STYLE:
- Furniture style: ${def.furnitureStyle}
- Main color: ${mainColor}
- Surface material: ${surface}
- Hardware: ${hardware}
- Handle style: ${handleStyle}
- Art style: ${artStyle}${accentHint}${decorHint}${custom}
- The overall feel should be a refined piece of furniture, not a rough container

QUALITY PRIORITY ORDER:
If any instruction conflicts, prioritize in this order:
1. Exactly 5 equal frames in one horizontal strip
2. Exact flat #00FF00 background
3. No text
4. Front drawer face remains pixel-identical across all frames
5. Drawer reads as a true sliding drawer, not a hinged or tilt-out object
6. Frame progression clearly reads closed, 25%, 50%, 75%, 100%
7. White outline around the furniture silhouette
8. Style and decorative detail

FINAL CHECK BEFORE OUTPUT:
- Exactly 1 image
- Exactly 5 frames
- Single horizontal row
- Exact 5:1 ratio
- Exact #00FF00 background
- No text
- No green on furniture
- Thin white silhouette outline
- Frame 1 fully closed
- Frame 2 25% open
- Frame 3 50% open
- Frame 4 75% open
- Frame 5 100% open
- Front drawer face identical in every frame
- Tray interior empty
- Drawer reads as sliding furniture, not a hinged opening`;
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
