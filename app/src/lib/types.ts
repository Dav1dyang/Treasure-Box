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
    CLOSING: 30,
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
  scale?: number;            // size multiplier (0.5-2.0), default 1
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
}

export type SoundPreset = 'metallic' | 'wooden' | 'glass' | 'paper' | 'silent';

// ===== Embed Settings =====

export type EmbedMode = 'contained' | 'floating' | 'fullpage';

export type AnchorCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface EmbedPosition {
  anchor: AnchorCorner;
  xPercent: number;  // 0-100, offset percentage from anchor corner
  yPercent: number;  // 0-100, offset percentage from anchor corner
}

export interface EmbedSettings {
  mode: EmbedMode;
  width: number;           // pixels (contained/floating)
  height: number;          // pixels (contained/floating)
  position: EmbedPosition; // floating + fullpage pin position
  previewUrl?: string;     // user's website URL for full-page preview
}

export const DEFAULT_EMBED_SETTINGS: EmbedSettings = {
  mode: 'contained',
  width: 500,
  height: 500,
  position: {
    anchor: 'bottom-right',
    xPercent: 5,
    yPercent: 5,
  },
};
