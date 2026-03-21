'use client';

import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  getBoxConfig, saveBoxConfig,
  getItems, saveItem,
  uploadImage, uploadProcessedImage,
  clearDrawerImages, deleteItemWithCleanup, deleteBox,
} from '@/lib/firestore';
import type { TreasureItem, BoxConfig, SoundPreset, DrawerImages, EmbedSettings, AnchorCorner } from '@/lib/types';
import { DEFAULT_EMBED_SETTINGS, DEFAULT_BOX_CONFIG, getEmbedDimensions } from '@/lib/config';
import TreasureBox from '@/components/TreasureBox';
import DrawerStylePicker from '@/components/DrawerStylePicker';
import LoadingAnimation from '@/components/LoadingAnimation';
import { extractContourFromImage } from '@/lib/contour';
import EmbedConfigurator from '@/components/EmbedConfigurator';
import { computeDrawerPosition, computeSpawnOrigin, computeCenteredDrawerPosition, computeCenteredSpawnOrigin, positionFromPointer } from '@/lib/embedPosition';

const SOUND_PRESETS: SoundPreset[] = ['metallic', 'wooden', 'glass', 'paper', 'pixel', 'clay', 'silent'];
function VolumeBar({ volume, onChange }: { volume: number; onChange: (v: number) => void }) {
  const steps = 10;
  const filled = Math.round(volume * steps);
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-[3px] items-end">
        {Array.from({ length: steps }, (_, i) => (
          <button
            key={i}
            onClick={() => onChange((i + 1) / steps)}
            className="cursor-pointer border transition-all"
            style={{
              width: 14, height: 6 + i * 2,
              background: i < filled ? 'var(--tb-accent)' : 'var(--tb-bg-muted)',
              borderColor: i < filled ? 'var(--tb-accent)' : 'var(--tb-border-subtle)',
            }}
          />
        ))}
      </div>
      <span className="text-[10px] min-w-[28px]" style={{ color: 'var(--tb-fg-faint)' }}>
        {Math.round(volume * 100)}%
      </span>
    </div>
  );
}

function Slider({ value, min, max, step, label, format, onChange, snap }: {
  value: number; min: number; max: number; step: number;
  label: string; format: (v: number) => string;
  onChange: (v: number) => void;
  snap?: (v: number) => number;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[9px] w-[28px] shrink-0" style={{ color: 'var(--tb-fg-faint)' }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => {
          let v = parseFloat(e.target.value);
          onChange(snap ? snap(v) : v);
        }}
        className="tb-slider flex-1"
        style={{
          '--slider-pct': `${pct}%`,
        } as React.CSSProperties}
      />
      <span className="text-[9px] w-[32px] shrink-0 text-right tabular-nums" style={{ color: 'var(--tb-fg-muted)' }}>{format(value)}</span>
    </div>
  );
}

export default function EditorPage() {
  const { user, loading, signIn, logOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [config, setConfig] = useState<BoxConfig | null>(null);
  const [items, setItems] = useState<TreasureItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'items' | 'config' | 'embed'>('items');
  const [removingBg, setRemovingBg] = useState<string | null>(null);
  const [bgError, setBgError] = useState<string | null>(null);
  const [isTransparentBg, setIsTransparentBg] = useState(true);
  const [configStatus, setConfigStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const configTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configLoadedRef = useRef(false);
  const skipAutoSaveRef = useRef(false);
  const [generating, setGenerating] = useState(false);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (generating) setShowLoadingOverlay(true);
  }, [generating]);

  useEffect(() => {
    if (!user) return;
    configLoadedRef.current = false;
    (async () => {
      let box = await getBoxConfig(user.uid);
      if (!box) {
        box = { ...DEFAULT_BOX_CONFIG, id: user.uid, ownerId: user.uid, createdAt: Date.now(), updatedAt: Date.now() };
        await saveBoxConfig(box);
      }
      setConfig(box);
      setIsTransparentBg(box.backgroundColor === 'transparent');
      setItems(await getItems(user.uid));
      // Mark loaded so auto-save doesn't fire on initial load
      setTimeout(() => { configLoadedRef.current = true; }, 100);
    })();
  }, [user]);

  // Auto-save config with 1.5s debounce
  useEffect(() => {
    if (!config || !user || !configLoadedRef.current) return;
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }
    setConfigStatus('saving');
    if (configTimerRef.current) clearTimeout(configTimerRef.current);
    configTimerRef.current = setTimeout(async () => {
      await saveBoxConfig(config);
      setConfigStatus('saved');
      setTimeout(() => setConfigStatus('idle'), 2000);
    }, 1500);
    return () => {
      if (configTimerRef.current) clearTimeout(configTimerRef.current);
    };
  }, [config, user]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files?.length) return;
    if (items.length >= (config?.maxItems || 15)) return;
    const file = e.target.files[0];
    const id = `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setSaving(true);
    setBgError(null);
    const originalUrl = await uploadImage(user.uid, file, `${id}_original`);
    let processedUrl = originalUrl;
    let contourPoints: { x: number; y: number }[] | undefined;
    try {
      setRemovingBg(id);
      // Client-side background removal via WASM (no server needed)
      const { removeBackground } = await import('@imgly/background-removal');
      const resultBlob = await removeBackground(file, {
        model: 'isnet_quint8',
        output: { format: 'image/png' },
      });

      // Extract contour points for physics shapes via offscreen canvas
      const img = new Image();
      const blobUrl = URL.createObjectURL(resultBlob);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = blobUrl;
      });
      URL.revokeObjectURL(blobUrl);

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      contourPoints = extractContourFromImage(imageData);

      processedUrl = await uploadProcessedImage(user.uid, resultBlob, id);
    } catch (err) {
      setBgError(err instanceof Error ? err.message : 'Unknown error');
    } finally { setRemovingBg(null); }
    const newItem: TreasureItem = {
      id, imageUrl: processedUrl, originalImageUrl: originalUrl,
      label: file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
      story: '', link: '', order: items.length, rotation: 0, createdAt: Date.now(),
      ...(contourPoints && { contourPoints }),
    };
    await saveItem(user.uid, newItem, true);
    setItems(prev => [...prev, newItem]);
    setSaving(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpdateItem = async (id: string, updates: Partial<TreasureItem>) => {
    if (!user) return;
    const updated = items.map(item => item.id === id ? { ...item, ...updates } : item);
    setItems(updated);
    const item = updated.find(i => i.id === id);
    if (item) await saveItem(user.uid, item);
  };

  const handleDeleteItem = async (id: string) => {
    if (!user) return;
    await deleteItemWithCleanup(user.uid, id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-mono" style={{ background: 'var(--tb-bg)' }}>
        <div className="text-sm" style={{ color: 'var(--tb-fg-faint)' }}>loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center font-mono" style={{ background: 'var(--tb-bg)' }}>
        <div className="text-center">
          <pre className="text-[9px] mb-8 leading-relaxed" style={{ color: 'var(--tb-fg-faint)' }}>
{`╔════════════════════════╗
║   T R E A S U R E      ║
║       B O X            ║
║                        ║
║   editor               ║
╚════════════════════════╝`}
          </pre>
          <button
            onClick={signIn}
            className="font-mono text-[10px] px-8 py-3 transition-colors cursor-pointer tracking-[0.12em]"
            style={{ border: '1px solid var(--tb-border)', color: 'var(--tb-accent)' }}
          >
            sign in with Google →
          </button>
        </div>
      </div>
    );
  }

  const S = {
    border: { borderColor: 'var(--tb-border-subtle)' },
    accent: { color: 'var(--tb-accent)' },
    faint: { color: 'var(--tb-fg-faint)' },
    ghost: { color: 'var(--tb-fg-ghost)' },
    muted: { color: 'var(--tb-fg-muted)' },
  };

  return (
    <div className="h-screen font-mono flex flex-col overflow-hidden" style={{ background: 'var(--tb-bg)', color: 'var(--tb-fg)' }}>
      {/* Header */}
      <header className="px-5 h-11 flex items-center justify-between text-[10px] shrink-0" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
        <div className="flex items-center gap-3">
          <Link href="/" className="uppercase tracking-[0.12em] no-underline" style={S.accent}>treasure box</Link>
          <span className="hidden sm:inline" style={S.ghost}>|</span>
          <span className="hidden sm:inline" style={S.faint}>{user.email}</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={toggleTheme} className="cursor-pointer" style={S.faint} title="Toggle theme">
            {theme === 'dark' ? '○' : '●'}
          </button>
          <Link href="/" className="no-underline" style={S.accent}>back to home</Link>
          <button onClick={logOut} className="cursor-pointer" style={S.faint}>sign out</button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0 overflow-hidden">
        {/* LEFT: Edit Panel */}
        <div className="flex flex-col min-h-0 overflow-hidden" style={{ borderRight: '1px solid var(--tb-border-subtle)' }}>
          <nav className="flex shrink-0" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
            {(['items', 'config', 'embed'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-4 py-[10px] text-[10px] tracking-[0.12em] border-b-2 transition-colors cursor-pointer"
                style={{
                  borderBottomColor: tab === t ? 'var(--tb-accent)' : 'transparent',
                  color: tab === t ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
                  background: 'transparent',
                }}
              >
                {t}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto min-h-0 p-4">
            {/* ITEMS */}
            {tab === 'items' && (
              <div>
                <h2 className="text-[11px] tracking-[0.12em] uppercase mb-3" style={S.accent}>
                  items ({items.length}/{config?.maxItems || 15})
                </h2>
                {removingBg && <div className="text-[10px] mb-3 animate-pulse" style={{ color: 'var(--tb-highlight)' }}>removing background...</div>}
                {bgError && <div className="text-[10px] mb-3" style={{ color: '#c44' }}>bg removal failed: {bgError}</div>}

                {items.length === 0 ? (
                  <div className="text-center py-12 text-[10px]" style={S.faint}>no items yet — upload your first treasure</div>
                ) : (
                  <>
                    {/* Specimen grid */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-[1px]" style={{ background: 'var(--tb-border-subtle)' }}>
                      {items.map((item, idx) => {
                        const isSelected = selectedItemId === item.id;
                        const hasLink = !!item.link;
                        const hasStory = !!item.story;
                        return (
                          <div
                            key={item.id}
                            className="aspect-square relative flex items-center justify-center p-3 cursor-pointer transition-shadow"
                            style={{
                              background: 'var(--tb-bg)',
                              outline: isSelected ? '2px solid var(--tb-accent)' : 'none',
                              outlineOffset: '-2px',
                              zIndex: isSelected ? 1 : 0,
                            }}
                            onClick={() => setSelectedItemId(isSelected ? null : item.id)}
                          >
                            {/* Index number */}
                            <span className="absolute top-[6px] left-[6px] text-[10px] leading-none select-none" style={S.ghost}>{idx + 1}</span>
                            {/* Item image */}
                            <img
                              src={item.imageUrl}
                              alt={item.label}
                              className="max-w-[75%] max-h-[75%] object-contain"
                              style={{ transform: `rotate(${item.rotation ?? 0}deg) scale(${Math.min(item.scale ?? 1, 1.8)})` }}
                              draggable={false}
                            />
                            {/* Label */}
                            <span className="absolute bottom-[6px] left-1/2 -translate-x-1/2 text-[9px] truncate max-w-[85%] text-center select-none" style={S.ghost}>{item.label}</span>
                            {/* Indicator dots */}
                            {(hasLink || hasStory) && (
                              <div className="absolute bottom-[6px] right-[6px] flex gap-[3px]">
                                {hasLink && <div className="w-[4px] h-[4px] rounded-full" style={{ background: 'var(--tb-accent)', opacity: 0.5 }} />}
                                {hasStory && <div className="w-[4px] h-[4px] rounded-full" style={{ background: 'var(--tb-highlight, var(--tb-accent))', opacity: 0.5 }} />}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* Upload cell */}
                      {items.length < (config?.maxItems || 15) && (
                        <label
                          className="aspect-square flex flex-col items-center justify-center cursor-pointer transition-colors"
                          style={{ background: 'var(--tb-bg)', border: 'none' }}
                        >
                          <span className="text-lg leading-none mb-1" style={S.ghost}>+</span>
                          <span className="text-[9px] tracking-[0.08em]" style={S.ghost}>upload</span>
                          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                        </label>
                      )}
                    </div>

                    {/* Selected item detail panel */}
                    {selectedItemId && (() => {
                      const item = items.find(i => i.id === selectedItemId);
                      if (!item) return null;
                      return (
                        <div className="mt-3 p-3 flex flex-col gap-[8px]" style={{ border: '1px solid var(--tb-border-subtle)' }}>
                          <div className="grid grid-cols-[56px_1fr] gap-3">
                            {/* Thumbnail */}
                            <div className="w-14 h-14 flex items-center justify-center overflow-hidden shrink-0" style={{ background: 'var(--tb-bg-muted)' }}>
                              <img src={item.imageUrl} alt={item.label} className="max-w-full max-h-full object-contain"
                                style={{ transform: `rotate(${item.rotation ?? 0}deg) scale(${Math.min(item.scale ?? 1, 1.8)})` }} />
                            </div>
                            {/* Fields */}
                            <div className="flex flex-col gap-[6px] min-w-0">
                              <input value={item.label} onChange={e => handleUpdateItem(item.id, { label: e.target.value })} placeholder="label"
                                className="w-full bg-transparent text-[11px] pb-[2px] outline-none" style={{ borderBottom: '1px solid var(--tb-border-subtle)', ...S.accent }} />
                              <input value={item.link || ''} onChange={e => handleUpdateItem(item.id, { link: e.target.value })} placeholder="link (https://...)"
                                className="w-full bg-transparent text-[10px] pb-[2px] outline-none" style={{ borderBottom: '1px solid var(--tb-border-subtle)', color: 'var(--tb-fg)' }} />
                              <textarea value={item.story || ''} onChange={e => handleUpdateItem(item.id, { story: e.target.value })} placeholder="story (shown on long-press)" rows={2}
                                className="w-full bg-transparent text-[10px] pb-[2px] outline-none resize-none" style={{ borderBottom: '1px solid var(--tb-border-subtle)', color: 'var(--tb-fg)' }} />
                            </div>
                          </div>
                          {/* Sliders + delete */}
                          <div className="flex flex-col gap-[6px] pt-1" style={{ borderTop: '1px solid var(--tb-border-subtle)' }}>
                            <Slider value={item.rotation ?? 0} min={0} max={360} step={1}
                              label="rot" format={v => `${v}°`}
                              snap={v => { const n = Math.round(v / 90) * 90; return Math.abs(v - n) < 8 ? n % 360 : v; }}
                              onChange={v => handleUpdateItem(item.id, { rotation: v })} />
                            <Slider value={item.scale ?? 1} min={0.3} max={5} step={0.1}
                              label="size" format={v => `${v.toFixed(1)}×`}
                              onChange={v => handleUpdateItem(item.id, { scale: v })} />
                            <div className="flex justify-end pt-[2px]">
                              <button
                                onClick={() => { handleDeleteItem(item.id); setSelectedItemId(null); }}
                                className="text-[10px] px-[10px] py-[4px] cursor-pointer tracking-[0.08em] transition-colors"
                                style={{ border: '1px solid #c44', color: '#c44', background: 'transparent' }}
                              >
                                delete
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}

                {/* Upload cell for empty state */}
                {items.length === 0 && (
                  <label className="mt-4 flex items-center justify-center gap-2 py-3 cursor-pointer transition-colors text-[10px] tracking-[0.12em]"
                    style={{ border: '1px dashed var(--tb-border)', ...S.accent }}>
                    + upload your first item
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                  </label>
                )}
              </div>
            )}

            {/* CONFIG */}
            {tab === 'config' && config && (
              <div>
                {/* ── 1. DRAWER APPEARANCE ── */}
                <CfgGroup title="drawer appearance" hint="generate AI artwork for your drawer — choose a style and hit generate" first>
                  <DrawerStylePicker
                    key={config.drawerImages?.generatedAt ?? 'ascii'}
                    userId={user.uid}
                    currentImages={config.drawerImages || undefined}
                    boxDimensions={config.boxDimensions}
                    onComplete={(images: DrawerImages) => { skipAutoSaveRef.current = true; setConfig({ ...config, drawerImages: images }); }}
                    onReset={async () => { await clearDrawerImages(user.uid); setConfig({ ...config, drawerImages: undefined }); }}
                    onGeneratingChange={setGenerating}
                  />
                </CfgGroup>

                {/* ── 2. ITEM STYLE ── */}
                <CfgGroup title="item style" hint="visual filters applied to all items in the drawer">
                  <CfgSection>
                    <CfgLabel>brightness</CfgLabel>
                    <div className="flex items-center gap-3">
                      <input
                        type="range" min={0.5} max={1.5} step={0.05}
                        value={config.itemBrightness ?? 1}
                        onChange={e => setConfig({ ...config, itemBrightness: Number(e.target.value) })}
                        className="flex-1"
                        style={{ accentColor: 'var(--tb-accent)' }}
                      />
                      <span className="text-[10px] min-w-[32px] text-right font-mono" style={S.accent}>
                        {(config.itemBrightness ?? 1).toFixed(2)}
                      </span>
                      {(config.itemBrightness ?? 1) !== 1 && (
                        <button
                          onClick={() => setConfig({ ...config, itemBrightness: 1 })}
                          className="text-[9px] px-2 py-[2px] cursor-pointer"
                          style={{ border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-fg-faint)' }}
                        >
                          reset
                        </button>
                      )}
                    </div>
                  </CfgSection>

                  <CfgSection>
                    <CfgLabel>contrast</CfgLabel>
                    <div className="flex items-center gap-3">
                      <input
                        type="range" min={0.5} max={1.5} step={0.05}
                        value={config.itemContrast ?? 1}
                        onChange={e => setConfig({ ...config, itemContrast: Number(e.target.value) })}
                        className="flex-1"
                        style={{ accentColor: 'var(--tb-accent)' }}
                      />
                      <span className="text-[10px] min-w-[32px] text-right font-mono" style={S.accent}>
                        {(config.itemContrast ?? 1).toFixed(2)}
                      </span>
                      {(config.itemContrast ?? 1) !== 1 && (
                        <button
                          onClick={() => setConfig({ ...config, itemContrast: 1 })}
                          className="text-[9px] px-2 py-[2px] cursor-pointer"
                          style={{ border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-fg-faint)' }}
                        >
                          reset
                        </button>
                      )}
                    </div>
                  </CfgSection>

                  <CfgSection>
                    <CfgLabel>color mode</CfgLabel>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-[6px] cursor-pointer">
                        <div onClick={() => {
                          if (config.itemTint && config.itemTint !== 'bw') {
                            setConfig({ ...config, itemTint: undefined });
                          } else {
                            setConfig({ ...config, itemTint: '#ff0000' });
                          }
                        }}
                          className="w-[14px] h-[14px] flex items-center justify-center text-[10px] shrink-0"
                          style={{ border: '1px solid var(--tb-border)', ...S.accent, background: config.itemTint && config.itemTint !== 'bw' ? 'var(--tb-bg-muted)' : 'transparent' }}>
                          {config.itemTint && config.itemTint !== 'bw' ? '\u2713' : ''}
                        </div>
                        <span className="text-[9px]" style={S.faint}>tint</span>
                      </label>
                      {config.itemTint && config.itemTint !== 'bw' && (
                        <input type="color" value={config.itemTint}
                          onChange={e => setConfig({ ...config, itemTint: e.target.value })}
                          className="w-8 h-8 bg-transparent cursor-pointer p-0" style={{ border: '1px solid var(--tb-border)' }} />
                      )}
                      <label className="flex items-center gap-[6px] cursor-pointer">
                        <div onClick={() => {
                          setConfig({ ...config, itemTint: config.itemTint === 'bw' ? undefined : 'bw' });
                        }}
                          className="w-[14px] h-[14px] flex items-center justify-center text-[10px] shrink-0"
                          style={{ border: '1px solid var(--tb-border)', ...S.accent, background: config.itemTint === 'bw' ? 'var(--tb-bg-muted)' : 'transparent' }}>
                          {config.itemTint === 'bw' ? '\u2713' : ''}
                        </div>
                        <span className="text-[9px]" style={S.faint}>b&w</span>
                      </label>
                    </div>
                    <CfgHint>apply a color tint or convert items to black &amp; white</CfgHint>
                  </CfgSection>
                </CfgGroup>

                {/* ── 3. SOUND ── */}
                <CfgGroup title="sound">
                  <CfgSection>
                    <CfgLabel>collision sound</CfgLabel>
                    <div className="flex flex-wrap">
                      {SOUND_PRESETS.map((p, i) => (
                        <CfgToggle key={p} first={i === 0} active={config.soundPreset === p}
                          onClick={() => setConfig({ ...config, soundPreset: p, soundEnabled: p !== 'silent' })}>{p}</CfgToggle>
                      ))}
                    </div>
                  </CfgSection>

                  {config.soundPreset !== 'silent' && (
                    <CfgSection>
                      <CfgLabel>volume</CfgLabel>
                      <VolumeBar volume={config.soundVolume} onChange={v => setConfig({ ...config, soundVolume: v })} />
                    </CfgSection>
                  )}

                  {/* Future sound controls */}
                  <CfgSection>
                    <CfgLabel>drawer open / close</CfgLabel>
                    <span className="text-[9px] tracking-[0.08em]" style={{ color: 'var(--tb-fg-muted)' }}>synthesized per preset</span>
                  </CfgSection>
                  <CfgSection>
                    <CfgLabel>item drop</CfgLabel>
                    <span className="text-[9px] tracking-[0.08em]" style={{ color: 'var(--tb-fg-ghost)' }}>coming soon</span>
                  </CfgSection>
                  <CfgSection>
                    <CfgLabel>ambient</CfgLabel>
                    <span className="text-[9px] tracking-[0.08em]" style={{ color: 'var(--tb-fg-ghost)' }}>coming soon</span>
                  </CfgSection>
                </CfgGroup>

                {/* ── 4. BOX IDENTITY ── */}
                <CfgGroup title="box identity">
                  <CfgSection>
                    <CfgLabel>drawer label</CfgLabel>
                    <input type="text" value={config.drawerLabel} onChange={e => setConfig({ ...config, drawerLabel: e.target.value })}
                      className="w-full bg-transparent text-[10px] p-2 outline-none"
                      style={{ border: '1px solid var(--tb-border-subtle)', ...S.accent }} />
                  </CfgSection>

                  <CfgSection>
                    <CfgLabel>owner name (optional)</CfgLabel>
                    <input type="text" value={config.ownerName || ''} onChange={e => setConfig({ ...config, ownerName: e.target.value })}
                      placeholder="displayed on your box" className="w-full bg-transparent text-[10px] p-2 outline-none"
                      style={{ border: '1px solid var(--tb-border-subtle)', ...S.accent }} />
                    <CfgHint>shown at the bottom corner of your treasure box</CfgHint>
                  </CfgSection>

                  <CfgSection>
                    <CfgLabel>background</CfgLabel>
                    <label className="flex items-center gap-[6px] mb-[10px] cursor-pointer">
                      <div onClick={() => { const n = !isTransparentBg; setIsTransparentBg(n); setConfig({ ...config, backgroundColor: n ? 'transparent' : '#0e0e0e' }); }}
                        className="w-[14px] h-[14px] flex items-center justify-center text-[10px] shrink-0"
                        style={{ border: '1px solid var(--tb-border)', ...S.accent, background: isTransparentBg ? 'var(--tb-bg-muted)' : 'transparent' }}>
                        {isTransparentBg ? '\u2713' : ''}
                      </div>
                      <span className="text-[10px]" style={S.muted}>transparent (default)</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={config.backgroundColor === 'transparent' ? '#0e0e0e' : config.backgroundColor}
                        onChange={e => { setIsTransparentBg(false); setConfig({ ...config, backgroundColor: e.target.value }); }}
                        className="w-11 h-11 bg-transparent cursor-pointer p-0" style={{ border: '1px solid var(--tb-border)' }} />
                      <input type="text" value={config.backgroundColor}
                        onChange={e => { setIsTransparentBg(e.target.value === 'transparent'); setConfig({ ...config, backgroundColor: e.target.value }); }}
                        className="w-20 bg-transparent text-[10px] p-2 outline-none" style={{ border: '1px solid var(--tb-border-subtle)', ...S.accent }} placeholder="#hex" />
                    </div>
                    <CfgHint>transparent inherits the background of the page it&apos;s embedded on</CfgHint>
                  </CfgSection>

                  <CfgSection>
                    <CfgLabel>visibility</CfgLabel>
                    <div className="flex">
                      <CfgToggle active={!config.isPublic} first onClick={() => setConfig({ ...config, isPublic: false })}>private</CfgToggle>
                      <CfgToggle active={config.isPublic} onClick={() => setConfig({ ...config, isPublic: true })}>public</CfgToggle>
                    </div>
                    <CfgHint>public boxes appear in the gallery on the landing page</CfgHint>
                  </CfgSection>
                </CfgGroup>

                {/* Auto-save status */}
                <div className="text-[10px] tracking-[0.12em] mb-6 h-6 flex items-center" style={S.faint}>
                  {configStatus === 'saving' && <span className="animate-pulse">saving...</span>}
                  {configStatus === 'saved' && <span style={S.accent}>saved &#10003;</span>}
                  {configStatus === 'idle' && <span style={S.ghost}>auto-saves on change</span>}
                </div>

                {/* ── 5. DANGER ZONE ── */}
                <div className="pt-6 mt-2" style={{ borderTop: '1px solid var(--tb-border-subtle)' }}>
                  <h3 className="text-[11px] mb-4 tracking-[0.12em] uppercase" style={{ color: '#c44' }}>danger zone</h3>
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="text-[10px] px-[14px] py-[6px] cursor-pointer tracking-[0.12em] transition-colors"
                      style={{ border: '1px solid #c44', color: '#c44', background: 'transparent' }}
                    >
                      delete my box
                    </button>
                  ) : (
                    <div className="p-3" style={{ border: '1px solid #c44' }}>
                      <p className="text-[10px] mb-3" style={{ color: '#c44' }}>
                        This will permanently delete your box, all items, and all images. This cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            setDeleting(true);
                            await deleteBox(user.uid);
                            setConfig(null);
                            setItems([]);
                            setShowDeleteConfirm(false);
                            setDeleting(false);
                            window.location.href = '/';
                          }}
                          disabled={deleting}
                          className="text-[10px] px-[14px] py-[6px] cursor-pointer tracking-[0.12em]"
                          style={{ border: '1px solid #c44', color: '#fff', background: '#c44', opacity: deleting ? 0.5 : 1 }}
                        >
                          {deleting ? 'deleting...' : 'confirm delete'}
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="text-[10px] px-[14px] py-[6px] cursor-pointer tracking-[0.12em]"
                          style={{ border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-fg-faint)', background: 'transparent' }}
                        >
                          cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* EMBED */}
            {tab === 'embed' && config && user && (
              <EmbedConfigurator
                config={config}
                userId={user.uid}
                onSettingsChange={(settings: EmbedSettings) => setConfig({ ...config, embedSettings: settings })}
                onScaleChange={(s: number) => {
                  const dims = getEmbedDimensions(s);
                  const es = config.embedSettings || DEFAULT_EMBED_SETTINGS;
                  setConfig({
                    ...config,
                    contentScale: s,
                    embedSettings: { ...es, width: dims.width, height: dims.height },
                  });
                }}
              />
            )}
          </div>
        </div>

        {/* RIGHT: Live Preview */}
        <div className="flex flex-col overflow-hidden" style={{ background: 'var(--tb-bg-subtle)' }}>
          <div className="flex items-center justify-between px-4 py-[10px] shrink-0" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
            <span className="text-[10px] tracking-[0.12em]" style={S.faint}>live preview</span>
            <span className="text-[9px] px-2 py-[2px] tracking-widest uppercase" style={{ ...S.ghost, border: '1px solid var(--tb-border-subtle)' }}>live</span>
          </div>
          <div className="flex-1 flex items-center justify-center relative overflow-hidden"
            style={{
              background: config?.backgroundColor === 'transparent'
                ? 'repeating-conic-gradient(var(--tb-bg-muted) 0% 25%, var(--tb-bg-subtle) 0% 50%) 50% / 16px 16px'
                : config?.backgroundColor || 'var(--tb-bg)',
            }}>
            {config && (
              <UnifiedPreview
                config={config}
                items={items}
                tab={tab}
                onPositionChange={(pos) => {
                  setConfig({
                    ...config,
                    embedSettings: {
                      ...(config.embedSettings || { mode: 'overlay', width: 350, height: 300, position: { anchor: 'bottom-right' as AnchorCorner, offsetX: 32, offsetY: 32 } }),
                      position: pos,
                    },
                  });
                }}
                onScaleChange={(s: number) => {
                  const dims = getEmbedDimensions(s);
                  const currentEs = config.embedSettings || DEFAULT_EMBED_SETTINGS;
                  setConfig({
                    ...config,
                    contentScale: s,
                    embedSettings: { ...currentEs, width: dims.width, height: dims.height },
                  });
                }}
              />
            )}
            {showLoadingOverlay && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
                <LoadingAnimation
                  finishing={!generating}
                  onFinished={() => setShowLoadingOverlay(false)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CfgSection({ children }: { children: React.ReactNode }) {
  return <div className="mb-5 pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>{children}</div>;
}
function CfgLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] block mb-2 tracking-[0.12em]" style={{ color: 'var(--tb-fg-faint)' }}>{children}</label>;
}
function CfgHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[9px] mt-[6px]" style={{ color: 'var(--tb-fg-ghost)' }}>{children}</p>;
}
function CfgGroup({ title, hint, children, first }: { title: string; hint?: string; children: React.ReactNode; first?: boolean }) {
  return (
    <div style={{ borderTop: first ? 'none' : '1px solid var(--tb-border-subtle)' }}
      className={first ? 'mb-4' : 'pt-5 mt-3 mb-4'}>
      <h3 className="text-[11px] mb-1 tracking-[0.12em] uppercase"
        style={{ color: 'var(--tb-accent)' }}>{title}</h3>
      {hint && <p className="text-[9px] mb-4" style={{ color: 'var(--tb-fg-ghost)' }}>{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </div>
  );
}
function CfgToggle({ active, first, children, onClick }: { active: boolean; first?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-[10px] px-[14px] py-[6px] border cursor-pointer transition-all"
      style={{
        borderColor: active ? 'var(--tb-accent)' : 'var(--tb-border-subtle)',
        color: active ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
        borderLeftWidth: first ? 1 : 0, background: 'transparent',
      }}>{children}</button>
  );
}

/** Interactive embed preview — TreasureBox fills the preview, drawer is draggable */
/** Unified preview — single persistent TreasureBox across all tabs.
 *  Drawer position changes smoothly via CSS transition when switching tabs. */
function UnifiedPreview({
  config,
  items,
  tab,
  onPositionChange,
  onScaleChange,
}: {
  config: BoxConfig;
  items: TreasureItem[];
  tab: 'items' | 'config' | 'embed';
  onPositionChange: (pos: { anchor: AnchorCorner; offsetX: number; offsetY: number }) => void;
  onScaleChange?: (scale: number) => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const es = config.embedSettings || { mode: 'overlay' as const, width: 350, height: 300, position: { anchor: 'bottom-right' as AnchorCorner, offsetX: 32, offsetY: 32 } };
  const isEmbedTab = tab === 'embed';
  const isOverlay = es.mode !== 'contained';
  const isContained = isEmbedTab && !isOverlay;
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // Track preview panel dimensions for boundary box scaling
  const [previewSize, setPreviewSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setPreviewSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute boundary box for contained mode — scales embed dimensions to fit preview
  const boundaryBox = useMemo(() => {
    if (!isContained || previewSize.w === 0) return null;
    const margin = 40;
    const availW = previewSize.w - margin * 2;
    const availH = previewSize.h - margin * 2;
    if (availW <= 0 || availH <= 0) return null;
    const scale = Math.min(availW / es.width, availH / es.height, 1);
    return {
      width: Math.round(es.width * scale),
      height: Math.round(es.height * scale),
      scale,
    };
  }, [isContained, previewSize, es.width, es.height]);

  // Compute drawer position: centered for items/config, stored anchor for embed overlay
  const getDrawerStyle = useCallback((): React.CSSProperties => {
    // During drag, follow pointer directly
    if (dragPos) {
      return { left: dragPos.x, top: dragPos.y, transform: 'translate(-50%, -50%)' };
    }
    // Items/Config tabs OR contained mode: centered
    if (!isEmbedTab || !isOverlay) {
      // In contained mode, use boundary box dimensions for centering
      if (boundaryBox) {
        return computeCenteredDrawerPosition(boundaryBox.width, boundaryBox.height);
      }
      if (!previewRef.current) return { left: '50%', top: '60%', transform: 'translate(-50%, -50%)' };
      const w = previewRef.current.offsetWidth;
      const h = previewRef.current.offsetHeight;
      return computeCenteredDrawerPosition(w, h);
    }
    // Embed tab + overlay mode: use stored position
    if (!previewRef.current) return { bottom: 24, right: 24 };
    return computeDrawerPosition(
      es.position.anchor, es.position.offsetX, es.position.offsetY,
      previewRef.current.offsetWidth, previewRef.current.offsetHeight,
    );
  }, [isEmbedTab, isOverlay, es.position, dragPos, boundaryBox]);

  // Compute spawn origin
  const getSpawnOrigin = useCallback(() => {
    if (!isEmbedTab || !isOverlay) return computeCenteredSpawnOrigin();
    if (!previewRef.current) return { x: 0.8, y: 0.8 };
    return computeSpawnOrigin(
      es.position.anchor, es.position.offsetX, es.position.offsetY,
      previewRef.current.offsetWidth, previewRef.current.offsetHeight,
    );
  }, [isEmbedTab, isOverlay, es.position]);

  // Handle drag from TreasureBox drawer — follow mouse during move, commit on end
  const handleDrag = useCallback((e: PointerEvent, phase: 'start' | 'move' | 'end') => {
    if (!previewRef.current) return;

    const rect = previewRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (phase === 'start') {
      // Record offset between mouse and drawer center so the box doesn't jump
      const style = computeDrawerPosition(
        es.position.anchor, es.position.offsetX, es.position.offsetY,
        rect.width, rect.height,
      );
      const cx = typeof style.left === 'number' ? style.left : 0;
      const cy = typeof style.top === 'number' ? style.top : 0;
      dragOffsetRef.current = { dx: mouseX - cx, dy: mouseY - cy };
      return;
    }

    const posX = mouseX - dragOffsetRef.current.dx;
    const posY = mouseY - dragOffsetRef.current.dy;

    if (phase === 'move') {
      setDragPos({ x: posX, y: posY });
      return;
    }

    // phase === 'end' — commit position and clear drag state
    setDragPos(null);
    onPositionChange(positionFromPointer(posX, posY, rect.width, rect.height));
  }, [es.position, onPositionChange]);

  // Drawer style with CSS transition for smooth tab-switch animation (disabled during drag)
  const drawerStyleWithTransition = useMemo(() => ({
    ...getDrawerStyle(),
    ...(dragPos ? {} : { transition: 'left 0.5s ease-out, top 0.5s ease-out' }),
  }), [getDrawerStyle, dragPos]);

  // Effective config: transparent background on embed tab overlay
  const previewConfig = useMemo(() => {
    if (isEmbedTab && isOverlay) {
      return {
        ...config,
        backgroundColor: 'transparent',
        contentScale: config.contentScale ?? 1,
      };
    }
    return config;
  }, [config, isEmbedTab, isOverlay]);

  return (
    <div ref={previewRef} className="w-full h-full relative">
      {/* Website background — only visible on embed tab */}
      {isEmbedTab && (
        <div style={{ opacity: 1, transition: 'opacity 0.3s' }}>
          <MockWebsitePlaceholder />
          {/* Screenshot preview */}
          {es.previewMode === 'screenshot' && es.previewImageUrl && (
            <>
              <img
                src={es.previewImageUrl}
                alt=""
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ opacity: 0.4, zIndex: 1, objectFit: 'cover', objectPosition: 'top left' }}
              />
              <div className="absolute top-2 left-3 z-30 text-[7px] pointer-events-none" style={{ color: 'var(--tb-fg-ghost)' }}>
                screenshot preview
              </div>
            </>
          )}
          {/* Live URL iframe preview */}
          {es.previewMode === 'url' && es.previewUrl && (
            <>
              <iframe
                src={es.previewUrl}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ opacity: 0.4, zIndex: 1, border: 'none' }}
              />
              <div className="absolute top-2 left-3 z-30 text-[7px] pointer-events-none" style={{ color: 'var(--tb-fg-ghost)' }}>
                site preview (may be blocked by X-Frame-Options)
              </div>
            </>
          )}
        </div>
      )}

      {/* Single persistent TreasureBox — never unmounted across tab switches.
          Uses a single wrapper div that changes dimensions (not conditional branches)
          so React preserves the TreasureBox instance across mode switches. */}
      {boundaryBox && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 4, background: 'rgba(0,0,0,0.25)' }} />
      )}
      <div
        className={boundaryBox ? 'absolute' : 'absolute inset-0'}
        style={boundaryBox ? {
          zIndex: 5,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: boundaryBox.width,
          height: boundaryBox.height,
          border: '2px solid var(--tb-accent)',
          overflow: 'hidden',
          background: '#ffffff',
        } : { zIndex: 5 }}
      >
        <TreasureBox
          items={items}
          config={previewConfig}
          embedded={!!boundaryBox}
          overlayPreview={{
            drawerStyle: drawerStyleWithTransition,
            spawnOrigin: getSpawnOrigin(),
            onDrag: (isEmbedTab && isOverlay) ? handleDrag : undefined,
          }}
        />
      </div>
      {/* Dimension label below boundary box */}
      {boundaryBox && (
        <div className="absolute z-30 text-[9px] pointer-events-none"
          style={{
            color: 'var(--tb-fg-ghost)',
            top: `calc(50% + ${boundaryBox.height / 2 + 8}px)`,
            left: '50%',
            transform: 'translateX(-50%)',
          }}>
          {es.width} &times; {es.height}px
          {boundaryBox.scale < 1 && ` (${Math.round(boundaryBox.scale * 100)}%)`}
        </div>
      )}

      {/* Position readout — only on embed tab overlay mode */}
      {isEmbedTab && isOverlay && (
        <>
          <div className="absolute bottom-2 left-3 z-30 text-[8px] pointer-events-none" style={{ color: 'var(--tb-fg-ghost)' }}>
            {es.position.anchor} &middot; {es.position.offsetX}px, {es.position.offsetY}px
          </div>
          <div className="absolute bottom-2 right-3 z-30 text-[8px] pointer-events-none" style={{ color: 'var(--tb-fg-ghost)' }}>
            drag drawer to reposition
          </div>
        </>
      )}

      {/* Content scale slider — contained embed mode */}
      {/* TODO: Duplicates overlay widget-size slider from EmbedConfigurator — unify later */}
      {isContained && onScaleChange && (
        <div className="absolute bottom-3 right-3 z-30 flex items-center gap-2 px-3 py-2"
          style={{ background: 'var(--tb-bg)', border: '1px solid var(--tb-border-subtle)', borderRadius: 4 }}>
          <span className="text-[9px]" style={{ color: 'var(--tb-fg-ghost)' }}>size</span>
          <input type="range" min={0.5} max={2.0} step={0.1}
            value={config.contentScale ?? 1}
            onChange={e => onScaleChange(Number(e.target.value))}
            style={{ width: 80, accentColor: 'var(--tb-accent)' }}
          />
          <span className="text-[10px] w-10 text-right" style={{ color: 'var(--tb-accent)' }}>
            {Math.round((config.contentScale ?? 1) * 100)}%
          </span>
        </div>
      )}

      {/* Owner name — shown on non-embed tabs */}
      {!isEmbedTab && config.ownerName && (
        <div className="absolute bottom-2 left-3 text-[8px] tracking-wider z-30 pointer-events-none" style={{ color: 'var(--tb-fg-faint)' }}>
          {config.ownerName}
        </div>
      )}
    </div>
  );
}

/** Fake website skeleton — grey placeholder blocks, adapts to light/dark via CSS vars */
function MockWebsitePlaceholder() {
  const bar = { background: 'var(--tb-border)' };
  const block = { background: 'var(--tb-border-subtle)' };
  return (
    <div className="absolute inset-0 p-5 space-y-3 opacity-20 pointer-events-none overflow-hidden">
      {/* Nav bar */}
      <div className="flex items-center gap-3 pb-3" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
        <div className="h-3 w-8 rounded" style={bar} />
        <div className="flex-1" />
        <div className="h-2 w-10 rounded" style={block} />
        <div className="h-2 w-10 rounded" style={block} />
        <div className="h-2 w-10 rounded" style={block} />
      </div>
      {/* Hero */}
      <div className="h-5 w-2/3 rounded" style={bar} />
      <div className="h-3 w-full rounded" style={block} />
      <div className="h-3 w-5/6 rounded" style={block} />
      {/* Image placeholder */}
      <div className="h-24 w-full rounded" style={block} />
      {/* Body text */}
      <div className="h-3 w-full rounded" style={block} />
      <div className="h-3 w-4/5 rounded" style={block} />
      <div className="h-3 w-full rounded" style={block} />
      <div className="h-3 w-2/3 rounded" style={block} />
      {/* Two-column cards */}
      <div className="flex gap-3 mt-2">
        <div className="flex-1 h-16 rounded" style={block} />
        <div className="flex-1 h-16 rounded" style={block} />
      </div>
    </div>
  );
}
