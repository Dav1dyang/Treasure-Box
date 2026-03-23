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
  getDemoBoxId, setDemoBoxId,
} from '@/lib/firestore';
import type { TreasureItem, BoxConfig, DrawerImages, EmbedSettings } from '@/lib/types';
import { DEFAULT_BOX_CONFIG, MATERIAL_SOUND_MAP, ADMIN_EMAIL } from '@/lib/config';
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
    <div className="flex items-center gap-3 w-full">
      <span className="w-[36px] shrink-0 uppercase" style={{ fontFamily: "'Inconsolata', monospace", fontWeight: 600, fontSize: '12px', letterSpacing: '0.06em', color: 'var(--tb-fg-faint)' }}>{label}</span>
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
        className="tb-slider flex-1 h-2"
        style={{
          '--slider-pct': `${pct}%`,
        } as React.CSSProperties}
      />
      <span className="w-[40px] shrink-0 text-right" style={{ fontFamily: "'Inconsolata', monospace", fontWeight: 500, fontSize: '12px', fontVariantNumeric: 'tabular-nums', color: 'var(--tb-fg-muted)' }}>{format(value)}</span>
    </div>
  );
}

export default function EditorPage() {
  const { user, loading, signIn, logOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [config, setConfig] = useState<BoxConfig | null>(null);
  const [items, setItems] = useState<TreasureItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'drawer' | 'items' | 'share'>('drawer');
  const [removingBg, setRemovingBg] = useState<string | null>(null);
  const [bgError, setBgError] = useState<string | null>(null);
  const [configStatus, setConfigStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const configTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configLoadedRef = useRef(false);
  const skipAutoSaveRef = useRef(false);
  const [generating, setGenerating] = useState(false);
  const [drawerActionState, setDrawerActionState] = useState<import('@/components/DrawerStylePicker').DrawerPickerActionState | null>(null);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [generatingColors, setGeneratingColors] = useState<{ color: string; accentColor: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const isAdmin = user?.email === ADMIN_EMAIL;
  const [isDemoBox, setIsDemoBox] = useState(false);

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
      if (user.email === ADMIN_EMAIL) {
        const currentDemoId = await getDemoBoxId();
        setIsDemoBox(currentDemoId === user.uid);
      }
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--tb-bg)' }}>
        <button
          onClick={signIn}
          className="cursor-pointer uppercase transition-colors"
          style={{
            fontFamily: "'Inconsolata', monospace",
            fontWeight: 600,
            fontSize: 'clamp(15px, 1.8vw, 18px)',
            letterSpacing: '0.08em',
            color: 'var(--tb-accent)',
            background: 'none',
            border: '1.5px solid var(--tb-border)',
            padding: '14px 28px',
          }}
        >
          Sign in with Google →
        </button>
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
  const MONO = "'Inconsolata', monospace";
  const DISPLAY = "'Barlow Condensed', sans-serif";

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--tb-bg)', color: 'var(--tb-fg)', fontFamily: MONO }}>
      {/* Header */}
      <header className="relative px-3 sm:px-5 h-12 flex items-center justify-between shrink-0 uppercase" style={{ borderBottom: '0.5px solid var(--tb-border)', fontWeight: 500, fontSize: '13px', letterSpacing: '0.08em' }}>
        <a href="/" className="no-underline shrink-0" style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: '16px', letterSpacing: '0.02em', ...S.accent }}>Junk Drawer</a>
        {/* Editable owner title — centered, hidden on small screens */}
        {config && (
          <div className="absolute left-1/2 -translate-x-1/2 hidden sm:flex items-baseline gap-0">
            <input
              value={config.ownerName || ''}
              onChange={e => setConfig({ ...config, ownerName: e.target.value })}
              placeholder="Owner"
              className="bg-transparent outline-none text-right uppercase"
              style={{
                fontFamily: DISPLAY, fontWeight: 700, fontSize: '16px', letterSpacing: '0.02em',
                color: 'var(--tb-fg)',
                width: `${Math.max(3, (config.ownerName || 'Owner').length) + 1}ch`,
                maxWidth: '16ch',
                borderBottom: '1px dashed var(--tb-border)',
              }}
            />
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: '16px', letterSpacing: '0.02em', color: 'var(--tb-fg-faint)', whiteSpace: 'nowrap' }}>&rsquo;s Drawer</span>
          </div>
        )}
        <div className="flex items-center gap-3 sm:gap-5">
          <button onClick={toggleTheme} className="cursor-pointer" style={S.faint} title="Toggle theme">
            {theme === 'dark' ? '○' : '●'}
          </button>
          <a href="/" className="no-underline" style={S.muted}>Home</a>
          <button onClick={logOut} className="cursor-pointer uppercase" style={S.faint}>Sign Out</button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-2 min-h-0 overflow-hidden">
        {/* Mobile: compact preview at top */}
        <div className="lg:hidden shrink-0 h-[200px] relative" style={{ background: '#cccccc', borderBottom: '0.5px solid var(--tb-border)' }}>
          {config && (
            <UnifiedPreview config={config} items={items} useEmbedPosition={tab === 'share'} />
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
        {/* LEFT: Edit Panel */}
        <div className="flex flex-col min-h-0 overflow-hidden flex-1 lg:flex-none" style={{ borderRight: '0.5px solid var(--tb-border)' }}>
          <nav className="flex shrink-0" style={{ borderBottom: '0.5px solid var(--tb-border)' }}>
            {(['drawer', 'items', 'share'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-3 sm:px-5 py-3 border-b-2 transition-colors cursor-pointer uppercase flex-1 sm:flex-none text-center sm:text-left"
                style={{
                  fontFamily: MONO,
                  fontWeight: 600,
                  fontSize: '13px',
                  letterSpacing: '0.08em',
                  borderBottomColor: tab === t ? 'var(--tb-accent)' : 'transparent',
                  color: tab === t ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
                  background: 'transparent',
                }}
              >
                {t}
              </button>
            ))}
          </nav>

          <div className="flex-1 flex flex-col min-h-0">
            {/* ITEMS */}
            {tab === 'items' && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Scrollable: header + grid */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  <div className="px-4 pt-4 pb-2">
                    <h2 className="uppercase" style={{ fontFamily: MONO, fontWeight: 600, fontSize: '13px', letterSpacing: '0.08em', ...S.accent }}>
                      items ({items.length}/{config?.maxItems || 100})
                    </h2>
                    {removingBg && <div className="text-[10px] mt-2 animate-pulse" style={{ color: 'var(--tb-highlight)' }}>removing background...</div>}
                    {bgError && <div className="text-[10px] mt-2" style={{ color: '#c44' }}>bg removal failed: {bgError}</div>}
                  </div>

                {items.length === 0 ? (
                  <div className="text-center py-12 uppercase" style={{ fontFamily: MONO, fontSize: '12px', letterSpacing: '0.08em', ...S.faint }}>no items yet — upload your first treasure</div>
                ) : (
                  <>
                    {/* Specimen grid — matches front page gallery style */}
                    <div className="grid grid-cols-3 sm:grid-cols-4" style={{ borderTop: '0.5px solid var(--tb-border)', borderLeft: '0.5px solid var(--tb-border)' }}>
                      {items.map((item, idx) => {
                        const isSelected = selectedItemId === item.id;
                        return (
                          <div
                            key={item.id}
                            className="aspect-square relative overflow-hidden flex items-center justify-center cursor-pointer"
                            style={{
                              borderRight: '0.5px solid var(--tb-border)',
                              borderBottom: '0.5px solid var(--tb-border)',
                              outline: isSelected ? '2px solid var(--tb-accent)' : 'none',
                              outlineOffset: '-2px',
                              zIndex: isSelected ? 1 : 0,
                            }}
                            onClick={() => setSelectedItemId(isSelected ? null : item.id)}
                          >
                            {/* Specimen label — top left, "01 — name" */}
                            <span className="absolute top-2.5 left-3 right-3 leading-none truncate select-none z-10 uppercase" style={{ fontFamily: MONO, fontWeight: 500, fontSize: '11px', letterSpacing: '0.08em', color: 'var(--tb-fg-faint)', fontVariantNumeric: 'tabular-nums' }}>
                              {String(idx + 1).padStart(2, '0')}&ensp;—&ensp;{item.label || 'untitled'}
                            </span>
                            {/* Item image */}
                            <img
                              src={item.imageUrl}
                              alt={item.label}
                              className="max-w-[70%] max-h-[70%] object-contain"
                              style={{ transform: `rotate(${item.rotation ?? 0}deg) scale(${Math.min(item.scale ?? 1, 1.8)})` }}
                              draggable={false}
                            />
                          </div>
                        );
                      })}
                      {/* Upload cell */}
                      {items.length < (config?.maxItems || 100) && (
                        <label
                          className="aspect-square flex flex-col items-center justify-center cursor-pointer"
                          style={{ borderRight: '0.5px solid var(--tb-border)', borderBottom: '0.5px solid var(--tb-border)' }}
                        >
                          <span className="text-lg leading-none mb-1" style={S.ghost}>+</span>
                          <span className="uppercase" style={{ fontFamily: MONO, fontWeight: 500, fontSize: '11px', letterSpacing: '0.08em', ...S.ghost }}>Upload</span>
                          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                        </label>
                      )}
                    </div>
                  </>
                )}

                {/* Upload cell for empty state */}
                {items.length === 0 && (
                  <label className="mx-4 mt-4 flex items-center justify-center gap-2 py-3 cursor-pointer uppercase"
                    style={{ fontFamily: MONO, fontSize: '12px', letterSpacing: '0.08em', border: '1px dashed var(--tb-border)', ...S.accent }}>
                    + Upload Your First Item
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                  </label>
                )}
                </div>{/* end scrollable */}

                {/* ── Fixed control panel — compact, no scroll ── */}
                {items.length > 0 && (
                  <div className="shrink-0" style={{ borderTop: '0.5px solid var(--tb-border)' }}>
                    {selectedItemId && (() => {
                      const item = items.find(i => i.id === selectedItemId);
                      if (!item) return null;
                      const itemIdx = items.findIndex(i => i.id === selectedItemId);
                      return (
                        <div className="px-4 py-3 flex flex-col gap-3">
                          {/* Row 1: Editable name (inline like Google Docs title) + delete */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-baseline gap-0 min-w-0">
                              <span className="uppercase shrink-0" style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: '16px', letterSpacing: '0.02em', ...S.accent }}>
                                {String(itemIdx + 1).padStart(2, '0')}&ensp;—&ensp;
                              </span>
                              <input
                                value={item.label}
                                onChange={e => handleUpdateItem(item.id, { label: e.target.value })}
                                placeholder="Item name"
                                className="bg-transparent outline-none uppercase min-w-0"
                                style={{
                                  fontFamily: DISPLAY, fontWeight: 700, fontSize: '16px', letterSpacing: '0.02em',
                                  color: 'var(--tb-fg)',
                                  borderBottom: '1px dashed var(--tb-border)',
                                  width: `${Math.max(4, (item.label || 'Item name').length) + 1}ch`,
                                  maxWidth: '100%',
                                }}
                              />
                            </div>
                            <button
                              onClick={() => { handleDeleteItem(item.id); setSelectedItemId(null); }}
                              className="cursor-pointer uppercase shrink-0 ml-3"
                              style={{ fontFamily: MONO, fontWeight: 600, fontSize: '11px', letterSpacing: '0.08em', border: '1px solid #c44', color: '#c44', background: 'transparent', padding: '4px 10px' }}
                            >
                              Delete
                            </button>
                          </div>

                          {/* Row 2: Link */}
                          <div>
                            <label className="block mb-1 uppercase" style={{ fontFamily: MONO, fontWeight: 700, fontSize: '11px', letterSpacing: '0.08em', color: 'var(--tb-fg-muted)' }}>Link <span style={{ fontWeight: 400, color: 'var(--tb-fg-ghost)' }}>— optional</span></label>
                            <input value={item.link || ''} onChange={e => handleUpdateItem(item.id, { link: e.target.value })} placeholder="Where does this link to?"
                              className="w-full bg-transparent outline-none"
                              style={{ fontFamily: MONO, fontSize: '13px', fontWeight: 400, letterSpacing: '0.02em', border: '0.5px solid var(--tb-border)', padding: '6px 8px', color: 'var(--tb-fg)' }} />
                          </div>

                          {/* Row 3: Story */}
                          <div>
                            <label className="block mb-1 uppercase" style={{ fontFamily: MONO, fontWeight: 700, fontSize: '11px', letterSpacing: '0.08em', color: 'var(--tb-fg-muted)' }}>Story <span style={{ fontWeight: 400, color: 'var(--tb-fg-ghost)' }}>— optional</span></label>
                            <textarea value={item.story || ''} onChange={e => handleUpdateItem(item.id, { story: e.target.value })} placeholder="What makes this special?" rows={2}
                              className="w-full bg-transparent outline-none resize-none"
                              style={{ fontFamily: MONO, fontSize: '13px', fontWeight: 400, letterSpacing: '0.02em', border: '0.5px solid var(--tb-border)', padding: '6px 8px', color: 'var(--tb-fg)' }} />
                          </div>

                          {/* Row 4: Sliders + BG toggle — single row */}
                          <div className="flex items-center gap-3 pt-2" style={{ borderTop: '0.5px solid var(--tb-border)' }}>
                            <div className="flex-1">
                              <Slider value={item.rotation ?? 0} min={0} max={360} step={1}
                                label="ROT" format={v => `${v}°`}
                                snap={v => { const n = Math.round(v / 90) * 90; return Math.abs(v - n) < 8 ? n % 360 : v; }}
                                onChange={v => handleUpdateItem(item.id, { rotation: v })} />
                            </div>
                            <div className="flex-1">
                              <Slider value={item.scale ?? 1} min={0.3} max={5} step={0.1}
                                label="SIZE" format={v => `${v.toFixed(1)}×`}
                                onChange={v => handleUpdateItem(item.id, { scale: v })} />
                            </div>
                            <button
                              onClick={() => handleToggleBgRemoval(item.id, item.bgRemoved === false)}
                              disabled={removingBg === item.id}
                              className="cursor-pointer uppercase shrink-0"
                              style={{
                                fontFamily: MONO, fontWeight: 600, fontSize: '11px', letterSpacing: '0.06em',
                                padding: '5px 12px',
                                border: `1px solid ${(item.bgRemoved !== false) ? 'var(--tb-accent)' : 'var(--tb-border)'}`,
                                color: (item.bgRemoved !== false) ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
                                background: 'transparent',
                              }}
                            >
                              {removingBg === item.id ? 'Removing...' : 'BG Removal'}
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                    {!selectedItemId && (
                      <div className="px-4 py-4 text-center uppercase" style={{ fontFamily: MONO, fontWeight: 400, fontSize: '12px', letterSpacing: '0.08em', ...S.ghost }}>
                        Select an item to edit
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* DRAWER tab */}
            {tab === 'drawer' && config && (
              <div className="p-4 flex-1 min-h-0 overflow-y-auto">
                {/* Top bar: title left, action buttons right */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-baseline gap-3">
                    <h2 className="uppercase" style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: '18px', letterSpacing: '0.02em', ...S.accent }}>Appearance</h2>
                    <span className="uppercase" style={{ fontFamily: MONO, fontWeight: 400, fontSize: '10px', letterSpacing: '0.08em', color: configStatus === 'saved' ? 'var(--tb-accent)' : 'var(--tb-fg-ghost)' }}>
                      {configStatus === 'saving' ? 'saving...' : configStatus === 'saved' ? 'saved ✓' : ''}
                    </span>
                  </div>
                  {drawerActionState && (
                    <div className="flex items-center gap-3">
                      {drawerActionState.hasExisting && !drawerActionState.generating && (
                        <button
                          onClick={drawerActionState.onReset}
                          className="cursor-pointer uppercase tb-link"
                          style={{ fontFamily: MONO, fontSize: '12px', fontWeight: 500, letterSpacing: '0.08em', color: 'var(--tb-fg-faint)', background: 'none', border: 'none' }}
                        >
                          Reset
                        </button>
                      )}
                      <button
                        onClick={drawerActionState.onGenerate}
                        disabled={drawerActionState.generating}
                        className="cursor-pointer uppercase tb-pill"
                        style={{
                          fontFamily: MONO, fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em',
                          padding: '6px 16px',
                          border: '1.5px solid var(--tb-accent)', color: 'var(--tb-accent)',
                          background: 'transparent',
                          opacity: drawerActionState.generating ? 0.5 : 1,
                        }}
                      >
                        {drawerActionState.generating ? 'Generating...' : drawerActionState.hasExisting ? 'Regenerate' : 'Generate'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Appearance — direction + style picker */}
                <div>
                  {/* Direction toggle — inside appearance */}
                  <div className="mb-4 pb-4" style={{ borderBottom: '0.5px solid var(--tb-border)' }}>
                    <CfgLabel>direction</CfgLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <CfgToggle active={!config.drawerFlipped} first onClick={() => setConfig({ ...config, drawerFlipped: false })}>normal</CfgToggle>
                      <CfgToggle active={!!config.drawerFlipped} first onClick={() => setConfig({ ...config, drawerFlipped: true })}>flipped</CfgToggle>
                    </div>
                  </div>

                  {/* AI style picker */}
                  <DrawerStylePicker
                    key={config.drawerImages?.generatedAt ?? 'ascii'}
                    userId={user.uid}
                    currentImages={config.drawerImages || undefined}
                    boxDimensions={config.boxDimensions}
                    hideActions
                    onActionState={setDrawerActionState}
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
                </div>

              </div>
            )}

            {/* SHARE */}
            {tab === 'share' && config && (
              <div className="p-4 overflow-y-auto flex-1 min-h-0">
                {/* Visibility */}
                <CfgGroup title="visibility" first>
                  <CfgSection>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <CfgToggle active={!config.isPublic} onClick={() => setConfig({ ...config, isPublic: false })}>private</CfgToggle>
                      <CfgToggle active={config.isPublic} onClick={() => setConfig({ ...config, isPublic: true })}>public</CfgToggle>
                    </div>
                    <CfgHint>public boxes appear in the gallery on the landing page</CfgHint>
                  </CfgSection>

                  {isAdmin && (
                  <CfgSection>
                    <CfgLabel>front page demo</CfgLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <CfgToggle active={!isDemoBox} onClick={async () => {
                        await setDemoBoxId(null);
                        setIsDemoBox(false);
                      }}>off</CfgToggle>
                      <CfgToggle active={isDemoBox} onClick={async () => {
                        await setDemoBoxId(user!.uid);
                        setIsDemoBox(true);
                      }}>on</CfgToggle>
                    </div>
                    <CfgHint>set your box as the landing page hero demo</CfgHint>
                  </CfgSection>
                  )}
                </CfgGroup>

                {/* Embed codes */}
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
                <div className="mb-6 h-6 flex items-center uppercase" style={{ fontFamily: MONO, fontWeight: 400, fontSize: '11px', letterSpacing: '0.08em', ...S.faint }}>
                  {configStatus === 'saving' && <span className="animate-pulse">saving...</span>}
                  {configStatus === 'saved' && <span style={S.accent}>saved &#10003;</span>}
                  {configStatus === 'idle' && <span style={S.ghost}>auto-saves on change</span>}
                </div>

                {/* ── DANGER ZONE ── */}
                {/* Danger zone — single row */}
                <div className="pt-4 mt-2 flex items-center justify-between" style={{ borderTop: '0.5px solid var(--tb-border)' }}>
                  <span className="uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '16px', letterSpacing: '0.04em', color: '#c44' }}>Danger Zone</span>
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="tb-pill cursor-pointer uppercase"
                      style={{ fontFamily: MONO, fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', border: '1px solid #c44', color: '#c44', background: 'transparent', padding: '6px 14px' }}
                    >
                      Delete My Box
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
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
                        className="cursor-pointer uppercase"
                        style={{ fontFamily: MONO, fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', border: '1px solid #c44', color: '#fff', background: '#c44', padding: '6px 14px', opacity: deleting ? 0.5 : 1 }}
                      >
                        {deleting ? 'Deleting...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="tb-pill cursor-pointer uppercase"
                        style={{ fontFamily: MONO, fontSize: '12px', fontWeight: 500, letterSpacing: '0.08em', border: '1px solid var(--tb-border)', color: 'var(--tb-fg-faint)', background: 'transparent', padding: '6px 14px' }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Live Preview — desktop only (mobile uses compact preview above) */}
        <div className="hidden lg:flex flex-col overflow-hidden" style={{ background: 'var(--tb-bg-subtle)' }}>
          <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: '0.5px solid var(--tb-border)' }}>
            <span className="uppercase" style={{ fontFamily: MONO, fontWeight: 600, fontSize: '13px', letterSpacing: '0.08em', ...S.faint }}>Live Preview</span>
            <span className="uppercase px-2 py-[2px]" style={{ fontFamily: MONO, fontWeight: 400, fontSize: '10px', letterSpacing: '0.12em', ...S.ghost, border: '0.5px solid var(--tb-border)' }}>live</span>
          </div>
          <div className="flex-1 flex items-center justify-center relative overflow-hidden"
            style={{ background: '#cccccc' }}>
            {config && (
              <UnifiedPreview
                config={config}
                items={items}
                useEmbedPosition={tab === 'share'}
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
  return <div className="mb-5 pb-5" style={{ borderBottom: '0.5px solid var(--tb-border)' }}>{children}</div>;
}
function CfgLabel({ children }: { children: React.ReactNode }) {
  return <label className="block mb-2 uppercase" style={{ fontFamily: "'Inconsolata', monospace", fontWeight: 500, fontSize: '12px', letterSpacing: '0.08em', color: 'var(--tb-fg-faint)' }}>{children}</label>;
}
function CfgHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-[6px]" style={{ fontFamily: "'Inconsolata', monospace", fontWeight: 400, fontSize: '11px', letterSpacing: '0.04em', color: 'var(--tb-fg-ghost)' }}>{children}</p>;
}
function CfgGroup({ title, hint, children, first }: { title: string; hint?: string; children: React.ReactNode; first?: boolean }) {
  return (
    <div style={{ borderTop: first ? 'none' : '0.5px solid var(--tb-border)' }}
      className={first ? 'mb-4' : 'pt-5 mt-3 mb-4'}>
      <h3 className="mb-1 uppercase"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '16px', letterSpacing: '0.04em', color: 'var(--tb-accent)' }}>{title}</h3>
      {hint && <p className="mb-4" style={{ fontFamily: "'Inconsolata', monospace", fontWeight: 400, fontSize: '11px', letterSpacing: '0.04em', color: 'var(--tb-fg-ghost)' }}>{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </div>
  );
}
function CfgToggle({ active, children, onClick }: { active: boolean; first?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="tb-pill cursor-pointer transition-all uppercase"
      style={{
        fontFamily: "'Inconsolata', monospace",
        fontWeight: active ? 700 : 500,
        fontSize: '13px',
        letterSpacing: '0.08em',
        padding: '7px 16px',
        width: '100%',
        textAlign: 'center',
        border: `1px solid ${active ? 'var(--tb-accent)' : 'var(--tb-border)'}`,
        color: active ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
        background: active ? 'var(--tb-bg-muted)' : 'transparent',
      }}>{children}</button>
  );
}

/** Unified preview — shows TreasureBox centered or anchored to embed position */
function UnifiedPreview({
  config,
  items,
  useEmbedPosition,
}: {
  config: BoxConfig;
  items: TreasureItem[];
  useEmbedPosition?: boolean;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const handleReady = useCallback(() => setPreviewReady(true), []);

  // Reset readiness when drawer images change
  useEffect(() => {
    setPreviewReady(false);
  }, [config.drawerImages?.spriteUrl]);

  // Track container size for anchor positioning
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setDims({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const drawerStyle = useMemo((): React.CSSProperties => {
    if (!previewRef.current) return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

    if (useEmbedPosition && config.embedSettings) {
      const pos = config.embedSettings.position || { anchor: 'bottom-right' as const, offsetX: 20, offsetY: 20 };
      const anchor = pos.anchor || 'bottom-right';
      const ox = pos.offsetX ?? 20;
      const oy = pos.offsetY ?? 20;
      // The drawer element's layout size is unscaled, but the visual size is scaled by boxScale.
      // transform-origin: center means scaling leaves equal invisible space on all sides.
      // Compensate by shifting the position by half the difference between layout and visual size.
      const scale = config.boxScale ?? 1;
      // We don't know the exact drawer dimensions here, but we can use a transform
      // to shift the drawer so its visual edge aligns with the offset.
      // translateX/Y shifts by percentage of the element's own size.
      const shiftPct = ((1 - scale) / 2) * 100; // % of element size that's invisible on each side

      const style: React.CSSProperties = { position: 'absolute' };
      if (anchor.includes('top')) {
        style.top = oy;
        style.transform = `translateY(-${shiftPct}%)`;
      } else {
        style.bottom = oy;
        style.transform = `translateY(${shiftPct}%)`;
      }
      if (anchor.includes('left')) {
        style.left = ox;
        style.transform = (style.transform || '') + ` translateX(-${shiftPct}%)`;
      } else {
        style.right = ox;
        style.transform = (style.transform || '') + ` translateX(${shiftPct}%)`;
      }

      return style;
    }

    return computeCenteredDrawerPosition(previewRef.current.offsetWidth, previewRef.current.offsetHeight);
  }, [config, useEmbedPosition, dims]);

  // Spawn origin based on anchor position
  const spawnOrigin = useMemo(() => {
    if (useEmbedPosition && config.embedSettings && dims.w > 0) {
      const pos = config.embedSettings.position || { anchor: 'bottom-right' as const, offsetX: 20, offsetY: 20 };
      const anchor = pos.anchor || 'bottom-right';
      const ox = pos.offsetX ?? 20;
      const oy = pos.offsetY ?? 20;

      const x = anchor.includes('left') ? ox / dims.w : 1 - ox / dims.w;
      const y = anchor.includes('top') ? oy / dims.h : 1 - oy / dims.h;
      return { x: Math.max(0.1, Math.min(0.9, x)), y: Math.max(0.1, Math.min(0.9, y)) };
    }
    return computeCenteredSpawnOrigin();
  }, [config, useEmbedPosition, dims]);

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
            spawnOrigin,
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
