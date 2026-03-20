'use client';

import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  getBoxConfig, saveBoxConfig,
  getItems, saveItem,
  uploadImage, uploadProcessedImage,
  clearDrawerImages, deleteItemWithCleanup, deleteBox,
} from '@/lib/firestore';
import type { TreasureItem, BoxConfig, SoundPreset, DrawerImages, EmbedSettings } from '@/lib/types';
import TreasureBox from '@/components/TreasureBox';
import DrawerStylePicker from '@/components/DrawerStylePicker';
import { extractContourFromImage } from '@/lib/contour';
import EmbedConfigurator from '@/components/EmbedConfigurator';

const DEFAULT_CONFIG: Omit<BoxConfig, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'> = {
  title: 'My Treasure Box',
  backgroundColor: 'transparent',
  drawerLabel: 'TREASURE BOX',
  maxItems: 15,
  soundEnabled: true,
  soundVolume: 0.3,
  soundPreset: 'metallic',
  isPublic: false,
};

const SOUND_PRESETS: SoundPreset[] = ['metallic', 'wooden', 'glass', 'paper', 'silent'];
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

function Dial({ value, min, max, step, label, format, onChange, snap }: {
  value: number; min: number; max: number; step: number;
  label: string; format: (v: number) => string;
  onChange: (v: number) => void;
  snap?: (v: number) => number;
}) {
  const dialRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

  const range = max - min;
  const normalized = (value - min) / range; // 0-1
  // Arc spans 270° (from 135° to 405°, i.e. gap at bottom-left)
  const startAngle = 135;
  const sweep = 270;
  const angle = startAngle + normalized * sweep;

  const r = 18; const cx = 22; const cy = 22;
  const toXY = (deg: number) => ({
    x: cx + r * Math.cos((deg * Math.PI) / 180),
    y: cy + r * Math.sin((deg * Math.PI) / 180),
  });

  const trackStart = toXY(startAngle);
  const trackEnd = toXY(startAngle + sweep);
  const valPos = toXY(angle);

  const arcPath = (from: { x: number; y: number }, to: { x: number; y: number }, degrees: number) => {
    const large = degrees > 180 ? 1 : 0;
    return `M ${from.x} ${from.y} A ${r} ${r} 0 ${large} 1 ${to.x} ${to.y}`;
  };

  const updateFromPointer = useCallback((clientX: number, clientY: number) => {
    const svg = dialRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI; // -180 to 180
    // Convert to our arc space (135° start)
    let rel = deg - startAngle;
    if (rel < -180) rel += 360;
    if (rel < 0) rel = 0;
    if (rel > sweep) rel = sweep;
    let raw = min + (rel / sweep) * range;
    raw = Math.round(raw / step) * step;
    raw = Math.max(min, Math.min(max, raw));
    onChange(snap ? snap(raw) : raw);
  }, [min, max, step, range, sweep, startAngle, onChange, snap]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX, e.clientY);
  }, [updateFromPointer]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    updateFromPointer(e.clientX, e.clientY);
  }, [updateFromPointer]);

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  return (
    <div className="flex flex-col items-center gap-0">
      <svg ref={dialRef} width={44} height={44} className="cursor-pointer"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        style={{ touchAction: 'none' }}>
        {/* Track */}
        <path d={arcPath(trackStart, trackEnd, sweep)} fill="none"
          stroke="var(--tb-border-subtle)" strokeWidth={4} strokeLinecap="round" />
        {/* Value arc */}
        {normalized > 0.005 && (
          <path d={arcPath(trackStart, valPos, normalized * sweep)} fill="none"
            stroke="var(--tb-accent)" strokeWidth={4} strokeLinecap="round" />
        )}
        {/* Knob dot */}
        <circle cx={valPos.x} cy={valPos.y} r={3.5} fill="var(--tb-accent)" />
        {/* Center label */}
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fill="var(--tb-fg-faint)" fontSize={8} fontFamily="'IBM Plex Mono', monospace">
          {format(value)}
        </text>
      </svg>
      <span className="text-[8px] mt-[-2px]" style={{ color: 'var(--tb-fg-ghost)' }}>{label}</span>
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    configLoadedRef.current = false;
    (async () => {
      let box = await getBoxConfig(user.uid);
      if (!box) {
        box = { ...DEFAULT_CONFIG, id: user.uid, ownerId: user.uid, createdAt: Date.now(), updatedAt: Date.now() };
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
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[11px] tracking-[0.12em] uppercase" style={S.accent}>items ({items.length}/{config?.maxItems || 15})</h2>
                  {items.length >= (config?.maxItems || 15) ? (
                    <span className="text-[10px] px-[14px] py-[6px] tracking-[0.12em]" style={S.faint}>max reached</span>
                  ) : (
                    <label className="text-[10px] px-[14px] py-[6px] cursor-pointer tracking-[0.12em] transition-colors"
                      style={{ border: '1px solid var(--tb-border)', ...S.accent }}>
                      + upload
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                    </label>
                  )}
                </div>
                {removingBg && <div className="text-[10px] mb-3 animate-pulse" style={{ color: 'var(--tb-highlight)' }}>removing background...</div>}
                {bgError && <div className="text-[10px] mb-3" style={{ color: '#c44' }}>bg removal failed: {bgError}</div>}
                <div className="space-y-[6px]">
                  {items.map(item => {
                    const isExpanded = expandedItems.has(item.id);
                    const hasLink = !!item.link;
                    const hasStory = !!item.story;
                    return (
                      <div key={item.id} className="transition-colors" style={{ border: '1px solid var(--tb-border-subtle)' }}>
                        {/* Row 1: compact header — always visible */}
                        <div
                          className="grid grid-cols-[40px_1fr_auto_auto_20px] gap-2 items-center px-2 py-[6px] cursor-pointer"
                          onClick={() => setExpandedItems(prev => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                            return next;
                          })}
                        >
                          <div className="w-10 h-10 flex items-center justify-center overflow-hidden shrink-0" style={{ background: 'var(--tb-bg-muted)' }}>
                            <img src={item.imageUrl} alt={item.label} className="max-w-full max-h-full object-contain transition-transform" style={{ transform: `rotate(${item.rotation ?? 0}deg) scale(${Math.min(item.scale ?? 1, 1.8)})` }} />
                          </div>
                          <div className="flex items-center gap-2 min-w-0">
                            <input value={item.label} onChange={e => { e.stopPropagation(); handleUpdateItem(item.id, { label: e.target.value }); }} placeholder="label"
                              onClick={e => e.stopPropagation()}
                              className="w-full bg-transparent text-[11px] pb-[2px] outline-none min-w-0" style={{ borderBottom: '1px solid var(--tb-border-subtle)', ...S.accent }} />
                            {/* Indicator dots for link/story */}
                            {!isExpanded && (hasLink || hasStory) && (
                              <div className="flex gap-[3px] shrink-0">
                                {hasLink && <div className="w-[5px] h-[5px] rounded-full" style={{ background: 'var(--tb-accent)', opacity: 0.5 }} title="has link" />}
                                {hasStory && <div className="w-[5px] h-[5px] rounded-full" style={{ background: 'var(--tb-highlight, var(--tb-accent))', opacity: 0.5 }} title="has story" />}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <Dial value={item.rotation ?? 0} min={0} max={360} step={1}
                              label="rot" format={v => `${v}°`}
                              snap={v => { const n = Math.round(v / 90) * 90; return Math.abs(v - n) < 8 ? n % 360 : v; }}
                              onChange={v => handleUpdateItem(item.id, { rotation: v })} />
                            <Dial value={item.scale ?? 1} min={0.5} max={3} step={0.1}
                              label="size" format={v => `${v.toFixed(1)}×`}
                              onChange={v => handleUpdateItem(item.id, { scale: v })} />
                          </div>
                          <span className="text-[10px] select-none" style={S.ghost}>{isExpanded ? '▾' : '▸'}</span>
                          <button onClick={e => { e.stopPropagation(); handleDeleteItem(item.id); }} className="text-sm cursor-pointer leading-none" style={S.ghost}>&times;</button>
                        </div>
                        {/* Row 2: collapsible details */}
                        {isExpanded && (
                          <div className="pl-[52px] pr-3 pb-3 flex flex-col gap-[6px]">
                            <input value={item.link || ''} onChange={e => handleUpdateItem(item.id, { link: e.target.value })} placeholder="link (https://...)"
                              className="w-full bg-transparent text-[10px] pb-[2px] outline-none" style={{ borderBottom: '1px solid var(--tb-border-subtle)', color: 'var(--tb-fg)' }} />
                            <textarea value={item.story || ''} onChange={e => handleUpdateItem(item.id, { story: e.target.value })} placeholder="story (shown on long-press)" rows={2}
                              className="w-full bg-transparent text-[10px] pb-[2px] outline-none resize-none" style={{ borderBottom: '1px solid var(--tb-border-subtle)', color: 'var(--tb-fg)' }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {items.length === 0 && <div className="text-center py-12 text-[10px]" style={S.faint}>no items yet — upload your first treasure</div>}
                </div>
              </div>
            )}

            {/* CONFIG */}
            {tab === 'config' && config && (
              <div>
                <CfgSection>
                  <CfgLabel>visibility</CfgLabel>
                  <div className="flex">
                    <CfgToggle active={!config.isPublic} first onClick={() => setConfig({ ...config, isPublic: false })}>private</CfgToggle>
                    <CfgToggle active={config.isPublic} onClick={() => setConfig({ ...config, isPublic: true })}>public</CfgToggle>
                  </div>
                  <CfgHint>public boxes appear in the gallery on the landing page</CfgHint>
                </CfgSection>

                <CfgSection>
                  <CfgLabel>owner name (optional)</CfgLabel>
                  <input type="text" value={config.ownerName || ''} onChange={e => setConfig({ ...config, ownerName: e.target.value })}
                    placeholder="displayed on your box" className="w-full bg-transparent text-[10px] p-2 outline-none"
                    style={{ border: '1px solid var(--tb-border-subtle)', ...S.accent }} />
                  <CfgHint>shown at the bottom corner of your treasure box</CfgHint>
                </CfgSection>

                <CfgSection>
                  <CfgLabel>drawer label</CfgLabel>
                  <input type="text" value={config.drawerLabel} onChange={e => setConfig({ ...config, drawerLabel: e.target.value })}
                    className="w-full bg-transparent text-[10px] p-2 outline-none"
                    style={{ border: '1px solid var(--tb-border-subtle)', ...S.accent }} />
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

                <CfgSection>
                  <CfgLabel>content scale</CfgLabel>
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min={0.5} max={2} step={0.05}
                      value={config.contentScale ?? 1}
                      onChange={e => setConfig({ ...config, contentScale: Number(e.target.value) })}
                      className="flex-1"
                      style={{ accentColor: 'var(--tb-accent)' }}
                    />
                    <span className="text-[10px] min-w-[32px] text-right font-mono" style={S.accent}>
                      {(config.contentScale ?? 1).toFixed(2)}&times;
                    </span>
                    {(config.contentScale ?? 1) !== 1 && (
                      <button
                        onClick={() => setConfig({ ...config, contentScale: 1 })}
                        className="text-[9px] px-2 py-[2px] cursor-pointer"
                        style={{ border: '1px solid var(--tb-border-subtle)', color: 'var(--tb-fg-faint)' }}
                      >
                        reset
                      </button>
                    )}
                  </div>
                  <CfgHint>scales the drawer size and physics area (0.5× – 2.0×) — reopen drawer to see effect</CfgHint>
                </CfgSection>

                <CfgSection>
                  <CfgLabel>item effects</CfgLabel>
                  <div className="flex flex-col gap-3">
                    {/* Brightness */}
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] w-16 shrink-0" style={S.faint}>brightness</span>
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
                    {/* Contrast */}
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] w-16 shrink-0" style={S.faint}>contrast</span>
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
                    {/* Tint + B&W */}
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
                  </div>
                  <CfgHint>adjust brightness, contrast, and color tint for all items</CfgHint>
                </CfgSection>

                <div className="text-[10px] tracking-[0.12em] mb-6 h-6 flex items-center" style={S.faint}>
                  {configStatus === 'saving' && <span className="animate-pulse">saving...</span>}
                  {configStatus === 'saved' && <span style={S.accent}>saved &#10003;</span>}
                  {configStatus === 'idle' && <span style={S.ghost}>auto-saves on change</span>}
                </div>

                <div className="pt-6 mt-2" style={{ borderTop: '1px solid var(--tb-border-subtle)' }}>
                  <h3 className="text-[11px] mb-4 tracking-[0.12em] uppercase" style={S.accent}>danger zone</h3>
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

                <div className="pt-6 mt-2" style={{ borderTop: '1px solid var(--tb-border-subtle)' }}>
                  <h3 className="text-[11px] mb-4 tracking-[0.12em] uppercase" style={S.accent}>drawer appearance (AI generated)</h3>
                  <DrawerStylePicker
                    userId={user.uid}
                    currentImages={config.drawerImages || undefined}
                    onComplete={(images: DrawerImages) => { skipAutoSaveRef.current = true; setConfig({ ...config, drawerImages: images }); }}
                    onReset={async () => { await clearDrawerImages(user.uid); setConfig({ ...config, drawerImages: undefined }); }}
                  />
                </div>
              </div>
            )}

            {/* EMBED */}
            {tab === 'embed' && config && user && (
              <EmbedConfigurator
                config={config}
                userId={user.uid}
                onSettingsChange={(settings: EmbedSettings) => setConfig({ ...config, embedSettings: settings })}
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
            {config && tab === 'embed' ? (
              // Embed tab: preview with mock website background
              <div className="w-full h-full relative" style={{ background: 'var(--tb-bg)' }}>
                <MockWebsitePlaceholder />

                {config.embedSettings?.mode === 'overlay' || !config.embedSettings || config.embedSettings.mode !== 'contained' ? (
                  // Overlay mode: TreasureBox fills preview so items fly freely
                  <>
                    <div className="absolute inset-0" style={{ zIndex: 5 }}>
                      <TreasureBox items={items} config={config} />
                    </div>
                    {/* Anchor position indicator — shows where the widget will actually sit */}
                    {(() => {
                      const es = config.embedSettings;
                      const anchor = es?.position.anchor ?? 'bottom-right';
                      const offX = es?.position.offsetX ?? 32;
                      const offY = es?.position.offsetY ?? 32;
                      // Scale: preview is ~600px wide, reference viewport is 1440
                      const sw = Math.max(30, (es?.width ?? 350) * 0.25);
                      const sh = Math.max(24, (es?.height ?? 300) * 0.25);
                      const soX = offX * 0.25;
                      const soY = offY * 0.25;
                      return (
                        <div
                          className="absolute border border-dashed pointer-events-none"
                          style={{
                            borderColor: 'var(--tb-accent)',
                            opacity: 0.35,
                            width: sw,
                            height: sh,
                            zIndex: 20,
                            ...(anchor.includes('bottom') ? { bottom: soY } : { top: soY }),
                            ...(anchor.includes('right') ? { right: soX } : { left: soX }),
                          }}
                        >
                          <span className="absolute -top-4 left-0 text-[7px] whitespace-nowrap" style={S.ghost}>
                            widget position
                          </span>
                        </div>
                      );
                    })()}
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[8px] px-2 py-1" style={{ ...S.ghost, background: 'var(--tb-bg)', border: '1px solid var(--tb-border-subtle)', zIndex: 25 }}>
                      items fly across the host page when opened
                    </div>
                  </>
                ) : (
                  // Contained mode — centered box over placeholder site
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div
                      style={{
                        width: config.embedSettings
                          ? `${Math.min(config.embedSettings.width * 0.6, 450)}px`
                          : '90%',
                        maxWidth: 500,
                        aspectRatio: config.embedSettings
                          ? `${config.embedSettings.width} / ${config.embedSettings.height}`
                          : '1 / 1',
                      }}
                    >
                      <TreasureBox items={items} config={config} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Items / Config tabs: plain preview, no mock site
              <>
                {config && (
                  <div style={{ width: '90%', maxWidth: 500, aspectRatio: '1 / 1' }}>
                    <TreasureBox items={items} config={config} />
                  </div>
                )}
                {config?.ownerName && <div className="absolute bottom-2 left-3 text-[8px] tracking-wider" style={S.faint}>{config.ownerName}</div>}
              </>
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
