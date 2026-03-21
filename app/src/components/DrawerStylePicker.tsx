'use client';

import { useState, useMemo } from 'react';
import { uploadSpriteSheet, saveDrawerImages } from '@/lib/firestore';
import { PRESET_MATERIALS, STYLE_PRESETS, DECOR_ITEMS, ANGLE_OPTIONS, ADDITIONAL_FEATURES_INPUT_MAX_LENGTH, ADDITIONAL_FEATURES_MAX_KEYWORDS, ADDITIONAL_FEATURES_MAX_CHAR_PER_KEYWORD } from '@/lib/config';
import type {
  DrawerStylePreset,
  DrawerAngle,
  DrawerStyle,
  DrawerImages,
  BoxState,
} from '@/lib/types';

const ALL_STATES: BoxState[] = ['IDLE', 'HOVER_PEEK', 'OPEN', 'HOVER_CLOSE', 'CLOSING', 'SLAMMING'];

// ── Shared styles ────────────────────────────────────────────────
const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--tb-fg-faint)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 6,
  display: 'block',
};

const pillBtn = (active: boolean, disabled: boolean): React.CSSProperties => ({
  fontSize: 11,
  padding: '4px 10px',
  border: `1px solid ${active ? 'var(--tb-accent)' : 'var(--tb-border-subtle)'}`,
  borderRadius: 3,
  color: active ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
  background: active ? 'var(--tb-bg-muted)' : 'transparent',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  transition: 'all 0.15s',
});


// ── ASCII preview renderer ───────────────────────────────────────
function renderAsciiPreview(w: number, h: number, angle: DrawerAngle): string {
  const cw = Math.max(10, Math.round(w * 6));
  const ch = Math.max(3, Math.round(h * 3));
  const lines: string[] = [];

  // Build handle centered
  const handleGap = Math.min(4, Math.floor(cw / 4));
  const handleBar = Math.max(2, Math.floor((cw - handleGap - 2) / 2));
  const handleW = handleBar * 2 + handleGap + 2;
  const hPadL = Math.floor((cw - handleW) / 2);
  const hPadR = cw - hPadL - handleW;
  const handleLine = ' '.repeat(hPadL) + '═'.repeat(handleBar) + '╡' + ' '.repeat(handleGap) + '╞' + '═'.repeat(handleBar) + ' '.repeat(hPadR);

  const mid = Math.floor(ch / 2);

  if (angle === 'front') {
    lines.push('╔' + '═'.repeat(cw) + '╗');
    for (let r = 0; r < ch; r++) {
      lines.push('║' + (r === mid ? handleLine : ' '.repeat(cw)) + '║');
    }
    lines.push('╚' + '═'.repeat(cw) + '╝');
  } else {
    const depth = 3;
    const isLeft = angle === 'left-45';

    // Top
    lines.push((isLeft ? ' '.repeat(depth) : '') + '╔' + '═'.repeat(cw) + '╗');

    // Body
    for (let r = 0; r < ch; r++) {
      const progress = Math.min(depth, Math.round(((r + 1) / ch) * depth));
      const content = r === mid ? handleLine : ' '.repeat(cw);

      if (isLeft) {
        const indent = depth - progress;
        const side = progress > 0 ? '╱' + ' '.repeat(progress - 1) : ' '.repeat(0);
        lines.push(' '.repeat(indent) + side + '║' + content + '║');
      } else {
        const side = progress > 0 ? ' '.repeat(progress - 1) + '╲' : '';
        lines.push('║' + content + '║' + side);
      }
    }

    // Bottom
    lines.push((isLeft ? '' : '') + '╚' + '═'.repeat(cw) + '╝');
  }

  return lines.join('\n');
}

// ── Component ────────────────────────────────────────────────────
interface Props {
  userId: string;
  currentImages?: DrawerImages;
  onComplete: (images: DrawerImages) => void;
  onReset: () => void;
  onGeneratingChange?: (generating: boolean) => void;
}

export default function DrawerStylePicker({ userId, currentImages, onComplete, onReset, onGeneratingChange }: Props) {
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
    return 'plain';
  });
  // 4. Decor (hardware items)
  const [selectedDecor, setSelectedDecor] = useState<string[]>(() => {
    const d = currentImages?.style.decor;
    return d ? d.split(', ') : [];
  });
  const [customDecor, setCustomDecor] = useState(currentImages?.style.customDecorText || '');
  // 5. Size & angle
  const [drawerWidth, setDrawerWidth] = useState(currentImages?.style.drawerWidth || 3);
  const [drawerHeight, setDrawerHeight] = useState(currentImages?.style.drawerHeight || 2);
  const [angle, setAngle] = useState<DrawerAngle>(currentImages?.style.angle || 'front');

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Partial<Record<BoxState, string>>>(
    currentImages?.urls || {}
  );

  // Sprite preview
  const [spritePreviewUrl, setSpritePreviewUrl] = useState<string | null>(null);

  // Debug state
  const [debugPrompt, setDebugPrompt] = useState<string | null>(null);
  const [debugMeta, setDebugMeta] = useState<{
    spriteSize?: { width: number; height: number; frameCount: number };
    bgRemoval?: string;
    visionObjects?: number;
    ratioWarning?: string;
  } | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  const asciiPreview = useMemo(
    () => renderAsciiPreview(drawerWidth, drawerHeight, angle),
    [drawerWidth, drawerHeight, angle]
  );

  const toggleDecor = (item: string) => {
    setSelectedDecor(prev =>
      prev.includes(item) ? prev.filter(d => d !== item) : [...prev, item]
    );
  };

  const handleGenerate = async () => {
    setGenerating(true);
    onGeneratingChange?.(true);
    setError(null);
    setPreviewUrls({});
    setSpritePreviewUrl(null);

    // Build decor string from selected items + sanitized custom keywords
    const allDecor = [...selectedDecor];
    if (customDecor.trim()) {
      // Allow only letters, numbers, spaces — strip everything else
      // Limit to 3 keywords, 20 chars each
      const keywords = customDecor
        .replace(/[^a-zA-Z0-9\s,]/g, '')
        .split(/[,\s]+/)
        .map(w => w.trim().slice(0, ADDITIONAL_FEATURES_MAX_CHAR_PER_KEYWORD))
        .filter(Boolean)
        .slice(0, ADDITIONAL_FEATURES_MAX_KEYWORDS);
      allDecor.push(...keywords);
    }
    const decorStr = allDecor.join(', ');

    const style: DrawerStyle = {
      preset,
      color,
      stylePattern: stylePattern !== 'plain' ? stylePattern : undefined,
      customDecorText: customDecor.trim() || undefined,
      accentColor,
      decor: decorStr || undefined,
      drawerWidth,
      drawerHeight,
      angle,
    };

    try {
      const res = await fetch('/api/generate-box', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style }),
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

      // Upload single sprite sheet
      const spriteUrl = await uploadSpriteSheet(userId, data.sprite);
      setSpritePreviewUrl(spriteUrl);

      // Strip undefined values — Firestore rejects them
      const cleanStyle: DrawerStyle = JSON.parse(JSON.stringify(style));

      const drawerImages: DrawerImages = {
        urls: {} as Record<BoxState, string>,
        spriteUrl,
        style: cleanStyle,
        generatedAt: Date.now(),
        ...(data.activeArea && { activeArea: data.activeArea }),
      };

      await saveDrawerImages(userId, drawerImages);
      onComplete(drawerImages);
    } catch (e: any) {
      console.error('Generation error:', e);
      setError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
      onGeneratingChange?.(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── 1. Material ─────────────────────────────────── */}
      <div>
        <label style={sectionLabel}>material</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESET_MATERIALS.map(m => (
            <button
              key={m.id}
              onClick={() => setPreset(m.id)}
              disabled={generating}
              style={pillBtn(preset === m.id, generating)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 2. Colors (primary + accent) ────────────────── */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={sectionLabel}>primary color</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              disabled={generating}
              style={{
                width: 32, height: 32, padding: 0, border: '1px solid var(--tb-border-subtle)',
                borderRadius: 3, cursor: generating ? 'not-allowed' : 'pointer',
                opacity: generating ? 0.5 : 1, background: 'transparent',
              }}
            />
            <input
              value={color}
              onChange={e => setColor(e.target.value)}
              disabled={generating}
              placeholder="#hex"
              style={{
                background: 'transparent', fontSize: 11, padding: '3px 6px',
                width: 80, outline: 'none', borderRadius: 3,
                border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-fg-muted)',
                opacity: generating ? 0.5 : 1,
              }}
            />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={sectionLabel}>accent color <span style={{ color: 'var(--tb-fg-ghost)', textTransform: 'none' }}>(hardware / trim)</span></label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={accentColor}
              onChange={e => setAccentColor(e.target.value)}
              disabled={generating}
              style={{
                width: 32, height: 32, padding: 0, border: '1px solid var(--tb-border-subtle)',
                borderRadius: 3, cursor: generating ? 'not-allowed' : 'pointer',
                opacity: generating ? 0.5 : 1, background: 'transparent',
              }}
            />
            <input
              value={accentColor}
              onChange={e => setAccentColor(e.target.value)}
              disabled={generating}
              placeholder="#hex"
              style={{
                background: 'transparent', fontSize: 11, padding: '3px 6px',
                width: 80, outline: 'none', borderRadius: 3,
                border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-fg-muted)',
                opacity: generating ? 0.5 : 1,
              }}
            />
          </div>
        </div>
      </div>

      {/* ── 3. Style (surface pattern) ──────────────────── */}
      <div>
        <label style={sectionLabel}>style</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STYLE_PRESETS.map(s => (
            <button
              key={s.id}
              onClick={() => setStylePattern(s.id)}
              disabled={generating}
              style={pillBtn(stylePattern === s.id, generating)}
            >
              {s.label.toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ── 4. Decor (hardware items) ───────────────────── */}
      <div>
        <label style={sectionLabel}>additional features or styles</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          {DECOR_ITEMS.map(d => (
            <button
              key={d.id}
              onClick={() => toggleDecor(d.label)}
              disabled={generating}
              style={pillBtn(selectedDecor.includes(d.label), generating)}
            >
              {d.label.toLowerCase()}
            </button>
          ))}
        </div>
        <input
          value={customDecor}
          onChange={e => setCustomDecor(e.target.value)}
          disabled={generating}
          placeholder={`up to ${ADDITIONAL_FEATURES_MAX_KEYWORDS} keywords — e.g. dragon, gemstones, filigree`}
          maxLength={ADDITIONAL_FEATURES_INPUT_MAX_LENGTH}
          style={{
            width: '100%', background: 'transparent', fontSize: 11,
            padding: '5px 8px', outline: 'none', borderRadius: 3,
            border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-fg-muted)',
            opacity: generating ? 0.5 : 1,
          }}
        />
      </div>

      {/* ── 5. Size & Angle ─────────────────────────────── */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={sectionLabel}>drawer size</label>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--tb-fg-faint)' }}>width</span>
              <span style={{ fontSize: 10, color: 'var(--tb-fg-muted)' }}>{drawerWidth}</span>
            </div>
            <input
              type="range" min={1} max={5} step={1}
              value={drawerWidth}
              onChange={e => setDrawerWidth(Number(e.target.value))}
              disabled={generating}
              style={{ width: '100%', accentColor: 'var(--tb-accent)' }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--tb-fg-faint)' }}>height</span>
              <span style={{ fontSize: 10, color: 'var(--tb-fg-muted)' }}>{drawerHeight}</span>
            </div>
            <input
              type="range" min={1} max={5} step={1}
              value={drawerHeight}
              onChange={e => setDrawerHeight(Number(e.target.value))}
              disabled={generating}
              style={{ width: '100%', accentColor: 'var(--tb-accent)' }}
            />
          </div>
          <label style={{ ...sectionLabel, marginTop: 8 }}>opening angle</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {ANGLE_OPTIONS.map(a => (
              <button
                key={a.id}
                onClick={() => setAngle(a.id)}
                disabled={generating}
                style={{ ...pillBtn(angle === a.id, generating), display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <span style={{ fontSize: 13 }}>{a.icon}</span>
                {a.label.toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* ASCII preview — monospace, left-aligned */}
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={sectionLabel}>preview</label>
          <pre
            style={{
              fontSize: 10, lineHeight: 1.2,
              color: 'var(--tb-accent)',
              background: 'var(--tb-bg-muted, #111)',
              border: '1px solid var(--tb-border-subtle)',
              borderRadius: 3,
              padding: '12px 16px',
              fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
              whiteSpace: 'pre',
              overflow: 'auto',
              margin: 0,
            }}
          >
            {asciiPreview}
          </pre>
          <span style={{ fontSize: 9, color: 'var(--tb-fg-ghost)', marginTop: 4, display: 'block' }}>
            {drawerWidth}:{drawerHeight} ratio · {ANGLE_OPTIONS.find(a => a.id === angle)?.label}
          </span>
        </div>
      </div>

      {/* ── Generate ────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            fontSize: 11, padding: '6px 20px', borderRadius: 3,
            border: '1px solid var(--tb-border)', color: 'var(--tb-accent)',
            background: 'transparent',
            cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.5 : 1,
          }}
        >
          {generating ? 'generating...' : currentImages ? 'regenerate' : 'generate drawer'}
        </button>
        {currentImages && !generating && (
          <button
            onClick={onReset}
            style={{ fontSize: 11, color: 'var(--tb-fg-faint)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            reset to ASCII
          </button>
        )}
      </div>

      {generating && (
        <div style={{ fontSize: 11, color: 'var(--tb-highlight, var(--tb-accent))' }}>
          generating all 5 states — 30-60 seconds...
        </div>
      )}

      {error && (
        <div style={{
          fontSize: 11, color: '#f87171',
          background: 'rgba(248,113,113,0.1)',
          border: '1px solid rgba(248,113,113,0.2)',
          padding: 10, borderRadius: 3,
        }}>
          {error}
        </div>
      )}

      {(spritePreviewUrl || Object.keys(previewUrls).length > 0) && (
        <div>
          <label style={sectionLabel}>generated sprite sheet</label>
          {spritePreviewUrl ? (
            <div style={{
              borderRadius: 3, overflow: 'hidden',
              border: '1px solid var(--tb-border-subtle)',
              background: 'repeating-conic-gradient(var(--tb-bg-muted) 0% 25%, var(--tb-bg-subtle) 0% 50%) 50% / 8px 8px',
              padding: 4,
            }}>
              <img
                src={spritePreviewUrl}
                alt="Sprite sheet"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
              {ALL_STATES.map(state => {
                const url = previewUrls[state];
                return (
                  <div key={state} style={{ flexShrink: 0, textAlign: 'center' }}>
                    <div style={{
                      width: 72, height: 56, borderRadius: 3, overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1px solid var(--tb-border-subtle)',
                      background: url
                        ? 'repeating-conic-gradient(var(--tb-bg-muted) 0% 25%, var(--tb-bg-subtle) 0% 50%) 50% / 8px 8px'
                        : 'var(--tb-bg-muted)',
                    }}>
                      {url ? (
                        <img src={url} alt={state} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      ) : (
                        <span style={{ fontSize: 9, color: 'var(--tb-fg-faint)' }}>...</span>
                      )}
                    </div>
                    <span style={{ fontSize: 8, color: 'var(--tb-fg-faint)', marginTop: 2, display: 'block' }}>
                      {state.toLowerCase().replace('_', ' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Debug Panel ───────────────────────────────── */}
      {debugPrompt && (
        <div style={{ borderTop: '1px solid var(--tb-border-subtle)', paddingTop: 12 }}>
          <button
            onClick={() => setDebugOpen(!debugOpen)}
            style={{
              fontSize: 10, color: 'var(--tb-fg-faint)', background: 'none',
              border: 'none', cursor: 'pointer', letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
            }}
          >
            {debugOpen ? '▾' : '▸'} debug
          </button>
          {debugOpen && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={sectionLabel}>prompt sent to gemini</label>
                <pre style={{
                  fontSize: 9, lineHeight: 1.4, padding: 10, borderRadius: 3,
                  background: 'var(--tb-bg-muted)', color: 'var(--tb-fg-muted)',
                  border: '1px solid var(--tb-border-subtle)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  maxHeight: 200, overflow: 'auto', margin: 0,
                }}>
                  {debugPrompt}
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
          )}
        </div>
      )}
    </div>
  );
}
