/**
 * Treasure Box — Centralized Configuration
 *
 * All default values, preset arrays, and tunable constants live here.
 * Edit this file to adjust defaults without touching component logic.
 *
 * ─── Image Processing ──────────────────────────────────────────
 * Drawer generation : server-side Gemini API → green-background
 *                     removal via client-side ML + Sharp chroma key fallback
 * Item images       : client-side WASM background removal
 *                     (@imgly/background-removal, model isnet_quint8)
 * ────────────────────────────────────────────────────────────────
 */

import type {
  BoxConfig,
  BoxDimensions,
  BoxState,
  DrawerStylePreset,
  EmbedSettings,
  SoundPreset,
  HandleStyle,
  CornerStyle,
} from './types';

// ═══════════════════════════════════════════════════════════════
// BOX DEFAULTS
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_BOX_CONFIG: Omit<BoxConfig, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> = {
  title: 'My Treasure Box',
  backgroundColor: 'transparent',
  drawerLabel: 'TREASURE BOX',
  maxItems: 15,
  soundEnabled: true,
  soundVolume: 0.3,
  soundPreset: 'metallic',
  isPublic: false,
  contentScale: 1.0,
};

export const DEFAULT_BOX_DIMENSIONS: BoxDimensions = {
  boxWidth: 44,
  boxHeight: 12,
  drawerHeight: 6,
  drawerPullout: {
    IDLE: 0,
    HOVER_PEEK: 25,
    OPEN: 100,
    HOVER_CLOSE: 75,
    CLOSING: 50,
    SLAMMING: 0,
  } as Record<BoxState, number>,
  handleStyle: 'pull-bar',
  cornerStyle: 'double',
  hasRivets: true,
  hasKeyhole: false,
};

export const DEFAULT_DRAWER_DISPLAY_SIZE = { width: 420, height: 420 };

// ═══════════════════════════════════════════════════════════════
// EMBED DEFAULTS
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_EMBED_SETTINGS: EmbedSettings = {
  position: {
    anchor: 'bottom-right',
    offsetX: 32,
    offsetY: 32,
  },
};

// ═══════════════════════════════════════════════════════════════
// DRAWER STYLE — EDITABLE ARRAYS
// ═══════════════════════════════════════════════════════════════

/** The 6 drawer material presets shown in the style picker. */
export const PRESET_MATERIALS: { id: DrawerStylePreset; label: string }[] = [
  { id: 'clay', label: 'clay' },
  { id: 'metal', label: 'metal' },
  { id: 'wood', label: 'wood' },
  { id: 'pixel', label: 'pixel' },
  { id: 'paper', label: 'paper' },
  { id: 'glass', label: 'glass' },
];

/** Surface pattern / aesthetic options for the drawer front face. */
export const STYLE_PRESETS = [
  { id: 'mid-century-modern', label: 'Mid-Century Modern' },
  { id: 'victorian-ornate', label: 'Victorian Ornate' },
  { id: 'art-deco-glam', label: 'Art Deco Glam' },
  { id: 'rustic-farmhouse', label: 'Rustic Farmhouse' },
  { id: 'modern-minimal', label: 'Modern Minimal' },
] as const;

/** Hardware & decorative elements (multi-select). */
export const DECOR_ITEMS = [
  { id: 'old-keyhole', label: 'Old Keyhole' },
  { id: 'corner-caps', label: 'Corner Caps' },
  { id: 'metal-studs', label: 'Metal Studs' },
  { id: 'ring-pull', label: 'Ring Pull' },
  { id: 'engraved-trim', label: 'Engraved Trim' },
] as const;


// ═══════════════════════════════════════════════════════════════
// SOUND DEFAULTS
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_SOUND_VOLUME = 0.3;
export const DEFAULT_SOUND_PRESET: SoundPreset = 'metallic';

/** Auto-match sound preset to drawer material. */
export const MATERIAL_SOUND_MAP: Record<DrawerStylePreset, SoundPreset> = {
  clay: 'clay',
  metal: 'metallic',
  wood: 'wooden',
  pixel: 'pixel',
  paper: 'paper',
  glass: 'glass',
};
export const SOUND_MIN_INTERVAL_MS = 50;
export const COLLISION_VELOCITY_THRESHOLD = 0.5;

// ═══════════════════════════════════════════════════════════════
// PHYSICS & IMAGE PROCESSING DEFAULTS
// ═══════════════════════════════════════════════════════════════

export const CONTOUR_SAMPLE_POINTS = 12;
export const CONTOUR_ALPHA_THRESHOLD = 30;

// ═══════════════════════════════════════════════════════════════
// EDITOR DEFAULTS
// ═══════════════════════════════════════════════════════════════

export const AUTOSAVE_DEBOUNCE_MS = 1500;

// ═══════════════════════════════════════════════════════════════
// ADDITIONAL FEATURES INPUT LIMITS
// ═══════════════════════════════════════════════════════════════

export const ADDITIONAL_FEATURES_MAX_KEYWORDS = 3;
export const ADDITIONAL_FEATURES_MAX_CHAR_PER_KEYWORD = 20;
export const ADDITIONAL_FEATURES_INPUT_MAX_LENGTH = 60;

// ═══════════════════════════════════════════════════════════════
// SPRITE SHEET STATE MAPPING
// ═══════════════════════════════════════════════════════════════

/** Default frame open percentages for the 5-frame sprite sheet. */
export const DEFAULT_STATES = [0, 25, 50, 75, 100] as const;

/** Maps runtime BoxState → visual open percentage for sprite frame reuse. */
export const VISUAL_STATE_MAP: Record<BoxState, number> = {
  IDLE: 0,
  HOVER_PEEK: 25,
  CLOSING: 50,
  HOVER_CLOSE: 75,
  OPEN: 100,
  SLAMMING: 0,
} as const;

/** Config keys that must never be injected into the generation prompt. */
export const NON_VISUAL_CONFIG_KEYS = [
  'drawerLabel',
  'backgroundColor',
  'soundEnabled',
  'soundVolume',
  'soundPreset',
  'maxItems',
  'contentScale',
  'embed',
  'isPublic',
] as const;

// ═══════════════════════════════════════════════════════════════
// HANDLE & CORNER STYLE OPTIONS (for UI)
// ═══════════════════════════════════════════════════════════════

export const HANDLE_STYLES: { id: HandleStyle; label: string }[] = [
  { id: 'round-knob', label: 'round knob' },
  { id: 'pull-bar', label: 'pull bar' },
  { id: 'ring-pull', label: 'ring pull' },
  { id: 'half-moon', label: 'half moon' },
  { id: 'slot-pull', label: 'slot pull' },
  { id: 'none', label: 'none' },
];

export const CORNER_STYLES: { id: CornerStyle; label: string }[] = [
  { id: 'rounded', label: 'rounded' },
  { id: 'square', label: 'square' },
  { id: 'beveled', label: 'beveled' },
  { id: 'double', label: 'double' },
  { id: 'reinforced', label: 'reinforced' },
];
