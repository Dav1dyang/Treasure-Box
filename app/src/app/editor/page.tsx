'use client';

import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import {
  getBoxConfig, saveBoxConfig,
  getItems, saveItem, deleteItem,
  uploadImage, uploadProcessedImage, deleteImage,
  clearDrawerImages,
} from '@/lib/firestore';
import type { TreasureItem, BoxConfig, SoundPreset, DrawerImages, EmbedSettings } from '@/lib/types';
import TreasureBox from '@/components/TreasureBox';
import DrawerStylePicker from '@/components/DrawerStylePicker';
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

function ScaleControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-[6px]">
      <span className="text-[9px] shrink-0" style={{ color: 'var(--tb-fg-faint)' }}>size</span>
      <input
        type="range" min={0.5} max={2} step={0.1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: 80, accentColor: 'var(--tb-accent)' }}
      />
      <span className="text-[9px] min-w-[24px] text-right" style={{ color: 'var(--tb-fg-faint)' }}>
        {value.toFixed(1)}&times;
      </span>
    </div>
  );
}

function RotationControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // Snap to nearest 90° if within 8° threshold
  const snap = (v: number) => {
    const nearest90 = Math.round(v / 90) * 90;
    return Math.abs(v - nearest90) < 8 ? nearest90 % 360 : v;
  };
  return (
    <div className="flex items-center gap-[6px]">
      <span className="text-[9px] shrink-0" style={{ color: 'var(--tb-fg-faint)' }}>rot</span>
      <input
        type="range" min={0} max={360} step={1}
        value={value}
        onChange={e => onChange(snap(Number(e.target.value)))}
        style={{ width: 80, accentColor: 'var(--tb-accent)' }}
      />
      <span className="text-[9px] min-w-[24px] text-right" style={{ color: 'var(--tb-fg-faint)' }}>
        {value}&deg;
      </span>
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
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/remove-bg', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        if (data.error) {
          setBgError(data.error);
        }
        if (data.bgRemoved && data.image) {
          // Convert base64 PNG to Blob and upload to Firebase Storage
          const byteString = atob(data.image);
          const bytes = new Uint8Array(byteString.length);
          for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'image/png' });
          processedUrl = await uploadProcessedImage(user.uid, blob, id);
          if (data.contourPoints) {
            contourPoints = data.contourPoints;
          }
        }
      }
    } catch { /* fallback to original */ } finally { setRemovingBg(null); }
    const newItem: TreasureItem = {
      id, imageUrl: processedUrl, originalImageUrl: originalUrl,
      label: file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
      story: '', link: '', order: items.length, rotation: 0, createdAt: Date.now(),
      ...(contourPoints && { contourPoints }),
    };
    await saveItem(user.uid, newItem);
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
    const item = items.find(i => i.id === id);
    if (item) {
      // Clean up images from Storage to avoid orphaned files
      deleteImage(`boxes/${user.uid}/${id}_original`);
      deleteImage(`boxes/${user.uid}/processed_${id}`);
    }
    await deleteItem(user.uid, id);
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
                <div className="space-y-2">
                  {items.map(item => (
                    <div key={item.id} className="p-3 transition-colors" style={{ border: '1px solid var(--tb-border-subtle)' }}>
                      <div className="grid grid-cols-[56px_1fr_20px] gap-3">
                        <div className="w-14 h-14 flex items-center justify-center overflow-hidden shrink-0" style={{ background: 'var(--tb-bg-muted)' }}>
                          <img src={item.imageUrl} alt={item.label} className="max-w-full max-h-full object-contain transition-transform" style={{ transform: `rotate(${item.rotation ?? 0}deg) scale(${item.scale ?? 1})` }} />
                        </div>
                        <div className="flex flex-col gap-[6px] min-w-0">
                          <input value={item.label} onChange={e => handleUpdateItem(item.id, { label: e.target.value })} placeholder="label"
                            className="w-full bg-transparent text-[11px] pb-[2px] outline-none" style={{ borderBottom: '1px solid var(--tb-border-subtle)', ...S.accent }} />
                          <input value={item.link || ''} onChange={e => handleUpdateItem(item.id, { link: e.target.value })} placeholder="link (https://...)"
                            className="w-full bg-transparent text-[10px] pb-[2px] outline-none" style={{ borderBottom: '1px solid var(--tb-border-subtle)', color: 'var(--tb-fg)' }} />
                          <textarea value={item.story || ''} onChange={e => handleUpdateItem(item.id, { story: e.target.value })} placeholder="story (shown on long-press)" rows={2}
                            className="w-full bg-transparent text-[10px] pb-[2px] outline-none resize-none" style={{ borderBottom: '1px solid var(--tb-border-subtle)', color: 'var(--tb-fg)' }} />
                          <RotationControl value={item.rotation ?? 0} onChange={v => handleUpdateItem(item.id, { rotation: v })} />
                          <ScaleControl value={item.scale ?? 1} onChange={v => handleUpdateItem(item.id, { scale: v })} />
                        </div>
                        <button onClick={() => handleDeleteItem(item.id)} className="text-sm self-start cursor-pointer leading-none" style={S.ghost}>&times;</button>
                      </div>
                    </div>
                  ))}
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

                <div className="text-[10px] tracking-[0.12em] mb-6 h-6 flex items-center" style={S.faint}>
                  {configStatus === 'saving' && <span className="animate-pulse">saving...</span>}
                  {configStatus === 'saved' && <span style={S.accent}>saved &#10003;</span>}
                  {configStatus === 'idle' && <span style={S.ghost}>auto-saves on change</span>}
                </div>

                <div className="pt-6 mt-2" style={{ borderTop: '1px solid var(--tb-border-subtle)' }}>
                  <h3 className="text-[11px] mb-4 tracking-[0.12em] uppercase" style={S.accent}>drawer appearance (AI generated)</h3>
                  <DrawerStylePicker
                    userId={user.uid}
                    currentImages={config.drawerImages || undefined}
                    onComplete={(images: DrawerImages) => setConfig({ ...config, drawerImages: images })}
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
            {config && tab === 'embed' && config.embedSettings?.mode === 'floating' ? (
              // Floating mode preview: mock page with floating box
              <div className="w-full h-full relative" style={{ background: 'var(--tb-bg-subtle)' }}>
                {/* Mock page content */}
                <div className="p-6 space-y-3 opacity-30">
                  <div className="h-4 w-3/4 rounded" style={{ background: 'var(--tb-border)' }} />
                  <div className="h-3 w-full rounded" style={{ background: 'var(--tb-border-subtle)' }} />
                  <div className="h-3 w-5/6 rounded" style={{ background: 'var(--tb-border-subtle)' }} />
                  <div className="h-20 w-full rounded mt-4" style={{ background: 'var(--tb-border-subtle)' }} />
                  <div className="h-3 w-full rounded" style={{ background: 'var(--tb-border-subtle)' }} />
                  <div className="h-3 w-2/3 rounded" style={{ background: 'var(--tb-border-subtle)' }} />
                </div>
                {/* Floating box positioned by anchor */}
                <div
                  className="absolute"
                  style={{
                    width: Math.min(config.embedSettings.width * 0.4, 250),
                    height: Math.min(config.embedSettings.height * 0.4, 250),
                    ...(config.embedSettings.position.anchor.includes('bottom') ? { bottom: `${config.embedSettings.position.yPercent}%` } : { top: `${config.embedSettings.position.yPercent}%` }),
                    ...(config.embedSettings.position.anchor.includes('right') ? { right: `${config.embedSettings.position.xPercent}%` } : { left: `${config.embedSettings.position.xPercent}%` }),
                  }}
                >
                  <TreasureBox items={items} config={config} />
                </div>
              </div>
            ) : config && tab === 'embed' && config.embedSettings?.mode === 'fullpage' ? (
              // Full-page mode preview: show box at pin position
              <div className="w-full h-full relative" style={{ background: 'var(--tb-bg-subtle)' }}>
                <div className="p-6 space-y-3 opacity-30">
                  <div className="h-4 w-3/4 rounded" style={{ background: 'var(--tb-border)' }} />
                  <div className="h-3 w-full rounded" style={{ background: 'var(--tb-border-subtle)' }} />
                  <div className="h-3 w-5/6 rounded" style={{ background: 'var(--tb-border-subtle)' }} />
                  <div className="h-20 w-full rounded mt-4" style={{ background: 'var(--tb-border-subtle)' }} />
                </div>
                <div
                  className="absolute"
                  style={{
                    width: Math.min(config.embedSettings.width * 0.35, 220),
                    height: Math.min(config.embedSettings.height * 0.35, 220),
                    ...(config.embedSettings.position.anchor.includes('bottom') ? { bottom: `${config.embedSettings.position.yPercent}%` } : { top: `${config.embedSettings.position.yPercent}%` }),
                    ...(config.embedSettings.position.anchor.includes('right') ? { right: `${config.embedSettings.position.xPercent}%` } : { left: `${config.embedSettings.position.xPercent}%` }),
                  }}
                >
                  <TreasureBox items={items} config={config} />
                </div>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[8px] px-2 py-1" style={{ ...S.ghost, background: 'var(--tb-bg)', border: '1px solid var(--tb-border-subtle)' }}>
                  items will fly across the host page
                </div>
              </div>
            ) : (
              // Default / Contained mode preview
              <>
                {config && (
                  <div
                    style={{
                      width: tab === 'embed' && config.embedSettings
                        ? `${Math.min(config.embedSettings.width * 0.6, 450)}px`
                        : '90%',
                      maxWidth: 500,
                      aspectRatio: tab === 'embed' && config.embedSettings
                        ? `${config.embedSettings.width} / ${config.embedSettings.height}`
                        : '1 / 1',
                    }}
                  >
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
