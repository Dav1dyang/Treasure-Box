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
import type { TreasureItem, BoxConfig, SoundPreset, DrawerImages } from '@/lib/types';
import TreasureBox from '@/components/TreasureBox';
import DrawerStylePicker from '@/components/DrawerStylePicker';
import { extractContourFromImage } from '@/lib/contour';

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
    const originalUrl = await uploadImage(user.uid, file, `${id}_original`);
    let processedUrl = originalUrl;
    try {
      setRemovingBg(id);
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/remove-bg', { method: 'POST', body: formData });
      if (res.ok) {
        const bgRemoved = res.headers.get('X-Bg-Removed') === 'true';
        if (bgRemoved) {
          const blob = await res.blob();
          processedUrl = await uploadProcessedImage(user.uid, blob, id);
        }
      }
    } catch { /* fallback */ } finally { setRemovingBg(null); }
    // Extract contour from bg-removed image's alpha channel for physics shapes
    let contourPoints: { x: number; y: number }[] | undefined;
    if (processedUrl !== originalUrl) {
      try {
        const contourRes = await fetch(processedUrl);
        const contourBlob = await contourRes.blob();
        const img = new Image();
        const blobUrl = URL.createObjectURL(contourBlob);
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = blobUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        URL.revokeObjectURL(blobUrl);
        contourPoints = extractContourFromImage(imageData);
      } catch { /* fallback to rectangle physics */ }
    }
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

  const getEmbedCode = (type: 'iframe' | 'script') => {
    if (!user) return '';
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const bg = encodeURIComponent(config?.backgroundColor || 'transparent');
    if (type === 'iframe') {
      return `<iframe\n  src="${baseUrl}/embed?box=${user.uid}&bg=${bg}"\n  width="700" height="700"\n  style="border:none;overflow:hidden"\n  loading="lazy"\n></iframe>`;
    }
    return `<div id="treasure-box-embed"></div>\n<script src="${baseUrl}/embed/widget.js"\n  data-box-id="${user.uid}"\n  data-bg="${config?.backgroundColor || 'transparent'}"\n  data-width="700" data-height="700">\n</script>`;
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
            {tab === 'embed' && (
              <div className="space-y-5">
                {(['iframe', 'script'] as const).map(type => (
                  <div key={type}>
                    <label className="text-[10px] block mb-[6px]" style={S.faint}>{type === 'iframe' ? 'iframe (recommended)' : 'inline script'}</label>
                    <pre className="p-3 text-[9px] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed"
                      style={{ background: 'var(--tb-bg-muted)', color: 'var(--tb-fg-muted)' }}>{getEmbedCode(type)}</pre>
                    <button onClick={() => navigator.clipboard.writeText(getEmbedCode(type))}
                      className="mt-[6px] text-[9px] px-3 py-1 cursor-pointer" style={{ border: '1px solid var(--tb-border)', ...S.muted }}>copy</button>
                  </div>
                ))}
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
            style={{
              background: config?.backgroundColor === 'transparent'
                ? 'repeating-conic-gradient(var(--tb-bg-muted) 0% 25%, var(--tb-bg-subtle) 0% 50%) 50% / 16px 16px'
                : config?.backgroundColor || 'var(--tb-bg)',
            }}>
            {config && <div className="w-[90%] max-w-[500px] aspect-square"><TreasureBox items={items} config={config} /></div>}
            {config?.ownerName && <div className="absolute bottom-2 left-3 text-[8px] tracking-wider" style={S.faint}>{config.ownerName}</div>}
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
