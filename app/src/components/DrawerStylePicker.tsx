'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { uploadSpriteSheet, saveDrawerImages } from '@/lib/firestore';
import { PRESET_MATERIALS, STYLE_PRESETS, DECOR_ITEMS, ADDITIONAL_FEATURES_INPUT_MAX_LENGTH, ADDITIONAL_FEATURES_MAX_KEYWORDS, ADDITIONAL_FEATURES_MAX_CHAR_PER_KEYWORD } from '@/lib/config';
import type {
  BoxDimensions,
  DrawerStylePreset,
  DrawerStyle,
  DrawerImages,
  BoxState,
} from '@/lib/types';

// ── Validation ──────────────────────────────────────────────────
const HEX6_RE = /^#[0-9a-fA-F]{6}$/;
const VALID_PRESETS = new Set(PRESET_MATERIALS.map(m => m.id));
const VALID_PATTERNS: Set<string> = new Set(STYLE_PRESETS.map(s => s.id));
function validateStyle(style: DrawerStyle): string | null {
  if (!VALID_PRESETS.has(style.preset)) return `Invalid material: ${style.preset}`;
  if (!HEX6_RE.test(style.color)) return `Invalid primary color: ${style.color}`;
  if (style.accentColor && !HEX6_RE.test(style.accentColor))
    return `Invalid accent color: ${style.accentColor}`;
  if (style.stylePattern && !VALID_PATTERNS.has(style.stylePattern))
    return `Invalid style pattern: ${style.stylePattern}`;
  const w = style.drawerWidth ?? 3;
  const h = style.drawerHeight ?? 2;
  if (w < 1 || w > 5) return `Drawer width must be 1–5, got ${w}`;
  if (h < 1 || h > 5) return `Drawer height must be 1–5, got ${h}`;
  return null;
}

const ALL_STATES: BoxState[] = ['IDLE', 'HOVER_PEEK', 'OPEN', 'HOVER_CLOSE', 'CLOSING', 'SLAMMING'];

// ── Shared styles ────────────────────────────────────────────────
const MONO = "'Inconsolata', monospace";

const sectionLabel: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--tb-fg-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 8,
  display: 'block',
};

const pillBtn = (active: boolean, disabled: boolean): React.CSSProperties => ({
  fontFamily: MONO,
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  padding: '7px 14px',
  border: `1px solid ${active ? 'var(--tb-accent)' : 'var(--tb-border)'}`,
  color: active ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
  background: active ? 'var(--tb-bg-muted)' : 'transparent',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  transition: 'all 0.15s',
});

// Material-themed styles for each preset
const MATERIAL_THEMES: Record<string, { color: string; activeBg: string }> = {
  clay: { color: '#a0785a', activeBg: 'rgba(160,120,90,0.12)' },
  metal: { color: '#9a9aa0', activeBg: 'rgba(180,180,190,0.12)' },
  wood: { color: '#8a6a3a', activeBg: 'rgba(138,106,58,0.12)' },
  pixel: { color: '#70b070', activeBg: 'rgba(112,176,112,0.1)' },
  paper: { color: 'var(--tb-fg-muted)', activeBg: 'rgba(128,128,128,0.08)' },
  glass: { color: '#88b0cc', activeBg: 'rgba(136,176,204,0.1)' },
};

const materialPillBtn = (id: string, active: boolean, disabled: boolean): React.CSSProperties => {
  const theme = MATERIAL_THEMES[id] || MATERIAL_THEMES.clay;
  return {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    padding: '8px 16px',
    border: `1.5px solid ${active ? theme.color : 'var(--tb-border)'}`,
    color: active ? theme.color : 'var(--tb-fg-faint)',
    background: active ? theme.activeBg : 'transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s',
  };
};

const hexInput: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: '0.04em',
  background: 'transparent',
  padding: '5px 8px',
  width: 90,
  outline: 'none',
  border: '0.5px solid var(--tb-border)',
  color: 'var(--tb-fg)',
};


// ── Component ────────────────────────────────────────────────────
export interface DrawerPickerActionState {
  generating: boolean;
  hasExisting: boolean;
  hasChanges: boolean;
  onGenerate: () => void;
  onReset: () => void;
}

interface Props {
  userId: string;
  currentImages?: DrawerImages;
  boxDimensions?: BoxDimensions;
  onComplete: (images: DrawerImages) => void;
  onReset: () => void;
  onGeneratingChange?: (generating: boolean, colors?: { color: string; accentColor: string }) => void;
  /** When true, hides the internal generate/reset buttons (parent renders them) */
  hideActions?: boolean;
  /** Called when action state changes so parent can render external buttons */
  onActionState?: (state: DrawerPickerActionState) => void;
}

export default function DrawerStylePicker({ userId, currentImages, boxDimensions, onComplete, onReset, onGeneratingChange, hideActions, onActionState }: Props) {
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);
  // 1. Material (= old preset)
  const [preset, setPreset] = useState<DrawerStylePreset>(
    currentImages?.style.preset || 'clay'
  );
  // 2. Colors
  const [color, setColor] = useState(currentImages?.style.color || '#8B4513');
  const [accentColor, setAccentColor] = useState(currentImages?.style.accentColor || '#B08D57');
  // 3. Style (surface pattern)
  const [stylePattern, setStylePattern] = useState(() => {
    const s = currentImages?.style;
    if (s?.stylePattern) return s.stylePattern;
    // Backward compat: old docs stored label in customPrompt — match it back to ID
    if (s?.customPrompt) {
      const match = STYLE_PRESETS.find(p => p.label === s.customPrompt);
      if (match) return match.id;
    }
    return 'modern-minimal';
  });
  // 4. Decor (hardware items)
  const [selectedDecor, setSelectedDecor] = useState<string[]>(() => {
    const d = currentImages?.style.decor;
    return d ? d.split(', ') : [];
  });
  const [customDecor, setCustomDecor] = useState(currentImages?.style.customDecorText || '');
  // 5. Size & angle
  const drawerWidth = currentImages?.style.drawerWidth || 3;
  const drawerHeight = currentImages?.style.drawerHeight || 2;

  // Dynamic options from Gemini
  type DynOption = { id: string; label: string; prompt: string };
  const [dynStyles, setDynStyles] = useState<DynOption[] | null>(null);
  const [dynFeatures, setDynFeatures] = useState<DynOption[] | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const fetchOptions = useCallback(async () => {
    setOptionsLoading(true);
    setOptionsError(null);
    try {
      const res = await fetch(`/api/generate-options?seed=${Date.now()}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      const data = await res.json();
      setDynStyles(data.styles);
      setDynFeatures(data.features);
      // Reset selections to first dynamic option
      if (data.styles?.[0]) setStylePattern(data.styles[0].id);
      setSelectedDecor([]);
    } catch (e: any) {
      setOptionsError(e.message);
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => { fetchOptions(); }, [fetchOptions]);

  // Resolved option lists: dynamic if available, static fallback
  const styleOptions = dynStyles || (STYLE_PRESETS as unknown as DynOption[]);
  const featureOptions = dynFeatures || (DECOR_ITEMS as unknown as DynOption[]);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Partial<Record<BoxState, string>>>(
    currentImages?.urls || {}
  );

  // Sprite preview
  const [spritePreviewUrl, setSpritePreviewUrl] = useState<string | null>(
    currentImages?.spriteUrl ?? null
  );

  // Debug state
  const [debugPrompt, setDebugPrompt] = useState<string | null>(
    currentImages?.debugPrompt ?? null
  );
  const [debugMeta, setDebugMeta] = useState<{
    spriteSize?: { width: number; height: number; frameCount: number };
    bgRemoval?: string;
    visionObjects?: number;
    ratioWarning?: string;
  } | null>(null);

  // ── Build current style (single source of truth) ──────────────
  const buildCurrentStyle = useCallback((): DrawerStyle => {
    const allDecor = [...selectedDecor];
    if (customDecor.trim()) {
      const keywords = customDecor
        .replace(/[^a-zA-Z0-9\s,]/g, '')
        .split(/[,\s]+/)
        .map(w => w.trim().slice(0, ADDITIONAL_FEATURES_MAX_CHAR_PER_KEYWORD))
        .filter(Boolean)
        .slice(0, ADDITIONAL_FEATURES_MAX_KEYWORDS);
      allDecor.push(...keywords);
    }
    const decorStr = allDecor.join(', ');
    // Resolve dynamic prompts for selected style and features
    const selectedStyleOption = styleOptions.find(s => s.id === stylePattern);
    const selectedFeaturePrompts = selectedDecor
      .map(label => featureOptions.find(f => f.label === label)?.prompt)
      .filter((p): p is string => !!p);

    return {
      preset,
      color,
      stylePattern: stylePattern || undefined,
      stylePrompt: selectedStyleOption?.prompt || undefined,
      customDecorText: customDecor.trim() || undefined,
      accentColor,
      decor: decorStr || undefined,
      featurePrompts: selectedFeaturePrompts.length > 0 ? selectedFeaturePrompts : undefined,
      drawerWidth,
      drawerHeight,
    };
  }, [preset, color, accentColor, stylePattern, selectedDecor, customDecor, drawerWidth, drawerHeight, styleOptions, featureOptions]);

  const currentStyle = useMemo(() => buildCurrentStyle(), [buildCurrentStyle]);

  // ── Detect which fields changed vs. last generated config ─────
  const lastStyle = currentImages?.style ?? null;

  const changedFields = useMemo<Set<string>>(() => {
    if (!lastStyle) return new Set();
    const fields = new Set<string>();
    if (currentStyle.preset !== lastStyle.preset) fields.add('preset');
    if (currentStyle.color !== lastStyle.color) fields.add('color');
    if ((currentStyle.accentColor ?? '') !== (lastStyle.accentColor ?? '')) fields.add('accentColor');
    if ((currentStyle.stylePattern ?? 'plain') !== (lastStyle.stylePattern ?? 'plain')) fields.add('stylePattern');
    if ((currentStyle.decor ?? '') !== (lastStyle.decor ?? '')) fields.add('decor');
    if ((currentStyle.customDecorText ?? '') !== (lastStyle.customDecorText ?? '')) fields.add('customDecor');
    return fields;
  }, [currentStyle, lastStyle]);

  const hasChanges = changedFields.size > 0;

  // Report action state to parent for external button rendering
  const handleGenerateRef = useRef<() => void>(() => {});
  useEffect(() => {
    onActionState?.({
      generating,
      hasExisting: !!currentImages,
      hasChanges,
      onGenerate: () => handleGenerateRef.current(),
      onReset,
    });
  }, [generating, currentImages, hasChanges, onActionState, onReset]);

  const toggleDecor = (item: string) => {
    setSelectedDecor(prev =>
      prev.includes(item) ? prev.filter(d => d !== item) : [...prev, item]
    );
  };

  const handleGenerate = async () => {
    // Validate all config values before generation
    const style = buildCurrentStyle();
    const validationError = validateStyle(style);
    if (validationError) {
      setError(validationError);
      return;
    }

    setGenerating(true);
    onGeneratingChange?.(true, { color, accentColor });
    setError(null);
    setPreviewUrls({});
    setSpritePreviewUrl(null);

    try {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const res = await fetch('/api/generate-box', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style, dimensions: boxDimensions }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        if (errData.prompt) setDebugPrompt(errData.prompt);
        throw new Error(errData.error || 'Generation failed');
      }

      const data = await res.json();
      if (data.prompt) setDebugPrompt(data.prompt);
      if (data.spriteSize || data.bgRemoval) {
        setDebugMeta({
          spriteSize: data.spriteSize,
          bgRemoval: data.bgRemoval,
          visionObjects: data.visionObjects,
          ratioWarning: data.ratioWarning,
        });
      }

      // Use server-side chroma key result directly (no client-side ML needed)
      const finalSpriteBase64 = data.sprite;

      // Upload single sprite sheet
      const spriteUrl = await uploadSpriteSheet(userId, finalSpriteBase64);
      setSpritePreviewUrl(spriteUrl);

      // Strip undefined values — Firestore rejects them
      const cleanStyle: DrawerStyle = JSON.parse(JSON.stringify(style));

      const drawerImages: DrawerImages = {
        urls: {} as Record<BoxState, string>,
        spriteUrl,
        style: cleanStyle,
        generatedAt: Date.now(),
        ...(data.activeArea && { activeArea: data.activeArea }),
        ...(data.prompt && { debugPrompt: data.prompt }),
      };

      await saveDrawerImages(userId, drawerImages);
      onComplete(drawerImages);
    } catch (e: any) {
      if (e.name === 'AbortError') return; // component unmounted or new generation started
      console.error('Generation error:', e);
      setError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
      onGeneratingChange?.(false);
    }
  };

  // Keep ref in sync for parent's external generate button
  handleGenerateRef.current = handleGenerate;

  // ── Changed-field indicator dot ────────────────────────────────
  const changedDot = (field: string): React.ReactNode =>
    changedFields.has(field) ? (
      <span style={{
        display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
        backgroundColor: 'var(--tb-accent)', marginLeft: 4, verticalAlign: 'middle',
      }} />
    ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Action buttons (hidden if parent renders them) ── */}
      {!hideActions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              fontFamily: MONO, fontSize: 13, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              padding: '8px 20px',
              border: '1.5px solid var(--tb-accent)', color: 'var(--tb-accent)',
              background: 'transparent',
              cursor: generating ? 'not-allowed' : 'pointer',
              opacity: generating ? 0.5 : 1,
            }}
          >
            {generating ? 'Generating...' : currentImages ? 'Regenerate' : 'Generate'}
          </button>
          {currentImages && !generating && (
            <button
              onClick={onReset}
              style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--tb-fg-faint)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Reset to ASCII
            </button>
          )}
        </div>
      )}

      {generating && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--tb-highlight, var(--tb-accent))' }}>
          generating all 5 states — 30-60 seconds...
        </div>
      )}

      {error && (
        <div style={{
          fontFamily: MONO, fontSize: 12, color: '#f87171',
          background: 'rgba(248,113,113,0.1)',
          border: '1px solid rgba(248,113,113,0.2)',
          padding: 10,
        }}>
          {error}
        </div>
      )}

      {/* ── 1. Material — themed pills ─────────────────── */}
      <div>
        <label style={sectionLabel}>material{changedDot('preset')}</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(0, 1fr))', gap: 6 }}>
          {PRESET_MATERIALS.map(m => (
            <button
              key={m.id}
              className="tb-pill-material"
              onClick={() => setPreset(m.id)}
              disabled={generating}
              style={{ ...materialPillBtn(m.id, preset === m.id, generating), width: '100%', textAlign: 'center' }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 2. Colors (primary + accent) — full width, consistent height ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div>
          <label style={sectionLabel}>color{changedDot('color')}</label>
          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--tb-border)', opacity: generating ? 0.5 : 1 }}>
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              disabled={generating}
              style={{
                width: 40, height: 36, padding: 0, border: 'none', borderRight: '1px solid var(--tb-border)',
                cursor: generating ? 'not-allowed' : 'pointer', background: 'transparent', flexShrink: 0,
              }}
            />
            <input
              value={color}
              onChange={e => setColor(e.target.value)}
              disabled={generating}
              placeholder="#hex"
              style={{
                fontFamily: MONO, fontSize: 13, fontWeight: 500, letterSpacing: '0.04em',
                background: 'transparent', padding: '0 8px', height: 36,
                flex: 1, minWidth: 0, outline: 'none', border: 'none', color: 'var(--tb-fg)',
              }}
            />
          </div>
        </div>
        <div>
          <label style={sectionLabel}>accent{changedDot('accentColor')}</label>
          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--tb-border)', opacity: generating ? 0.5 : 1 }}>
            <input
              type="color"
              value={accentColor}
              onChange={e => setAccentColor(e.target.value)}
              disabled={generating}
              style={{
                width: 40, height: 36, padding: 0, border: 'none', borderRight: '1px solid var(--tb-border)',
                cursor: generating ? 'not-allowed' : 'pointer', background: 'transparent', flexShrink: 0,
              }}
            />
            <input
              value={accentColor}
              onChange={e => setAccentColor(e.target.value)}
              disabled={generating}
              placeholder="#hex"
              style={{
                fontFamily: MONO, fontSize: 13, fontWeight: 500, letterSpacing: '0.04em',
                background: 'transparent', padding: '0 8px', height: 36,
                flex: 1, minWidth: 0, outline: 'none', border: 'none', color: 'var(--tb-fg)',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── 3. Style & Features (dynamic from Gemini) ──── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <label style={{ ...sectionLabel, marginBottom: 0 }}>style{changedDot('stylePattern')}</label>
          <button
            className="tb-link"
            onClick={fetchOptions}
            disabled={optionsLoading || generating}
            style={{
              fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
              textTransform: 'uppercase' as const,
              color: optionsLoading ? 'var(--tb-fg-ghost)' : 'var(--tb-fg-faint)',
              background: 'none', border: 'none', cursor: optionsLoading ? 'wait' : 'pointer',
              padding: 0, transition: 'color 0.15s',
            }}
          >
            {optionsLoading ? '↻ loading...' : '↻ refresh'}
          </button>
        </div>
        {optionsError && <div style={{ fontFamily: MONO, fontSize: 12, color: '#f87171', marginBottom: 8 }}>failed to load options — using defaults</div>}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(styleOptions.length, 5)}, 1fr)`, gap: 6, opacity: optionsLoading ? 0.4 : 1, transition: 'opacity 0.3s' }}>
          {styleOptions.map(s => (
            <button
              key={s.id}
              className="tb-pill"
              onClick={() => setStylePattern(s.id)}
              disabled={generating || optionsLoading}
              style={{ ...pillBtn(stylePattern === s.id, generating), width: '100%', textAlign: 'center' }}
            >
              {s.label.toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label style={sectionLabel}>features{changedDot('decor')}{changedDot('customDecor')} <span style={{ color: 'var(--tb-fg-ghost)', textTransform: 'none', fontWeight: 400 }}>— select any</span></label>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(featureOptions.length, 5)}, 1fr)`, gap: 6, marginBottom: 10, opacity: optionsLoading ? 0.4 : 1, transition: 'opacity 0.3s' }}>
          {featureOptions.map(d => (
            <button
              key={d.id}
              className="tb-pill"
              onClick={() => toggleDecor(d.label)}
              disabled={generating || optionsLoading}
              style={{ ...pillBtn(selectedDecor.includes(d.label), generating), width: '100%', textAlign: 'center' }}
            >
              {d.label.toLowerCase()}
            </button>
          ))}
        </div>
        <input
          value={customDecor}
          onChange={e => setCustomDecor(e.target.value)}
          disabled={generating}
          placeholder="Custom keywords — e.g. dragon, gemstones, filigree"
          maxLength={ADDITIONAL_FEATURES_INPUT_MAX_LENGTH}
          style={{
            ...hexInput,
            width: '100%',
            fontSize: 13,
            opacity: generating ? 0.5 : 1,
          }}
        />
      </div>

      {/* ── Debug Panel (collapsed — includes sprite preview) ── */}
      <details style={{ borderTop: '0.5px solid var(--tb-border)', paddingTop: 10 }}>
        <summary style={{
          fontSize: 11, color: 'var(--tb-fg-ghost)', letterSpacing: '0.08em',
          textTransform: 'uppercase' as const, cursor: 'pointer',
          fontFamily: "'Inconsolata', monospace", fontWeight: 500,
          listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 9, transition: 'transform 0.2s' }}>▸</span> Debug
        </summary>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Dynamic options debug */}
          <div>
            <label style={sectionLabel}>generated options {dynStyles ? '(gemini)' : '(static fallback)'}</label>
            <pre style={{
              fontSize: 9, lineHeight: 1.4, padding: 10,
              background: 'var(--tb-bg-muted)', color: 'var(--tb-fg-muted)',
              border: '1px solid var(--tb-border-subtle)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 150, overflow: 'auto', margin: 0,
            }}>
              {JSON.stringify({ styles: styleOptions, features: featureOptions }, null, 2)}
            </pre>
          </div>
          {/* Sprite preview */}
          {spritePreviewUrl && (
            <div>
              <label style={sectionLabel}>generated sprite sheet</label>
              <div style={{
                overflow: 'hidden',
                border: '0.5px solid var(--tb-border)',
                background: 'repeating-conic-gradient(var(--tb-bg-muted) 0% 25%, var(--tb-bg-subtle) 0% 50%) 50% / 8px 8px',
                padding: 4,
              }}>
                <img src={spritePreviewUrl} alt="Sprite sheet" style={{ width: '100%', height: 'auto', display: 'block' }} />
              </div>
            </div>
          )}
          <div>
            <label style={sectionLabel}>prompt sent to gemini</label>
            <pre style={{
              fontSize: 9, lineHeight: 1.4, padding: 10, borderRadius: 3,
              background: 'var(--tb-bg-muted)', color: 'var(--tb-fg-muted)',
              border: '1px solid var(--tb-border-subtle)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 200, overflow: 'auto', margin: 0,
            }}>
              {debugPrompt ?? 'waiting for generation\u2026'}
            </pre>
          </div>
          {debugMeta?.spriteSize && (
            <div>
              <label style={sectionLabel}>sprite sheet</label>
              <span style={{ fontSize: 10, color: 'var(--tb-fg-muted)' }}>
                {debugMeta.spriteSize.width} × {debugMeta.spriteSize.height}px — {debugMeta.spriteSize.frameCount} frames
              </span>
            </div>
          )}
          {debugMeta?.ratioWarning && (
            <div>
              <label style={sectionLabel}>ratio fix</label>
              <span style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 3,
                background: 'rgba(250,204,21,0.1)',
                color: '#facc15',
                border: '1px solid rgba(250,204,21,0.2)',
              }}>
                {debugMeta.ratioWarning}
              </span>
            </div>
          )}
          {debugMeta?.bgRemoval && (
            <div>
              <label style={sectionLabel}>bg removal</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 3,
                  background: debugMeta.bgRemoval === 'vision' ? 'rgba(34,197,94,0.1)' : 'rgba(250,204,21,0.1)',
                  color: debugMeta.bgRemoval === 'vision' ? '#22c55e' : '#facc15',
                  border: `1px solid ${debugMeta.bgRemoval === 'vision' ? 'rgba(34,197,94,0.2)' : 'rgba(250,204,21,0.2)'}`,
                }}>
                  {debugMeta.bgRemoval === 'vision' ? 'vision api + chroma key' : 'chroma key only'}
                </span>
                {debugMeta.bgRemoval === 'vision' && debugMeta.visionObjects !== undefined && (
                  <span style={{ fontSize: 9, color: 'var(--tb-fg-faint)' }}>
                    {debugMeta.visionObjects} object{debugMeta.visionObjects !== 1 ? 's' : ''} detected
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
