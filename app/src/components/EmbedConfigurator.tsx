'use client';

import { useState, useCallback } from 'react';
import type { BoxConfig, EmbedSettings, AnchorCorner } from '@/lib/types';
import { DEFAULT_EMBED_SETTINGS } from '@/lib/config';

const GRID_POSITIONS: { anchor: AnchorCorner; label: string }[] = [
  { anchor: 'top-left', label: '↖' },
  { anchor: 'top-center', label: '↑' },
  { anchor: 'top-right', label: '↗' },
  { anchor: 'middle-left', label: '←' },
  { anchor: 'middle-center', label: '•' },
  { anchor: 'middle-right', label: '→' },
  { anchor: 'bottom-left', label: '↙' },
  { anchor: 'bottom-center', label: '↓' },
  { anchor: 'bottom-right', label: '↘' },
];

const MONO = "'Inconsolata', monospace";

const S = {
  accent: { color: 'var(--tb-accent)' },
  faint: { color: 'var(--tb-fg-faint)' },
  ghost: { color: 'var(--tb-fg-ghost)' },
  muted: { color: 'var(--tb-fg-muted)' },
};

const label: React.CSSProperties = {
  fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--tb-fg-muted)',
  display: 'block', marginBottom: 8,
};

const hint: React.CSSProperties = {
  fontFamily: MONO, fontSize: 11, fontWeight: 400, letterSpacing: '0.04em',
  color: 'var(--tb-fg-ghost)', marginTop: 4,
};

interface Props {
  config: BoxConfig;
  userId: string;
  onSettingsChange: (settings: EmbedSettings) => void;
  onScaleChange?: (scale: number) => void;
}

export default function EmbedConfigurator({ config, userId, onSettingsChange, onScaleChange }: Props) {
  const rawSettings = config.embedSettings || DEFAULT_EMBED_SETTINGS;
  const settings: EmbedSettings = {
    ...rawSettings,
    position: rawSettings.position || DEFAULT_EMBED_SETTINGS.position,
  };

  const [copied, setCopied] = useState<string | null>(null);

  const embedScale = config.boxScale ?? 1;

  const update = useCallback((patch: Partial<EmbedSettings>) => {
    onSettingsChange({ ...settings, ...patch });
  }, [settings, onSettingsChange]);


  const getEmbedCode = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const bg = config.backgroundColor || 'transparent';
    const anchor = settings.position.anchor;
    const ox = settings.position.offsetX;
    const oy = settings.position.offsetY;

    // Industry-standard inline IIFE pattern (like Intercom, Hotjar, GA).
    // Config is stored in window.__TB — immune to platform HTML sanitization.
    const cfgLines = [
      `    boxId: "${userId}"`,
      `    origin: "${baseUrl}"`,
      `    mode: "overlay"`,
      `    bg: "${bg}"`,
    ];
    if (embedScale !== 1) cfgLines.push(`    scale: ${embedScale}`);
    cfgLines.push(`    anchor: "${anchor}"`);
    cfgLines.push(`    ox: ${ox}`);
    cfgLines.push(`    oy: ${oy}`);
    if (settings.domCollide) {
      cfgLines.push(typeof settings.domCollide === 'string'
        ? `    domCollide: "${settings.domCollide}"`
        : `    domCollide: true`);
    }

    return `<script>\n(function(){\n  window.__TB = {\n${cfgLines.join(',\n')}\n  };\n  var s = document.createElement("script");\n  s.src = window.__TB.origin + "/embed/widget.js";\n  s.async = true;\n  document.head.appendChild(s);\n})();\n</script>`;
  };

  const handleCopy = () => {
    const code = getEmbedCode();
    navigator.clipboard.writeText(code);
    setCopied('embed');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Widget Size */}
      <div className="pb-4" style={{ borderBottom: '0.5px solid var(--tb-border)' }}>
        <span style={label}>Widget Size</span>
        <div className="flex items-center gap-3">
          <input
            type="range" min={0.5} max={2.0} step={0.1}
            value={embedScale}
            onChange={e => { if (onScaleChange) onScaleChange(Number(e.target.value)); }}
            className="tb-slider flex-1"
            style={{ '--slider-pct': `${((embedScale - 0.5) / 1.5) * 100}%` } as React.CSSProperties}
          />
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', ...S.accent }}>
            {Math.round(embedScale * 100)}%
          </span>
        </div>
      </div>

      {/* Position */}
      <div className="pb-4" style={{ borderBottom: '0.5px solid var(--tb-border)' }}>
        <span style={label}>Position</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, maxWidth: 220, width: '100%' }}>
          {GRID_POSITIONS.map(c => {
            const active = settings.position.anchor === c.anchor;
            return (
              <button
                key={c.anchor}
                className="tb-pill"
                onClick={() => update({ position: { ...settings.position, anchor: c.anchor, offsetX: 20, offsetY: 20 } })}
                style={{
                  fontFamily: MONO, fontSize: 16, fontWeight: active ? 700 : 400,
                  padding: '8px 0', textAlign: 'center', width: '100%',
                  border: `1px solid ${active ? 'var(--tb-accent)' : 'var(--tb-border)'}`,
                  color: active ? 'var(--tb-accent)' : 'var(--tb-fg-ghost)',
                  background: active ? 'var(--tb-bg-muted)' : 'transparent',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* DOM Collision */}
      <div className="pb-4" style={{ borderBottom: '0.5px solid var(--tb-border)' }}>
        <button
          onClick={() => update({ domCollide: settings.domCollide ? false : true })}
          className="tb-pill cursor-pointer uppercase flex items-center gap-3"
          style={{
            fontFamily: MONO, fontSize: 13, fontWeight: settings.domCollide ? 700 : 500,
            letterSpacing: '0.06em', background: 'none',
            border: `1px solid ${settings.domCollide ? 'var(--tb-accent)' : 'var(--tb-border)'}`,
            color: settings.domCollide ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
            padding: '7px 14px', width: '100%', textAlign: 'left', transition: 'all 0.15s',
          }}
        >
          <span style={{
            width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${settings.domCollide ? 'var(--tb-accent)' : 'var(--tb-border)'}`,
            background: settings.domCollide ? 'var(--tb-accent)' : 'transparent',
            color: settings.domCollide ? 'var(--tb-bg)' : 'transparent', fontSize: 10, flexShrink: 0,
          }}>✓</span>
          DOM Collision
        </button>
        {settings.domCollide && (
          <div className="mt-2">
            <input
              type="text"
              value={typeof settings.domCollide === 'string' ? settings.domCollide : ''}
              onChange={e => update({ domCollide: e.target.value.trim() || true })}
              placeholder="Custom CSS selector (optional)"
              style={{
                fontFamily: MONO, fontSize: 13, fontWeight: 400, letterSpacing: '0.04em',
                width: '100%', background: 'transparent', outline: 'none',
                border: '0.5px solid var(--tb-border)', padding: '6px 8px', color: 'var(--tb-fg)',
              }}
            />
            <p style={hint}>Items bounce off headings, images, and other page elements</p>
          </div>
        )}
      </div>

      {/* Share Link */}
      <div className="pb-4" style={{ borderBottom: '0.5px solid var(--tb-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <span style={label}>Share Link</span>
          <button
            onClick={() => {
              const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
              const url = `${baseUrl}/box/${userId}`;
              navigator.clipboard.writeText(url);
              setCopied('link');
              setTimeout(() => setCopied(null), 2000);
            }}
            className="tb-pill cursor-pointer uppercase"
            style={{
              fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em',
              padding: '7px 14px', minHeight: 36,
              border: `1px solid ${copied === 'link' ? 'var(--tb-accent)' : 'var(--tb-border)'}`,
              color: copied === 'link' ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
              background: 'transparent', transition: 'all 0.15s',
            }}
          >
            {copied === 'link' ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
        <div
          onClick={() => {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
            const url = `${baseUrl}/box/${userId}`;
            navigator.clipboard.writeText(url);
            setCopied('link');
            setTimeout(() => setCopied(null), 2000);
          }}
          style={{
            fontFamily: MONO, fontSize: 13, lineHeight: 1.5, padding: '8px 12px',
            background: 'var(--tb-bg-muted)', color: 'var(--tb-fg-muted)',
            border: `0.5px solid ${copied === 'link' ? 'var(--tb-accent)' : 'var(--tb-border)'}`,
            wordBreak: 'break-all', cursor: 'pointer', transition: 'border-color 0.15s',
          }}
        >
          {typeof window !== 'undefined' ? window.location.origin : ''}/box/{userId}
        </div>
        <p style={hint}>Anyone can view your drawer at this link — no embed needed</p>
      </div>

      {/* Embed Code */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span style={label}>Embed Code</span>
          <button
            onClick={handleCopy}
            className="tb-pill cursor-pointer uppercase"
            style={{
              fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em',
              padding: '7px 14px', minHeight: 36,
              border: `1px solid ${copied === 'embed' ? 'var(--tb-accent)' : 'var(--tb-border)'}`,
              color: copied === 'embed' ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
              background: 'transparent', transition: 'all 0.15s',
            }}
          >
            {copied === 'embed' ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
        <pre
          onClick={handleCopy}
          style={{
            fontFamily: MONO, fontSize: 'clamp(10px, 2.5vw, 12px)', lineHeight: 1.5, padding: 12,
            background: 'var(--tb-bg-muted)', color: 'var(--tb-fg-muted)',
            border: `0.5px solid ${copied === 'embed' ? 'var(--tb-accent)' : 'var(--tb-border)'}`,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflow: 'auto', maxHeight: 200, margin: 0,
            cursor: 'pointer', transition: 'border-color 0.15s',
          }}
        >
          {getEmbedCode()}
        </pre>
      </div>
    </div>
  );
}
