/**
 * Treasure Box — Centralized Configuration
 *
 * All default values, preset arrays, and tunable constants live here.
 * Edit this file to adjust defaults without touching component logic.
 *
 * ─── Image Processing ──────────────────────────────────────────
 * Drawer generation : server-side Gemini API → white-background
 *                     removal via Sharp + Google Vision API
 * Item images       : client-side WASM background removal
 *                     (@imgly/background-removal, model isnet_quint8)
 * ────────────────────────────────────────────────────────────────
 */

import type {
  BoxConfig,
  BoxDimensions,
  BoxState,
  DrawerAngle,
  DrawerStylePreset,
  EmbedPadding,
  EmbedSettings,
  SoundPreset,
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
  itemBrightness: 1.0,
  itemContrast: 1.0,
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

export const DEFAULT_EMBED_PADDING: EmbedPadding = {
  top: 16,
  right: 16,
  bottom: 8,
  left: 16,
};

export const EMBED_BASE_W = 350;
export const EMBED_BASE_H = 300;

export function getEmbedDimensions(scale: number) {
  return {
    width: Math.round(EMBED_BASE_W * scale),
    height: Math.round(EMBED_BASE_H * scale),
  };
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
  { id: 'plain', label: 'Plain / Smooth' },
  { id: 'floral', label: 'Floral Carving' },
  { id: 'geometric', label: 'Geometric Pattern' },
  { id: 'vintage', label: 'Vintage Ornate' },
  { id: 'modern', label: 'Modern Minimal' },
] as const;

/** Hardware & decorative elements (multi-select). */
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

/** Camera angle options for drawer generation. */
export const ANGLE_OPTIONS: { id: DrawerAngle; label: string; icon: string }[] = [
  { id: 'front', label: 'Front', icon: '▣' },
  { id: 'left-45', label: '45° Left', icon: '◧' },
  { id: 'right-45', label: '45° Right', icon: '◨' },
];

// ═══════════════════════════════════════════════════════════════
// SOUND DEFAULTS
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_SOUND_VOLUME = 0.3;
export const DEFAULT_SOUND_PRESET: SoundPreset = 'metallic';
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
