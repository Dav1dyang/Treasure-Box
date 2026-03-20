'use client';

import { useState, useCallback } from 'react';
import type { BoxConfig, EmbedSettings, EmbedMode } from '@/lib/types';
import { DEFAULT_EMBED_SETTINGS } from '@/lib/types';
import OverlayPositioner from './OverlayPositioner';

const OVERLAY_SIZE_PRESETS = [
  { label: 'S', width: 250, height: 220 },
  { label: 'M', width: 350, height: 300 },
  { label: 'L', width: 450, height: 380 },
] as const;

const CONTAINED_SIZE_PRESETS = [
  { label: 'S', width: 300, height: 300 },
  { label: 'M', width: 500, height: 500 },
  { label: 'L', width: 700, height: 700 },
  { label: 'Wide', width: 800, height: 500 },
] as const;

const MODES: { mode: EmbedMode; label: string; desc: string; icon: string }[] = [
  { mode: 'overlay', label: 'overlay', desc: 'items fly across the page', icon: '✦' },
  { mode: 'contained', label: 'iframe', desc: 'fits inside a sized container', icon: '▣' },
];

const S = {
  accent: { color: 'var(--tb-accent)' },
  faint: { color: 'var(--tb-fg-faint)' },
  ghost: { color: 'var(--tb-fg-ghost)' },
  muted: { color: 'var(--tb-fg-muted)' },
};

interface Props {
  config: BoxConfig;
  userId: string;
  onSettingsChange: (settings: EmbedSettings) => void;
}

export default function EmbedConfigurator({ config, userId, onSettingsChange }: Props) {
  // Migrate legacy modes to new types
  const rawSettings = config.embedSettings || DEFAULT_EMBED_SETTINGS;
  const settings: EmbedSettings = {
    ...rawSettings,
    mode: (rawSettings.mode === 'overlay' || rawSettings.mode === 'contained')
      ? rawSettings.mode
      : 'overlay', // floating/fullpage → overlay
    position: {
      anchor: rawSettings.position.anchor,
      offsetX: 'offsetX' in rawSettings.position
        ? rawSettings.position.offsetX
        : ((rawSettings.position as Record<string, number>).xPercent ?? 5) * 14, // rough px conversion
      offsetY: 'offsetY' in rawSettings.position
        ? rawSettings.position.offsetY
        : ((rawSettings.position as Record<string, number>).yPercent ?? 5) * 9,
    },
  };

  const [copied, setCopied] = useState<string | null>(null);
  const [aspectLocked, setAspectLocked] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(settings.width / settings.height);

  const update = useCallback((patch: Partial<EmbedSettings>) => {
    onSettingsChange({ ...settings, ...patch });
  }, [settings, onSettingsChange]);

  const setWidth = useCallback((w: number) => {
    const clamped = Math.max(200, Math.min(1200, w));
    if (aspectLocked) {
      update({ width: clamped, height: Math.round(clamped / aspectRatio) });
    } else {
      update({ width: clamped });
    }
  }, [aspectLocked, aspectRatio, update]);

  const setHeight = useCallback((h: number) => {
    const clamped = Math.max(200, Math.min(1200, h));
    if (aspectLocked) {
      update({ width: Math.round(clamped * aspectRatio), height: clamped });
    } else {
      update({ height: clamped });
    }
  }, [aspectLocked, aspectRatio, update]);

  const getEmbedCode = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const bg = encodeURIComponent(config.backgroundColor || 'transparent');

    if (settings.mode === 'contained') {
      return `<iframe\n  src="${baseUrl}/embed?box=${userId}&bg=${bg}"\n  width="${settings.width}" height="${settings.height}"\n  style="border:none;overflow:hidden"\n  loading="lazy"\n  allow="accelerometer"\n></iframe>`;
    }

    // overlay
    const domAttr = settings.domCollide ? `\n  data-dom-collide="true"` : '';
    return `<script src="${baseUrl}/embed/widget.js"\n  data-box-id="${userId}"\n  data-mode="overlay"\n  data-bg="${config.backgroundColor || 'transparent'}"\n  data-width="${settings.width}" data-height="${settings.height}"\n  data-anchor="${settings.position.anchor}"\n  data-offset-x="${settings.position.offsetX}" data-offset-y="${settings.position.offsetY}"${domAttr}>\n</script>`;
  };

  const handleCopy = () => {
    const code = getEmbedCode();
    navigator.clipboard.writeText(code);
    setCopied('embed');
    setTimeout(() => setCopied(null), 2000);
  };

  const sizePresets = settings.mode === 'overlay' ? OVERLAY_SIZE_PRESETS : CONTAINED_SIZE_PRESETS;

  return (
    <div className="space-y-5">
      {/* Mode Toggle */}
      <div>
        <label className="text-[10px] block mb-2 tracking-[0.12em]" style={S.faint}>embed mode</label>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map(m => (
            <button
              key={m.mode}
              onClick={() => update({ mode: m.mode })}
              className="p-3 text-left border cursor-pointer transition-all"
              style={{
                borderColor: settings.mode === m.mode ? 'var(--tb-accent)' : 'var(--tb-border-subtle)',
                background: settings.mode === m.mode ? 'var(--tb-bg-muted)' : 'transparent',
              }}
            >
              <div className="text-[14px] mb-1">{m.icon}</div>
              <div className="text-[10px] tracking-[0.08em]" style={settings.mode === m.mode ? S.accent : S.faint}>{m.label}</div>
              <div className="text-[8px] mt-[2px]" style={S.ghost}>{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Overlay Mode: Drag Positioner */}
      {settings.mode === 'overlay' && (
        <div className="pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
          <label className="text-[10px] block mb-2 tracking-[0.12em]" style={S.faint}>position on page</label>
          <OverlayPositioner
            position={settings.position}
            boxWidth={settings.width}
            boxHeight={settings.height}
            onPositionChange={pos => update({ position: pos })}
          />
        </div>
      )}

      {/* Size Controls */}
      <div className="pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
        <label className="text-[10px] block mb-2 tracking-[0.12em]" style={S.faint}>
          {settings.mode === 'overlay' ? 'drawer size' : 'embed size'}
        </label>

        {/* Presets */}
        <div className="flex gap-0 mb-3">
          {sizePresets.map((p, i) => {
            const active = settings.width === p.width && settings.height === p.height;
            return (
              <button
                key={p.label}
                onClick={() => {
                  update({ width: p.width, height: p.height });
                  setAspectRatio(p.width / p.height);
                }}
                className="text-[10px] px-[14px] py-[6px] border cursor-pointer transition-all"
                style={{
                  borderColor: active ? 'var(--tb-accent)' : 'var(--tb-border-subtle)',
                  color: active ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
                  borderLeftWidth: i === 0 ? 1 : 0,
                  background: 'transparent',
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Width Slider */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] w-5 shrink-0" style={S.ghost}>W</span>
          <input
            type="range" min={200} max={settings.mode === 'overlay' ? 600 : 1200} step={10}
            value={settings.width}
            onChange={e => setWidth(Number(e.target.value))}
            className="flex-1"
            style={{ accentColor: 'var(--tb-accent)' }}
          />
          <input
            type="number" min={200} max={settings.mode === 'overlay' ? 600 : 1200} step={10}
            value={settings.width}
            onChange={e => setWidth(Number(e.target.value))}
            className="w-16 bg-transparent text-[10px] p-1 text-right outline-none"
            style={{ border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-accent)' }}
          />
          <span className="text-[9px]" style={S.ghost}>px</span>
        </div>

        {/* Height Slider */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] w-5 shrink-0" style={S.ghost}>H</span>
          <input
            type="range" min={200} max={settings.mode === 'overlay' ? 600 : 1200} step={10}
            value={settings.height}
            onChange={e => setHeight(Number(e.target.value))}
            className="flex-1"
            style={{ accentColor: 'var(--tb-accent)' }}
          />
          <input
            type="number" min={200} max={settings.mode === 'overlay' ? 600 : 1200} step={10}
            value={settings.height}
            onChange={e => setHeight(Number(e.target.value))}
            className="w-16 bg-transparent text-[10px] p-1 text-right outline-none"
            style={{ border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-accent)' }}
          />
          <span className="text-[9px]" style={S.ghost}>px</span>
        </div>

        {/* Aspect Lock (contained only) */}
        {settings.mode === 'contained' && (
          <button
            onClick={() => {
              if (!aspectLocked) setAspectRatio(settings.width / settings.height);
              setAspectLocked(!aspectLocked);
            }}
            className="flex items-center gap-[6px] cursor-pointer text-[9px] mt-1"
            style={aspectLocked ? S.accent : S.ghost}
          >
            <span>{aspectLocked ? '=' : '~'}</span>
            <span>{aspectLocked ? 'aspect locked' : 'lock aspect ratio'}</span>
          </button>
        )}
      </div>

      {/* DOM Collision Toggle (overlay only) */}
      {settings.mode === 'overlay' && (
        <div className="pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
          <button
            onClick={() => update({ domCollide: !settings.domCollide })}
            className="flex items-center gap-2 cursor-pointer text-[10px]"
            style={settings.domCollide ? S.accent : S.faint}
          >
            <span
              className="w-4 h-4 flex items-center justify-center border text-[9px]"
              style={{
                borderColor: settings.domCollide ? 'var(--tb-accent)' : 'var(--tb-border-subtle)',
                background: settings.domCollide ? 'var(--tb-accent)' : 'transparent',
                color: settings.domCollide ? 'var(--tb-bg)' : 'transparent',
              }}
            >
              {settings.domCollide ? '×' : ''}
            </span>
            items collide with page elements
          </button>
          <p className="text-[8px] mt-1 ml-6" style={S.ghost}>
            items bounce off headings, images, and other DOM elements
          </p>
        </div>
      )}

      {/* Embed Code Output */}
      <div>
        <label className="text-[10px] block mb-[6px] tracking-[0.12em]" style={S.faint}>
          {settings.mode === 'contained' ? 'iframe embed code' : 'script embed code'}
        </label>
        <pre
          className="p-3 text-[9px] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed"
          style={{ background: 'var(--tb-bg-muted)', color: 'var(--tb-fg-muted)' }}
        >
          {getEmbedCode()}
        </pre>
        <button
          onClick={handleCopy}
          className="mt-[6px] text-[9px] px-3 py-1 cursor-pointer transition-colors"
          style={{
            border: '1px solid var(--tb-border)',
            color: copied === 'embed' ? 'var(--tb-accent)' : 'var(--tb-fg-muted)',
          }}
        >
          {copied === 'embed' ? 'copied ✓' : 'copy'}
        </button>
      </div>
    </div>
  );
}
