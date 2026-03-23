'use client';

import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  getBoxConfig, saveBoxConfig,
  getItems, saveItem,
  uploadImage, uploadProcessedImage,
  clearDrawerImages, deleteItemWithCleanup, deleteBox,
} from '@/lib/firestore';
import type { TreasureItem, BoxConfig, DrawerImages, EmbedSettings } from '@/lib/types';
import { DEFAULT_BOX_CONFIG, MATERIAL_SOUND_MAP } from '@/lib/config';
import TreasureBox from '@/components/TreasureBox';
import DrawerStylePicker from '@/components/DrawerStylePicker';
import LoadingAnimation from '@/components/LoadingAnimation';
import { extractContourFromImage } from '@/lib/contour';
import EmbedConfigurator from '@/components/EmbedConfigurator';
import { computeCenteredDrawerPosition, computeCenteredSpawnOrigin } from '@/lib/embedPosition';

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
  const [tab, setTab] = useState<'items' | 'settings'>('items');
  const [removingBg, setRemovingBg] = useState<string | null>(null);
  const [bgError, setBgError] = useState<string | null>(null);
  const [configStatus, setConfigStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const configTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configLoadedRef = useRef(false);
  const skipAutoSaveRef = useRef(false);
  const [generating, setGenerating] = useState(false);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [generatingColors, setGeneratingColors] = useState<{ color: string; accentColor: string } | null>(null);
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
    if (items.length >= (config?.maxItems || 100)) return;
    const file = e.target.files[0];
    const id = `item_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
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
    const bgDidRemove = processedUrl !== originalUrl;
    const newItem: TreasureItem = {
      id, imageUrl: processedUrl, originalImageUrl: originalUrl,
      ...(bgDidRemove && { processedImageUrl: processedUrl }),
      bgRemoved: bgDidRemove,
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

  const handleToggleBgRemoval = async (itemId: string, bgOn: boolean) => {
    if (!user) return;
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    if (!bgOn) {
      // Toggle OFF: show original image
      const updates: Partial<TreasureItem> = {
        bgRemoved: false,
        imageUrl: item.originalImageUrl,
        // Preserve processed URL (capture from legacy items that only have imageUrl)
        processedImageUrl: item.processedImageUrl || (item.imageUrl !== item.originalImageUrl ? item.imageUrl : undefined),
        // Cache contour points so we can restore them later
        contourPointsCache: item.contourPoints || item.contourPointsCache,
        contourPoints: undefined,
      };
      await handleUpdateItem(itemId, updates);
    } else {
      // Toggle ON: show bg-removed image
      if (item.processedImageUrl) {
        // Already have a processed version — just swap back
        await handleUpdateItem(itemId, {
          bgRemoved: true,
          imageUrl: item.processedImageUrl,
          contourPoints: item.contourPointsCache || item.contourPoints,
          contourPointsCache: undefined,
        });
      } else {
        // No processed version yet — run bg removal on original
        try {
          setRemovingBg(itemId);
          setBgError(null);
          const response = await fetch(item.originalImageUrl);
          const originalBlob = await response.blob();
          const file = new File([originalBlob], 'image.png', { type: originalBlob.type });

          const { removeBackground } = await import('@imgly/background-removal');
          const resultBlob = await removeBackground(file, {
            model: 'isnet_quint8',
            output: { format: 'image/png' },
          });

          // Extract contour points
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
          const contourPoints = extractContourFromImage(imageData);

          const processedUrl = await uploadProcessedImage(user.uid, resultBlob, itemId);

          await handleUpdateItem(itemId, {
            bgRemoved: true,
            imageUrl: processedUrl,
            processedImageUrl: processedUrl,
            ...(contourPoints && { contourPoints }),
            contourPointsCache: undefined,
          });
        } catch (err) {
          setBgError(err instanceof Error ? err.message : 'Background removal failed');
        } finally {
          setRemovingBg(null);
        }
      }
    }
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
            {(['items', 'settings'] as const).map(t => (
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
                  items ({items.length}/{config?.maxItems || 100})
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
                      {items.length < (config?.maxItems || 100) && (
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
                          {/* Background removal toggle */}
                          <div className="flex items-center gap-2 pt-1" style={{ borderTop: '1px solid var(--tb-border-subtle)' }}>
                            <span className="text-[9px] tracking-[0.12em] shrink-0" style={{ color: 'var(--tb-fg-faint)' }}>bg removal</span>
                            <button
                              onClick={() => handleToggleBgRemoval(item.id, item.bgRemoved === false)}
                              disabled={removingBg === item.id}
                              className="text-[9px] px-[8px] py-[2px] cursor-pointer tracking-[0.08em] transition-colors"
                              style={{
                                border: '1px solid var(--tb-border-subtle)',
                                color: (item.bgRemoved !== false) ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
                                background: (item.bgRemoved !== false) ? 'var(--tb-accent-bg, transparent)' : 'transparent',
                              }}
                            >
                              {removingBg === item.id ? 'processing...' : (item.bgRemoved !== false) ? 'on' : 'off'}
                            </button>
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

            {/* SETTINGS */}
            {tab === 'settings' && config && (
              <div>
                {/* ── 1. DRAWER APPEARANCE ── */}
                <CfgGroup title="drawer appearance" hint="generate AI artwork for your drawer — choose a style and hit generate" first>
                  <DrawerStylePicker
                    key={config.drawerImages?.generatedAt ?? 'ascii'}
                    userId={user.uid}
                    currentImages={config.drawerImages || undefined}
                    boxDimensions={config.boxDimensions}
                    onComplete={(images: DrawerImages) => {
                      skipAutoSaveRef.current = true;
                      const material = images.style?.preset;
                      const soundPreset = material ? (MATERIAL_SOUND_MAP[material] ?? config.soundPreset) : config.soundPreset;
                      setConfig({ ...config, drawerImages: images, soundPreset, soundEnabled: soundPreset !== 'silent' });
                    }}
                    onReset={async () => { await clearDrawerImages(user.uid); setConfig({ ...config, drawerImages: undefined }); }}
                    onGeneratingChange={(gen, colors) => {
                      setGenerating(gen);
                      if (colors) setGeneratingColors(colors);
                    }}
                  />
                </CfgGroup>

                {/* ── 2. BOX IDENTITY ── */}
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
                    <CfgLabel>visibility</CfgLabel>
                    <div className="flex">
                      <CfgToggle active={!config.isPublic} first onClick={() => setConfig({ ...config, isPublic: false })}>private</CfgToggle>
                      <CfgToggle active={config.isPublic} onClick={() => setConfig({ ...config, isPublic: true })}>public</CfgToggle>
                    </div>
                    <CfgHint>public boxes appear in the gallery on the landing page</CfgHint>
                  </CfgSection>

                  <CfgSection>
                    <CfgLabel>drawer direction</CfgLabel>
                    <div className="flex">
                      <CfgToggle active={!config.drawerFlipped} first onClick={() => setConfig({ ...config, drawerFlipped: false })}>normal</CfgToggle>
                      <CfgToggle active={!!config.drawerFlipped} onClick={() => setConfig({ ...config, drawerFlipped: true })}>flipped</CfgToggle>
                    </div>
                    <CfgHint>mirror the drawer horizontally</CfgHint>
                  </CfgSection>
                </CfgGroup>

                {/* ── 3. EMBED ── */}
                {user && (
                  <CfgGroup title="embed">
                    <EmbedConfigurator
                      config={config}
                      userId={user.uid}
                      onSettingsChange={(settings: EmbedSettings) => setConfig({ ...config, embedSettings: settings })}
                      onScaleChange={(s: number) => {
                        setConfig({ ...config, boxScale: s });
                      }}
                    />
                  </CfgGroup>
                )}

                {/* Auto-save status */}
                <div className="text-[10px] tracking-[0.12em] mb-6 h-6 flex items-center" style={S.faint}>
                  {configStatus === 'saving' && <span className="animate-pulse">saving...</span>}
                  {configStatus === 'saved' && <span style={S.accent}>saved &#10003;</span>}
                  {configStatus === 'idle' && <span style={S.ghost}>auto-saves on change</span>}
                </div>

                {/* ── DANGER ZONE ── */}
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
          </div>
        </div>

        {/* RIGHT: Live Preview */}
        <div className="flex flex-col overflow-hidden" style={{ background: 'var(--tb-bg-subtle)' }}>
          <div className="flex items-center justify-between px-4 py-[10px] shrink-0" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
            <span className="text-[10px] tracking-[0.12em]" style={S.faint}>live preview</span>
            <span className="text-[9px] px-2 py-[2px] tracking-widest uppercase" style={{ ...S.ghost, border: '1px solid var(--tb-border-subtle)' }}>live</span>
          </div>
          <div className="flex-1 flex items-center justify-center relative overflow-hidden"
            style={{ background: '#cccccc' }}>
            {config && (
              <UnifiedPreview
                config={config}
                items={items}
              />
            )}
            {showLoadingOverlay && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
                <LoadingAnimation
                  finishing={!generating}
                  onFinished={() => setShowLoadingOverlay(false)}
                  startColor={generatingColors?.color ?? config?.drawerImages?.style?.color}
                  endColor={generatingColors?.accentColor ?? config?.drawerImages?.style?.accentColor}
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

/** Unified preview — single centered TreasureBox with pop-in transition */
function UnifiedPreview({
  config,
  items,
}: {
  config: BoxConfig;
  items: TreasureItem[];
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const handleReady = useCallback(() => setPreviewReady(true), []);

  // Reset readiness when drawer images change
  useEffect(() => {
    setPreviewReady(false);
  }, [config.drawerImages?.spriteUrl]);

  const drawerStyle = useMemo(() => {
    if (!previewRef.current) return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
    return computeCenteredDrawerPosition(previewRef.current.offsetWidth, previewRef.current.offsetHeight);
  }, [config]);

  return (
    <div ref={previewRef} className="w-full h-full relative">
      <div className="absolute inset-0" style={{
        zIndex: 5,
        opacity: previewReady ? 1 : 0,
        transition: 'opacity 0.3s ease-out',
      }}>
        <TreasureBox
          items={items}
          config={config}
          overlayPreview={{
            drawerStyle,
            spawnOrigin: computeCenteredSpawnOrigin(),
          }}
          onReady={handleReady}
        />
      </div>

      {config.ownerName && (
        <div className="absolute bottom-2 left-3 text-[8px] tracking-wider z-30 pointer-events-none" style={{ color: 'var(--tb-fg-faint)' }}>
          {config.ownerName}
        </div>
      )}
    </div>
  );
}
