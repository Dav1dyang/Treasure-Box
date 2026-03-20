'use client';

import { useState, useCallback } from 'react';
import type { BoxConfig, EmbedSettings, EmbedMode, EmbedPadding } from '@/lib/types';
import { DEFAULT_EMBED_SETTINGS, DEFAULT_EMBED_PADDING } from '@/lib/types';

const BASE_W = 350;
const BASE_H = 300;

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
      : 'overlay',
    position: {
      anchor: rawSettings.position.anchor,
      offsetX: 'offsetX' in rawSettings.position
        ? rawSettings.position.offsetX
        : ((rawSettings.position as Record<string, number>).xPercent ?? 5) * 14,
      offsetY: 'offsetY' in rawSettings.position
        ? rawSettings.position.offsetY
        : ((rawSettings.position as Record<string, number>).yPercent ?? 5) * 9,
    },
  };

  const [copied, setCopied] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState(settings.previewUrl || '');
  const [aspectLocked, setAspectLocked] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(settings.width / settings.height);
  const [paddingExpanded, setPaddingExpanded] = useState(false);

  const embedScale = settings.embedScale ?? 1;
  const padding = settings.padding || { top: 0, right: 0, bottom: 0, left: 0 };

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

  const handleLoadUrl = useCallback(() => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      update({ previewUrl: '' });
      return;
    }
    let url = trimmed;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    update({ previewUrl: url });
  }, [urlInput, update]);

  const getEmbedCode = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const bg = encodeURIComponent(config.backgroundColor || 'transparent');

    if (settings.mode === 'contained') {
      const scaleParam = embedScale !== 1 ? `&scale=${embedScale}` : '';
      const padParams = [
        padding.top > 0 ? `&pt=${padding.top}` : '',
        padding.right > 0 ? `&pr=${padding.right}` : '',
        padding.bottom > 0 ? `&pb=${padding.bottom}` : '',
        padding.left > 0 ? `&pl=${padding.left}` : '',
      ].join('');
      return `<iframe\n  src="${baseUrl}/embed?box=${userId}&bg=${bg}${scaleParam}${padParams}"\n  width="${settings.width}" height="${settings.height}"\n  style="border:none;overflow:hidden"\n  loading="lazy"\n  allow="accelerometer"\n></iframe>`;
    }

    // overlay — use data-scale as the primary sizing attribute
    const domAttr = settings.domCollide ? `\n  data-dom-collide="true"` : '';
    const scaleAttr = embedScale !== 1 ? `\n  data-scale="${embedScale}"` : '';
    return `<script src="${baseUrl}/embed/widget.js"\n  data-box-id="${userId}"\n  data-mode="overlay"\n  data-bg="${config.backgroundColor || 'transparent'}"${scaleAttr}\n  data-anchor="${settings.position.anchor}"\n  data-offset-x="${settings.position.offsetX}" data-offset-y="${settings.position.offsetY}"${domAttr}>\n</script>`;
  };

  const handleCopy = () => {
    const code = getEmbedCode();
    navigator.clipboard.writeText(code);
    setCopied('embed');
    setTimeout(() => setCopied(null), 2000);
  };

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

      {/* Overlay: Preview Background URL */}
      {settings.mode === 'overlay' && (
        <div className="pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
          <label className="text-[10px] block mb-2 tracking-[0.12em]" style={S.faint}>preview background</label>
          <div className="flex gap-1">
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLoadUrl(); }}
              placeholder="paste your website URL (optional)"
              className="flex-1 bg-transparent text-[10px] px-2 py-[5px] outline-none"
              style={{ border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-fg-muted)' }}
            />
            <button
              onClick={handleLoadUrl}
              className="text-[9px] px-2 py-[5px] cursor-pointer shrink-0"
              style={{ border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-fg-faint)', background: 'transparent' }}
            >
              {settings.previewUrl ? 'reload' : 'load'}
            </button>
            {settings.previewUrl && (
              <button
                onClick={() => { setUrlInput(''); update({ previewUrl: '' }); }}
                className="text-[9px] px-1 py-[5px] cursor-pointer shrink-0"
                style={{ color: 'var(--tb-fg-ghost)', background: 'transparent', border: 'none' }}
              >
                ✕
              </button>
            )}
          </div>
          <p className="text-[8px] mt-1" style={S.ghost}>
            most sites block iframe embedding via X-Frame-Options headers — the wireframe placeholder shows instead. try sites without strict headers (codepen, jsfiddle, or your own domains).
          </p>
        </div>
      )}

      {/* Overlay: Widget Size (single proportional slider) */}
      {settings.mode === 'overlay' && (
        <div className="pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
          <label className="text-[10px] block mb-2 tracking-[0.12em]" style={S.faint}>widget size</label>
          <div className="flex items-center gap-2">
            <input
              type="range" min={0.5} max={2.0} step={0.1}
              value={embedScale}
              onChange={e => {
                const s = Number(e.target.value);
                update({
                  embedScale: s,
                  width: Math.round(BASE_W * s),
                  height: Math.round(BASE_H * s),
                });
              }}
              className="flex-1"
              style={{ accentColor: 'var(--tb-accent)' }}
            />
            <span className="text-[10px] w-10 text-right" style={S.accent}>
              {Math.round(embedScale * 100)}%
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[8px]" style={S.ghost}>{settings.width} × {settings.height}px</span>
          </div>
        </div>
      )}

      {/* Contained: Size Controls (keep existing width/height sliders) */}
      {settings.mode === 'contained' && (
        <div className="pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
          <label className="text-[10px] block mb-2 tracking-[0.12em]" style={S.faint}>embed size</label>
          <div className="flex gap-0 mb-3">
            {CONTAINED_SIZE_PRESETS.map((p, i) => {
              const active = settings.width === p.width && settings.height === p.height;
              return (
                <button
                  key={p.label}
                  onClick={() => { update({ width: p.width, height: p.height }); setAspectRatio(p.width / p.height); }}
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
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] w-5 shrink-0" style={S.ghost}>W</span>
            <input type="range" min={200} max={1200} step={10} value={settings.width}
              onChange={e => setWidth(Number(e.target.value))} className="flex-1"
              style={{ accentColor: 'var(--tb-accent)' }} />
            <input type="number" min={200} max={1200} step={10} value={settings.width}
              onChange={e => setWidth(Number(e.target.value))}
              className="w-16 bg-transparent text-[10px] p-1 text-right outline-none"
              style={{ border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-accent)' }} />
            <span className="text-[9px]" style={S.ghost}>px</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] w-5 shrink-0" style={S.ghost}>H</span>
            <input type="range" min={200} max={1200} step={10} value={settings.height}
              onChange={e => setHeight(Number(e.target.value))} className="flex-1"
              style={{ accentColor: 'var(--tb-accent)' }} />
            <input type="number" min={200} max={1200} step={10} value={settings.height}
              onChange={e => setHeight(Number(e.target.value))}
              className="w-16 bg-transparent text-[10px] p-1 text-right outline-none"
              style={{ border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-accent)' }} />
            <span className="text-[9px]" style={S.ghost}>px</span>
          </div>
          <button
            onClick={() => { if (!aspectLocked) setAspectRatio(settings.width / settings.height); setAspectLocked(!aspectLocked); }}
            className="flex items-center gap-[6px] cursor-pointer text-[9px] mt-1"
            style={aspectLocked ? S.accent : S.ghost}
          >
            <span>{aspectLocked ? '=' : '~'}</span>
            <span>{aspectLocked ? 'aspect locked' : 'lock aspect ratio'}</span>
          </button>
        </div>
      )}

      {/* Contained: Padding Controls */}
      {settings.mode === 'contained' && (
        <div className="pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
          <label className="text-[10px] block mb-2 tracking-[0.12em]" style={S.faint}>padding</label>
          {/* Uniform slider */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] w-8 shrink-0" style={S.ghost}>all</span>
            <input type="range" min={0} max={60} step={2}
              value={padding.top}
              onChange={e => {
                const v = Number(e.target.value);
                update({ padding: { top: v, right: v, bottom: v, left: v } });
              }}
              className="flex-1"
              style={{ accentColor: 'var(--tb-accent)' }} />
            <span className="text-[10px] w-10 text-right" style={S.accent}>{padding.top}px</span>
          </div>
          {/* Expand toggle */}
          <button
            onClick={() => setPaddingExpanded(!paddingExpanded)}
            className="flex items-center gap-[6px] cursor-pointer text-[9px] mt-1 mb-2"
            style={paddingExpanded ? S.accent : S.ghost}
          >
            <span>{paddingExpanded ? '▾' : '▸'}</span>
            <span>individual sides</span>
          </button>
          {/* Individual sliders */}
          {paddingExpanded && (
            <div className="space-y-2 mt-2">
              {(['top', 'right', 'bottom', 'left'] as const).map(side => (
                <div key={side} className="flex items-center gap-2">
                  <span className="text-[9px] w-8 shrink-0" style={S.ghost}>{side[0].toUpperCase()}</span>
                  <input type="range" min={0} max={60} step={2}
                    value={padding[side]}
                    onChange={e => update({ padding: { ...padding, [side]: Number(e.target.value) } })}
                    className="flex-1"
                    style={{ accentColor: 'var(--tb-accent)' }} />
                  <span className="text-[10px] w-10 text-right" style={S.accent}>{padding[side]}px</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[8px] mt-1" style={S.ghost}>
            inset from iframe edges — items bounce within the padded area
          </p>
        </div>
      )}

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
