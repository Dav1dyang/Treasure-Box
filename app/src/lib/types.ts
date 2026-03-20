// ===== Box Dimensions =====

export interface BoxDimensions {
  boxWidth: number;         // total width in "units" (20-60)
  boxHeight: number;        // total body height (8-20)
  drawerHeight: number;     // drawer panel height (3-10)
  drawerPullout: Record<BoxState, number>; // 0-100% how far drawer extends
  handleStyle: 'knob' | 'pull-bar' | 'ring' | 'tab';
  cornerStyle: 'sharp' | 'rounded' | 'double';
  hasRivets: boolean;
  hasKeyhole: boolean;
}

export const DEFAULT_BOX_DIMENSIONS: BoxDimensions = {
  boxWidth: 44,
  boxHeight: 12,
  drawerHeight: 6,
  drawerPullout: {
    IDLE: 0,
    HOVER_PEEK: 25,
    OPEN: 100,
    HOVER_CLOSE: 75,
    CLOSING: 100,
    SLAMMING: 0,
  },
  handleStyle: 'pull-bar',
  cornerStyle: 'double',
  hasRivets: true,
  hasKeyhole: false,
};

// ===== Drawer AI Generation =====

export type BoxState = 'IDLE' | 'HOVER_PEEK' | 'OPEN' | 'HOVER_CLOSE' | 'CLOSING' | 'SLAMMING';

export type DrawerStylePreset = 'clay' | 'metal' | 'wood' | 'pixel' | 'paper' | 'glass';

export type DrawerMaterial =
  | 'wood' | 'metal' | 'ceramic' | 'stone' | 'glass' | 'fabric'
  | 'clay' | 'pixel' | 'paper' | 'watercolor' | 'neon';

export type DrawerAngle = 'front' | 'left-45' | 'right-45';

export interface DrawerStyle {
  preset: DrawerStylePreset;
  color: string;           // hex color e.g. "#8B4513"
  customPrompt?: string;   // optional user text appended to prompt
  // New fields — all optional for backward compat
  material?: DrawerMaterial;
  accentColor?: string;    // hex color for hardware/trim
  decor?: string;          // decoration description
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
  urls: Record<BoxState, string>;  // legacy: per-state URLs (old boxes)
  spriteUrl?: string;              // new: single sprite sheet URL
  style: DrawerStyle;
  generatedAt: number;
  activeArea?: SpriteActiveArea;   // tight bounding box of actual drawer content
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
  drawerDisplaySize?: { width: number; height: number }; // fixed pixel size for drawer frame (default 420×280)
  contentScale?: number;         // 0.5-2.0, scales drawer + items + physics (default 1.0)
}

export const DEFAULT_DRAWER_DISPLAY_SIZE = { width: 420, height: 280 };

export type SoundPreset = 'metallic' | 'wooden' | 'glass' | 'paper' | 'silent';

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
  width: number;              // drawer element width (px), computed from embedScale
  height: number;             // drawer element height (px), computed from embedScale
  position: EmbedPosition;    // overlay positioning
  domCollide?: boolean;       // optional: items collide with DOM elements
  previewUrl?: string;        // optional: user's website URL for preview background
  embedScale?: number;        // 0.5-2.0, proportionally controls widget size (default 1.0)
}

export const DEFAULT_EMBED_SETTINGS: EmbedSettings = {
  mode: 'overlay',
  width: 350,
  height: 300,
  position: {
    anchor: 'bottom-right',
    offsetX: 32,
    offsetY: 32,
  },
};
