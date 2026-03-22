'use client';

import { useState, useCallback } from 'react';
import type { BoxConfig, EmbedSettings, EmbedMode, AnchorCorner } from '@/lib/types';
import { DEFAULT_EMBED_SETTINGS } from '@/lib/types';
import WebsitePreview from './WebsitePreview';

const SIZE_PRESETS = [
  { label: 'S', width: 300, height: 300 },
  { label: 'M', width: 500, height: 500 },
  { label: 'L', width: 700, height: 700 },
  { label: 'Wide', width: 800, height: 500 },
] as const;

const MODES: { mode: EmbedMode; label: string; desc: string; icon: string }[] = [
  { mode: 'contained', label: 'contained', desc: 'fits inside a sized container', icon: '▣' },
  { mode: 'floating', label: 'floating', desc: 'fixed-position widget overlay', icon: '◳' },
  { mode: 'fullpage', label: 'full-page', desc: 'items fly across the page', icon: '✦' },
];

const CORNERS: { corner: AnchorCorner; label: string; pos: string }[] = [
  { corner: 'top-left', label: '◤', pos: 'top-0 left-0' },
  { corner: 'top-right', label: '◥', pos: 'top-0 right-0' },
  { corner: 'bottom-left', label: '◣', pos: 'bottom-0 left-0' },
  { corner: 'bottom-right', label: '◢', pos: 'bottom-0 right-0' },
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
  const settings = config.embedSettings || DEFAULT_EMBED_SETTINGS;
  const [copied, setCopied] = useState<string | null>(null);
  const [aspectLocked, setAspectLocked] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(settings.width / settings.height);

  const update = useCallback((patch: Partial<EmbedSettings>) => {
    onSettingsChange({ ...settings, ...patch });
  }, [settings, onSettingsChange]);

  const updatePosition = useCallback((patch: Partial<typeof settings.position>) => {
    update({ position: { ...settings.position, ...patch } });
  }, [settings.position, update]);

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

    const scale = config.contentScale ?? 1;
    const scaleParam = scale !== 1 ? `&scale=${scale}` : '';
    const scaleAttr = scale !== 1 ? `\n  data-scale="${scale}"` : '';

    if (settings.mode === 'contained') {
      return `<iframe\n  src="${baseUrl}/embed?box=${userId}&bg=${bg}${scaleParam}"\n  width="${settings.width}" height="${settings.height}"\n  style="border:none;overflow:hidden"\n  loading="lazy"\n  allow="accelerometer"\n></iframe>`;
    }

    if (settings.mode === 'floating') {
      return `<script src="${baseUrl}/embed/widget.js"\n  data-box-id="${userId}"\n  data-mode="floating"\n  data-bg="${config.backgroundColor || 'transparent'}"\n  data-width="${settings.width}" data-height="${settings.height}"\n  data-anchor="${settings.position.anchor}"\n  data-offset-x="${settings.position.xPercent}" data-offset-y="${settings.position.yPercent}"${scaleAttr}>\n</script>`;
    }

    // fullpage
    return `<script src="${baseUrl}/embed/widget.js"\n  data-box-id="${userId}"\n  data-mode="fullpage"\n  data-bg="${config.backgroundColor || 'transparent'}"\n  data-width="${settings.width}" data-height="${settings.height}"\n  data-pin-anchor="${settings.position.anchor}"\n  data-pin-x="${settings.position.xPercent}" data-pin-y="${settings.position.yPercent}"${scaleAttr}>\n</script>`;
  };

  const handleCopy = () => {
    const code = getEmbedCode();
    navigator.clipboard.writeText(code);
    setCopied('embed');
    setTimeout(() => setCopied(null), 2000);
  };

  const showSizeControls = settings.mode === 'contained' || settings.mode === 'floating';
  const showPositionControls = settings.mode === 'floating' || settings.mode === 'fullpage';
  const showWebsitePreview = settings.mode === 'fullpage';

  return (
    <div className="space-y-5">
      {/* Mode Selector */}
      <div>
        <label className="text-[12px] block mb-2 tracking-[0.12em]" style={S.faint}>embed mode</label>
        <div className="grid grid-cols-3 gap-2">
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
              <div className="text-[14px] tracking-[0.08em]" style={settings.mode === m.mode ? S.accent : S.faint}>{m.label}</div>
              <div className="text-[11px] mt-[2px]" style={S.ghost}>{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Size Controls */}
      {showSizeControls && (
        <div className="pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
          <label className="text-[12px] block mb-2 tracking-[0.12em]" style={S.faint}>size</label>

          {/* Presets */}
          <div className="flex gap-0 mb-3">
            {SIZE_PRESETS.map((p, i) => {
              const active = settings.width === p.width && settings.height === p.height;
              return (
                <button
                  key={p.label}
                  onClick={() => {
                    update({ width: p.width, height: p.height });
                    setAspectRatio(p.width / p.height);
                  }}
                  className="text-[14px] px-4 py-2 border cursor-pointer transition-all"
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
            <span className="text-[12px] w-5 shrink-0" style={S.ghost}>W</span>
            <input
              type="range" min={200} max={1200} step={10}
              value={settings.width}
              onChange={e => setWidth(Number(e.target.value))}
              className="flex-1"
              style={{ accentColor: 'var(--tb-accent)' }}
            />
            <input
              type="number" min={200} max={1200} step={10}
              value={settings.width}
              onChange={e => setWidth(Number(e.target.value))}
              className="w-16 bg-transparent text-[14px] p-1 text-right outline-none"
              style={{ border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-accent)' }}
            />
            <span className="text-[12px]" style={S.ghost}>px</span>
          </div>

          {/* Height Slider */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[12px] w-5 shrink-0" style={S.ghost}>H</span>
            <input
              type="range" min={200} max={1200} step={10}
              value={settings.height}
              onChange={e => setHeight(Number(e.target.value))}
              className="flex-1"
              style={{ accentColor: 'var(--tb-accent)' }}
            />
            <input
              type="number" min={200} max={1200} step={10}
              value={settings.height}
              onChange={e => setHeight(Number(e.target.value))}
              className="w-16 bg-transparent text-[14px] p-1 text-right outline-none"
              style={{ border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-accent)' }}
            />
            <span className="text-[12px]" style={S.ghost}>px</span>
          </div>

          {/* Aspect Lock */}
          <button
            onClick={() => {
              if (!aspectLocked) setAspectRatio(settings.width / settings.height);
              setAspectLocked(!aspectLocked);
            }}
            className="flex items-center gap-2 cursor-pointer text-[12px] mt-1"
            style={aspectLocked ? S.accent : S.ghost}
          >
            <span>{aspectLocked ? '🔗' : '⛓️‍💥'}</span>
            <span>{aspectLocked ? 'aspect locked' : 'lock aspect ratio'}</span>
          </button>
        </div>
      )}

      {/* Position Controls */}
      {showPositionControls && (
        <div className="pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
          <label className="text-[12px] block mb-2 tracking-[0.12em]" style={S.faint}>
            {settings.mode === 'floating' ? 'position' : 'pin position'}
          </label>

          {/* Corner Selector */}
          <div className="relative w-[120px] h-[80px] mb-3" style={{ border: '1px solid var(--tb-border-subtle)', background: 'var(--tb-bg-muted)' }}>
            {CORNERS.map(c => (
              <button
                key={c.corner}
                onClick={() => updatePosition({ anchor: c.corner })}
                className={`absolute ${c.pos} w-7 h-7 flex items-center justify-center cursor-pointer transition-all text-[12px]`}
                style={{
                  color: settings.position.anchor === c.corner ? 'var(--tb-accent)' : 'var(--tb-fg-ghost)',
                  background: settings.position.anchor === c.corner ? 'var(--tb-bg)' : 'transparent',
                }}
                title={c.corner}
              >
                {c.label}
              </button>
            ))}
            <div className="absolute inset-0 flex items-center justify-center text-[11px]" style={S.ghost}>
              click corner
            </div>
          </div>

          {/* Offset Sliders */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[12px] w-5 shrink-0" style={S.ghost}>X</span>
            <input
              type="range" min={0} max={50} step={1}
              value={settings.position.xPercent}
              onChange={e => updatePosition({ xPercent: Number(e.target.value) })}
              className="flex-1"
              style={{ accentColor: 'var(--tb-accent)' }}
            />
            <span className="text-[14px] min-w-[32px] text-right" style={S.faint}>{settings.position.xPercent}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] w-5 shrink-0" style={S.ghost}>Y</span>
            <input
              type="range" min={0} max={50} step={1}
              value={settings.position.yPercent}
              onChange={e => updatePosition({ yPercent: Number(e.target.value) })}
              className="flex-1"
              style={{ accentColor: 'var(--tb-accent)' }}
            />
            <span className="text-[14px] min-w-[32px] text-right" style={S.faint}>{settings.position.yPercent}%</span>
          </div>
          <p className="text-[11px] mt-2" style={S.ghost}>
            offset from {settings.position.anchor} corner — adapts to window size
          </p>
        </div>
      )}

      {/* Website Preview (Full-page mode) */}
      {showWebsitePreview && (
        <div className="pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
          <label className="text-[12px] block mb-2 tracking-[0.12em]" style={S.faint}>website preview — click to pin</label>
          <WebsitePreview
            url={settings.previewUrl || ''}
            onUrlChange={url => update({ previewUrl: url })}
            pinPosition={settings.position}
            onPinChange={pos => update({ position: pos })}
            boxWidth={settings.width}
            boxHeight={settings.height}
          />

          {/* Size controls for fullpage mode */}
          <label className="text-[10px] block mb-2 mt-4 tracking-[0.12em]" style={S.faint}>box size</label>
          <div className="flex gap-0 mb-3">
            {SIZE_PRESETS.map((p, i) => {
              const active = settings.width === p.width && settings.height === p.height;
              return (
                <button
                  key={p.label}
                  onClick={() => update({ width: p.width, height: p.height })}
                  className="text-[14px] px-4 py-2 border cursor-pointer transition-all"
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
        </div>
      )}

      {/* TODO: Drawer display size controls.
         BoxConfig.drawerDisplaySize stores the fixed pixel frame size for the
         AI-generated drawer (default 420×280). Add W/H sliders here so users
         can adjust the drawer render size independently of the embed container.
         The activeArea from DrawerImages can inform a "fit to content" preset
         that auto-calculates optimal display size from the sprite's actual
         non-transparent pixel bounds. */}

      {/* Embed Code Output */}
      <div>
        <label className="text-[10px] block mb-[6px] tracking-[0.12em]" style={S.faint}>
          {settings.mode === 'contained' ? 'iframe embed code' : 'script embed code'}
        </label>
        <pre
          className="p-3 text-[12px] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed"
          style={{ background: 'var(--tb-bg-muted)', color: 'var(--tb-fg-muted)' }}
        >
          {getEmbedCode()}
        </pre>
        <button
          onClick={handleCopy}
          className="mt-[6px] text-[12px] px-4 py-2 cursor-pointer transition-colors"
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
