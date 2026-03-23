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
} from './types';

// ═══════════════════════════════════════════════════════════════
// BOX DEFAULTS
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_BOX_CONFIG: Omit<BoxConfig, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> = {
  title: 'My Treasure Box',
  backgroundColor: 'transparent',
  drawerLabel: 'TREASURE BOX',
  maxItems: 100,
  soundEnabled: true,
  soundVolume: 0.3,
  soundPreset: 'metallic',
  isPublic: false,
  boxScale: 1.0,
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

/** Auto-match sound preset to drawer material. */
export const MATERIAL_SOUND_MAP: Record<DrawerStylePreset, SoundPreset> = {
  clay: 'clay',
  metal: 'metallic',
  wood: 'wooden',
  pixel: 'pixel',
  paper: 'paper',
  glass: 'glass',
};

// ═══════════════════════════════════════════════════════════════
// ADDITIONAL FEATURES INPUT LIMITS
// ═══════════════════════════════════════════════════════════════

export const ADDITIONAL_FEATURES_MAX_KEYWORDS = 3;
export const ADDITIONAL_FEATURES_MAX_CHAR_PER_KEYWORD = 20;
export const ADDITIONAL_FEATURES_INPUT_MAX_LENGTH = 60;

