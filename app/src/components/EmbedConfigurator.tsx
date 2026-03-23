'use client';

import { useState, useCallback, useRef } from 'react';
import type { BoxConfig, EmbedSettings, AnchorCorner } from '@/lib/types';
import { DEFAULT_EMBED_SETTINGS } from '@/lib/config';
import { uploadProcessedImage } from '@/lib/firestore';

const CORNERS: { anchor: AnchorCorner; label: string }[] = [
  { anchor: 'top-left', label: 'TL' },
  { anchor: 'top-right', label: 'TR' },
  { anchor: 'bottom-left', label: 'BL' },
  { anchor: 'bottom-right', label: 'BR' },
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
  onScaleChange?: (scale: number) => void;
}

export default function EmbedConfigurator({ config, userId, onSettingsChange, onScaleChange }: Props) {
  const rawSettings = config.embedSettings || DEFAULT_EMBED_SETTINGS;
  const settings: EmbedSettings = {
    ...rawSettings,
    position: rawSettings.position || DEFAULT_EMBED_SETTINGS.position,
  };

  const [copied, setCopied] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState(settings.previewUrl || '');
  const [uploading, setUploading] = useState(false);
  const [offsetsLinked, setOffsetsLinked] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewTab = settings.previewMode || (settings.previewUrl ? 'url' : 'screenshot');

  const embedScale = config.boxScale ?? 1;

  const update = useCallback((patch: Partial<EmbedSettings>) => {
    onSettingsChange({ ...settings, ...patch });
  }, [settings, onSettingsChange]);

  const handleLoadUrl = useCallback(() => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      update({ previewUrl: '', previewMode: undefined });
      return;
    }
    let url = trimmed;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    update({ previewUrl: url, previewMode: 'url' });
  }, [urlInput, update]);

  const handleScreenshotUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const bitmap = await createImageBitmap(file);
      const maxW = 1440;
      const scale = bitmap.width > maxW ? maxW / bitmap.width : 1;
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.7)
      );
      const url = await uploadProcessedImage(userId, blob, 'preview-screenshot.jpg');
      update({ previewImageUrl: url, previewMode: 'screenshot' });
    } catch (err) {
      console.error('Screenshot upload failed:', err);
    } finally {
      setUploading(false);
    }
  }, [userId, update]);

  const getEmbedCode = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const bg = config.backgroundColor || 'transparent';
    const anchor = settings.position.anchor;
    const ox = settings.position.offsetX;
    const oy = settings.position.offsetY;
    const domAttr = settings.domCollide ? `\n  data-dom-collide="true"` : '';
    const scaleAttr = embedScale !== 1 ? `\n  data-scale="${embedScale}"` : '';

    // Encode config in: (1) companion div data-attrs, (2) URL path, (3) query
    // params, (4) hash fragment, (5) script data-attrs. Platforms like Cargo
    // proxy scripts through their own CDN and strip all script attributes/params,
    // so the companion div is the most resilient carrier.
    const params = new URLSearchParams();
    params.set('box-id', userId);
    params.set('mode', 'overlay');
    params.set('bg', bg);
    if (embedScale !== 1) params.set('scale', String(embedScale));
    params.set('anchor', anchor);
    params.set('offset-x', String(ox));
    params.set('offset-y', String(oy));
    if (settings.domCollide) params.set('dom-collide', 'true');
    const paramStr = params.toString();
    const srcUrl = `${baseUrl}/embed/b/${encodeURIComponent(userId)}/widget.js?${paramStr}#${paramStr}`;

    // Companion div: survives platforms that rewrite/proxy script URLs
    const domCollideDiv = settings.domCollide ? `\n  data-dom-collide="true"` : '';
    const scaleDiv = embedScale !== 1 ? `\n  data-scale="${embedScale}"` : '';
    const configDiv = `<div id="treasure-box-embed"\n  data-box-id="${userId}"\n  data-origin="${baseUrl}"\n  data-mode="overlay"\n  data-bg="${bg}"${scaleDiv}\n  data-anchor="${anchor}"\n  data-offset-x="${ox}" data-offset-y="${oy}"${domCollideDiv}\n  style="display:none">\n</div>`;

    return `${configDiv}\n<script src="${srcUrl}"\n  data-box-id="${userId}"\n  data-mode="overlay"\n  data-bg="${bg}"${scaleAttr}\n  data-anchor="${anchor}"\n  data-offset-x="${ox}" data-offset-y="${oy}"${domAttr}>\n</script>`;
  };

  const handleCopy = () => {
    const code = getEmbedCode();
    navigator.clipboard.writeText(code);
    setCopied('embed');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Preview Background (screenshot upload + live URL tabs) */}
      <div className="pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
        <label className="text-[10px] block mb-2 tracking-[0.12em]" style={S.faint}>preview background</label>
        <div className="flex gap-0 mb-3">
          {([
            { id: 'screenshot' as const, label: 'screenshot' },
            { id: 'url' as const, label: 'live url' },
          ]).map((t, i) => {
            const active = previewTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => update({ previewMode: t.id })}
                className="text-[10px] px-[14px] py-[6px] border cursor-pointer transition-all"
                style={{
                  borderColor: active ? 'var(--tb-accent)' : 'var(--tb-border-subtle)',
                  color: active ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
                  borderLeftWidth: i === 0 ? 1 : 0,
                  background: 'transparent',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Screenshot tab */}
        {previewTab === 'screenshot' && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleScreenshotUpload(f);
                e.target.value = '';
              }}
            />
            {settings.previewImageUrl ? (
              <div className="flex items-center gap-2">
                <img
                  src={settings.previewImageUrl}
                  alt="Preview screenshot"
                  className="h-[48px] object-cover border"
                  style={{ borderColor: 'var(--tb-border-subtle)' }}
                />
                <span className="text-[9px] flex-1" style={S.muted}>screenshot loaded</span>
                <button
                  onClick={() => update({ previewImageUrl: undefined, previewMode: undefined })}
                  className="text-[9px] px-1 py-[5px] cursor-pointer shrink-0"
                  style={{ color: 'var(--tb-fg-ghost)', background: 'transparent', border: 'none' }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full text-[10px] px-3 py-2 cursor-pointer transition-all"
                style={{
                  border: '1px dashed var(--tb-border-subtle)',
                  color: 'var(--tb-fg-faint)',
                  background: 'transparent',
                }}
              >
                {uploading ? 'uploading...' : 'upload screenshot'}
              </button>
            )}
            <p className="text-[8px] mt-1" style={S.ghost}>
              take a screenshot of your site and upload it here — works with any website
            </p>
          </div>
        )}

        {/* Live URL tab */}
        {previewTab === 'url' && (
          <div>
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
                  onClick={() => { setUrlInput(''); update({ previewUrl: '', previewMode: undefined }); }}
                  className="text-[9px] px-1 py-[5px] cursor-pointer shrink-0"
                  style={{ color: 'var(--tb-fg-ghost)', background: 'transparent', border: 'none' }}
                >
                  ✕
                </button>
              )}
            </div>
            <p className="text-[8px] mt-1" style={S.ghost}>
              most sites block iframe embedding — if your site doesn&apos;t load, try the screenshot tab instead
            </p>
          </div>
        )}
      </div>

      {/* Widget Size */}
      <div className="pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
        <label className="text-[10px] block mb-2 tracking-[0.12em]" style={S.faint}>widget size</label>
        <div className="flex items-center gap-2">
          <input
            type="range" min={0.5} max={2.0} step={0.1}
            value={embedScale}
            onChange={e => {
              const s = Number(e.target.value);
              if (onScaleChange) onScaleChange(s);
            }}
            className="flex-1"
            style={{ accentColor: 'var(--tb-accent)' }}
          />
          <span className="text-[10px] w-10 text-right" style={S.accent}>
            {Math.round(embedScale * 100)}%
          </span>
        </div>
      </div>

      {/* Position Controls (corner picker + offset sliders) */}
      <div className="pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
        <label className="text-[10px] block mb-2 tracking-[0.12em]" style={S.faint}>position</label>
        {/* 2x2 Corner Grid */}
        <div className="grid grid-cols-2 gap-1 mb-3" style={{ maxWidth: 160 }}>
          {CORNERS.map(c => {
            const active = settings.position.anchor === c.anchor;
            return (
              <button
                key={c.anchor}
                onClick={() => update({ position: { ...settings.position, anchor: c.anchor } })}
                className="text-[10px] px-[10px] py-[5px] border cursor-pointer transition-all"
                style={{
                  borderColor: active ? 'var(--tb-accent)' : 'var(--tb-border-subtle)',
                  color: active ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
                  background: active ? 'var(--tb-bg-muted)' : 'transparent',
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        {/* X offset slider */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] w-5 shrink-0" style={S.ghost}>X</span>
          <input type="range" min={0} max={200} step={4}
            value={settings.position.offsetX}
            onChange={e => {
              const v = Number(e.target.value);
              update({
                position: {
                  ...settings.position,
                  offsetX: v,
                  ...(offsetsLinked ? { offsetY: v } : {}),
                },
              });
            }}
            className="flex-1"
            style={{ accentColor: 'var(--tb-accent)' }} />
          <input type="number" min={0} max={200} step={4}
            value={settings.position.offsetX}
            onChange={e => {
              const v = Math.max(0, Math.min(200, Number(e.target.value)));
              update({
                position: {
                  ...settings.position,
                  offsetX: v,
                  ...(offsetsLinked ? { offsetY: v } : {}),
                },
              });
            }}
            className="w-14 bg-transparent text-[10px] p-1 text-right outline-none"
            style={{ border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-accent)' }} />
          <span className="text-[9px]" style={S.ghost}>px</span>
        </div>
        {/* Y offset slider */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] w-5 shrink-0" style={S.ghost}>Y</span>
          <input type="range" min={0} max={200} step={4}
            value={settings.position.offsetY}
            onChange={e => {
              const v = Number(e.target.value);
              update({
                position: {
                  ...settings.position,
                  offsetY: v,
                  ...(offsetsLinked ? { offsetX: v } : {}),
                },
              });
            }}
            className="flex-1"
            style={{ accentColor: 'var(--tb-accent)' }} />
          <input type="number" min={0} max={200} step={4}
            value={settings.position.offsetY}
            onChange={e => {
              const v = Math.max(0, Math.min(200, Number(e.target.value)));
              update({
                position: {
                  ...settings.position,
                  offsetY: v,
                  ...(offsetsLinked ? { offsetX: v } : {}),
                },
              });
            }}
            className="w-14 bg-transparent text-[10px] p-1 text-right outline-none"
            style={{ border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-accent)' }} />
          <span className="text-[9px]" style={S.ghost}>px</span>
        </div>
        {/* Link toggle */}
        <button
          onClick={() => setOffsetsLinked(!offsetsLinked)}
          className="flex items-center gap-[6px] cursor-pointer text-[9px] mt-1"
          style={offsetsLinked ? S.accent : S.ghost}
        >
          <span>{offsetsLinked ? '=' : '~'}</span>
          <span>{offsetsLinked ? 'offsets linked' : 'link offsets'}</span>
        </button>
        <p className="text-[8px] mt-1" style={S.ghost}>
          distance from the chosen corner — also drag in preview
        </p>
      </div>

      {/* DOM Collision Toggle */}
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

      {/* Embed Code Output */}
      <div>
        <label className="text-[10px] block mb-[6px] tracking-[0.12em]" style={S.faint}>
          embed code
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
