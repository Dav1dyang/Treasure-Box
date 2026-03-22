// ===== Box Dimensions =====

export type HandleStyle = 'round-knob' | 'pull-bar' | 'ring-pull' | 'half-moon' | 'slot-pull' | 'none';
export type CornerStyle = 'rounded' | 'square' | 'beveled' | 'double' | 'reinforced';

export interface BoxDimensions {
  boxWidth: number;         // total width in "units" (20-60)
  boxHeight: number;        // total body height (8-20)
  drawerHeight: number;     // drawer panel height (3-10)
  drawerPullout: Record<BoxState, number>; // 0-100% how far drawer extends
  handleStyle: HandleStyle;
  cornerStyle: CornerStyle;
  hasRivets: boolean;
  hasKeyhole: boolean;
}

/** Geometry tokens for prompt generation — proportions only, not structure. */
export interface GeometryTokens {
  BOX_WIDTH: number;
  BOX_HEIGHT: number;
  DRAWER_HEIGHT: number;
}

// ===== Drawer AI Generation =====

export type BoxState = 'IDLE' | 'HOVER_PEEK' | 'OPEN' | 'HOVER_CLOSE' | 'CLOSING' | 'SLAMMING';

export type DrawerStylePreset = 'clay' | 'metal' | 'wood' | 'pixel' | 'paper' | 'glass';

export type DrawerAngle = 'front' | 'left-45' | 'right-45';

export interface DrawerStyle {
  preset: DrawerStylePreset;
  color: string;           // hex color e.g. "#8B4513"
  /** @deprecated Use stylePattern + customDecorText instead. Kept for backward compat with old Firestore docs. */
  customPrompt?: string;
  stylePattern?: string;      // STYLE_PRESETS id: 'mid-century-modern', 'victorian-ornate', 'art-deco-glam', 'rustic-farmhouse', 'modern-minimal'
  customDecorText?: string;   // user's free-text decor keywords (persisted for round-trip)
  accentColor?: string;    // hex color for hardware/trim
  decor?: string;          // decoration description (combined toggle pills + custom text)
  drawerWidth?: number;    // ratio width 1-5 (default 3)
  drawerHeight?: number;   // ratio height 1-5 (default 2)
  angle?: DrawerAngle;     // camera angle
}

/** Normalized bounding box of non-transparent pixels (0-1 within each frame) */
export interface SpriteActiveArea {
  x: number;       // left offset (0-1)
  y: number;       // top offset (0-1)
  width: number;   // content width (0-1)
  height: number;  // content height (0-1)
}

export interface DrawerImages {
  /** @legacy Per-state URLs from old boxes. New boxes use spriteUrl. Kept for reading old Firestore documents. */
  urls: Record<BoxState, string>;
  spriteUrl?: string;              // single sprite sheet URL
  style: DrawerStyle;
  generatedAt: number;
  activeArea?: SpriteActiveArea;   // tight bounding box of actual drawer content
  debugPrompt?: string;            // Gemini prompt used for generation (debug)
}

// ===== Items =====

export interface TreasureItem {
  id: string;
  imageUrl: string;          // URL to the uploaded image (bg removed)
  originalImageUrl: string;  // URL to the original upload
  label: string;
  story?: string;
  link?: string;
  order: number;
  rotation?: number;         // initial rotation in degrees (-25 to 25), default random
  scale?: number;            // size multiplier (0.5-3.0), default 1
  // Contour points for irregular physics shape (normalized 0-1)
  contourPoints?: { x: number; y: number }[];
  createdAt: number;
}

export interface BoxConfig {
  id: string;
  ownerId: string;
  title: string;
  backgroundColor: string;
  drawerLabel: string;
  maxItems: number;
  soundEnabled: boolean;
  soundVolume: number;        // 0-1
  soundPreset: SoundPreset;
  isPublic: boolean;          // show in public gallery on landing page
  ownerName?: string;         // optional display name shown on box
  createdAt: number;
  updatedAt: number;
  drawerImages?: DrawerImages;  // undefined = use ASCII fallback
  boxDimensions?: BoxDimensions; // custom box shape/proportions
  embedSettings?: EmbedSettings; // embed configuration (mode, size, position)
  itemCount?: number;            // cached count of items in the box
  drawerDisplaySize?: { width: number; height: number }; // fixed pixel size for drawer frame (default 420×420)
  contentScale?: number;         // 0.5-2.0, scales drawer + items + physics (default 1.0)
  itemBrightness?: number;       // 0.5-1.5, default 1.0
  itemContrast?: number;         // 0.5-1.5, default 1.0
  itemTint?: string;             // hex color e.g. "#ff0000", undefined = no tint
}

export type SoundPreset = 'metallic' | 'wooden' | 'glass' | 'paper' | 'pixel' | 'clay' | 'silent';

// ===== Embed Padding =====

export interface EmbedPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// ===== Embed Settings =====

export type EmbedMode = 'overlay' | 'contained';

export type AnchorCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface EmbedPosition {
  anchor: AnchorCorner;       // nearest corner (auto-calculated from drag)
  offsetX: number;            // px from anchor corner's X edge
  offsetY: number;            // px from anchor corner's Y edge
}

export interface EmbedSettings {
  mode: EmbedMode;
  width: number;              // drawer element width (px), derived from contentScale
  height: number;             // drawer element height (px), derived from contentScale
  position: EmbedPosition;    // overlay positioning
  domCollide?: boolean;       // optional: items collide with DOM elements
  previewUrl?: string;        // optional: user's website URL for preview background
  previewImageUrl?: string;   // optional: Firebase Storage URL for uploaded screenshot
  previewMode?: 'url' | 'screenshot'; // which preview source is active
  padding?: EmbedPadding;     // contained mode: CSS inset padding around active area
}

// ===== Frame Sync (postMessage position streaming) =====

export interface FrameSyncBody {
  id: string;
  x: number;
  y: number;
  angle: number;
  width: number;
  height: number;
  imageUrl: string;
  scale: number;
  opacity: number;
  link?: string;
  label?: string;
  story?: string;
}

export interface HostViewport {
  width: number;
  height: number;
  /** Offset of the iframe/container from the host viewport origin */
  offsetX: number;
  offsetY: number;
}
