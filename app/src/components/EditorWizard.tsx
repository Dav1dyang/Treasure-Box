'use client';

import { useState, useRef } from 'react';
import type { TreasureItem, BoxConfig, DrawerImages, EmbedSettings, SoundPreset } from '@/lib/types';
import DrawerStylePicker from './DrawerStylePicker';
import EmbedConfigurator from './EmbedConfigurator';
import TreasureBox from './TreasureBox';
import {
  uploadImage, uploadProcessedImage,
  saveItem, clearDrawerImages,
} from '@/lib/firestore';
import { extractContourFromImage } from '@/lib/contour';

const SOUND_PRESETS: SoundPreset[] = ['metallic', 'wooden', 'glass', 'paper', 'silent'];

interface WizardProps {
  userId: string;
  config: BoxConfig;
  items: TreasureItem[];
  onConfigChange: (config: BoxConfig) => void;
  onItemsChange: (items: TreasureItem[]) => void;
  onComplete: () => void;
}

const STEPS = [
  { num: 1, label: 'BUILD BOX' },
  { num: 2, label: 'ADD ITEMS' },
  { num: 3, label: 'SHARE' },
] as const;

export default function EditorWizard({
  userId, config, items, onConfigChange, onItemsChange, onComplete,
}: WizardProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [removingBg, setRemovingBg] = useState<string | null>(null);
  const [bgError, setBgError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const S = {
    accent: { color: 'var(--tb-accent)' },
    faint: { color: 'var(--tb-fg-faint)' },
    ghost: { color: 'var(--tb-fg-ghost)' },
    muted: { color: 'var(--tb-fg-muted)' },
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (items.length >= (config.maxItems || 15)) return;
    const file = e.target.files[0];
    const id = `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setSaving(true);
    setBgError(null);
    const originalUrl = await uploadImage(userId, file, `${id}_original`);
    let processedUrl = originalUrl;
    let contourPoints: { x: number; y: number }[] | undefined;
    try {
      setRemovingBg(id);
      const { removeBackground } = await import('@imgly/background-removal');
      const resultBlob = await removeBackground(file, {
        model: 'isnet_quint8',
        output: { format: 'image/png' },
      });
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
      processedUrl = await uploadProcessedImage(userId, resultBlob, id);
    } catch (err) {
      setBgError(err instanceof Error ? err.message : 'Unknown error');
    } finally { setRemovingBg(null); }
    const newItem: TreasureItem = {
      id, imageUrl: processedUrl, originalImageUrl: originalUrl,
      label: file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
      story: '', link: '', order: items.length, rotation: 0, createdAt: Date.now(),
      ...(contourPoints && { contourPoints }),
    };
    await saveItem(userId, newItem, true);
    onItemsChange([...items, newItem]);
    setSaving(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpdateItem = async (id: string, updates: Partial<TreasureItem>) => {
    const updated = items.map(item => item.id === id ? { ...item, ...updates } : item);
    onItemsChange(updated);
    const item = updated.find(i => i.id === id);
    if (item) await saveItem(userId, item);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--tb-bg)' }}>
      {/* Step Indicator */}
      <div className="px-6 py-4 shrink-0 flex items-center gap-0" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
        {STEPS.map((s, i) => (
          <div key={s.num} className="flex items-center">
            {i > 0 && (
              <div
                className="w-8 h-px mx-2"
                style={{ background: step > s.num - 1 ? 'var(--tb-accent)' : 'var(--tb-border)' }}
              />
            )}
            <button
              onClick={() => setStep(s.num)}
              className="flex items-center gap-2 cursor-pointer text-[14px] tracking-[0.1em]"
              style={{
                color: step === s.num ? 'var(--tb-accent)' : step > s.num ? 'var(--tb-fg-muted)' : 'var(--tb-fg-ghost)',
                background: 'transparent', border: 'none',
              }}
            >
              <span className="text-[12px] tabular-nums">
                {step > s.num ? '✓' : s.num}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          </div>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0 overflow-hidden">
        {/* Left: Step Content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-6" style={{ borderRight: '1px solid var(--tb-border-subtle)' }}>
          {/* STEP 1: Build Box */}
          {step === 1 && (
            <div>
              <h2 className="text-[20px] tracking-[0.12em] uppercase mb-2" style={S.accent}>
                build your box
              </h2>
              <p className="text-[14px] mb-6" style={S.muted}>
                choose a material, colors, and style for your treasure box drawer.
                AI will generate a unique design.
              </p>
              <DrawerStylePicker
                userId={userId}
                currentImages={config.drawerImages || undefined}
                onComplete={(images: DrawerImages) => onConfigChange({ ...config, drawerImages: images })}
                onReset={async () => { await clearDrawerImages(userId); onConfigChange({ ...config, drawerImages: undefined }); }}
              />
              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="tb-btn text-[14px] tracking-[0.12em]"
                  style={{ color: 'var(--tb-accent)' }}
                >
                  next: add items →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Add Items */}
          {step === 2 && (
            <div>
              <h2 className="text-[20px] tracking-[0.12em] uppercase mb-2" style={S.accent}>
                add items
              </h2>
              <p className="text-[14px] mb-6" style={S.muted}>
                upload photos of meaningful objects. backgrounds are removed automatically.
              </p>

              <div className="flex items-center justify-between mb-4">
                <span className="text-[14px]" style={S.accent}>
                  {items.length}/{config.maxItems || 15} items
                </span>
                {items.length < (config.maxItems || 15) && (
                  <label className="tb-btn text-[14px] cursor-pointer tracking-[0.12em]"
                    style={{ color: 'var(--tb-accent)' }}>
                    + upload
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                  </label>
                )}
              </div>

              {removingBg && <div className="text-[14px] mb-3 animate-pulse" style={{ color: 'var(--tb-highlight)' }}>removing background...</div>}
              {bgError && <div className="text-[14px] mb-3" style={{ color: '#c44' }}>bg removal failed: {bgError}</div>}

              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} className="p-3" style={{ border: '1px solid var(--tb-border-subtle)' }}>
                    <div className="flex gap-3">
                      <div className="w-14 h-14 flex items-center justify-center overflow-hidden shrink-0" style={{ background: 'var(--tb-bg-muted)' }}>
                        <img src={item.imageUrl} alt={item.label} className="max-w-full max-h-full object-contain" />
                      </div>
                      <div className="flex-1 flex flex-col gap-1 min-w-0">
                        <input value={item.label} onChange={e => handleUpdateItem(item.id, { label: e.target.value })} placeholder="label"
                          className="w-full bg-transparent text-[14px] pb-1 outline-none" style={{ borderBottom: '1px solid var(--tb-border-subtle)', ...S.accent }} />
                        <input value={item.story || ''} onChange={e => handleUpdateItem(item.id, { story: e.target.value })} placeholder="story (shown on long-press)"
                          className="w-full bg-transparent text-[14px] pb-1 outline-none" style={{ borderBottom: '1px solid var(--tb-border-subtle)', color: 'var(--tb-fg)' }} />
                      </div>
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="text-center py-12 text-[14px]" style={S.faint}>
                    no items yet — upload your first treasure
                  </div>
                )}
              </div>

              <div className="mt-8 flex gap-3 items-center">
                <button onClick={() => setStep(1)} className="text-[14px] cursor-pointer" style={{ ...S.faint, background: 'none', border: 'none' }}>
                  ← back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="tb-btn text-[14px] tracking-[0.12em]"
                  style={{ color: 'var(--tb-accent)' }}
                >
                  next: share →
                </button>
                <button onClick={() => setStep(3)} className="text-[12px] cursor-pointer" style={{ ...S.ghost, background: 'none', border: 'none' }}>
                  skip for now
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Share */}
          {step === 3 && (
            <div>
              <h2 className="text-[20px] tracking-[0.12em] uppercase mb-2" style={S.accent}>
                share & configure
              </h2>
              <p className="text-[14px] mb-6" style={S.muted}>
                make your box public, set your name, and grab embed codes.
              </p>

              {/* Visibility */}
              <div className="mb-5 pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
                <label className="text-[12px] block mb-2 tracking-[0.12em]" style={S.faint}>visibility</label>
                <div className="flex">
                  <button onClick={() => onConfigChange({ ...config, isPublic: false })}
                    className="text-[14px] px-4 py-2 border cursor-pointer transition-all"
                    style={{
                      borderColor: !config.isPublic ? 'var(--tb-accent)' : 'var(--tb-border-subtle)',
                      color: !config.isPublic ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
                      background: 'transparent',
                    }}>private</button>
                  <button onClick={() => onConfigChange({ ...config, isPublic: true })}
                    className="text-[14px] px-4 py-2 border border-l-0 cursor-pointer transition-all"
                    style={{
                      borderColor: config.isPublic ? 'var(--tb-accent)' : 'var(--tb-border-subtle)',
                      color: config.isPublic ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
                      background: 'transparent',
                    }}>public</button>
                </div>
                <p className="text-[11px] mt-1" style={S.ghost}>public boxes appear in the gallery on the landing page</p>
              </div>

              {/* Owner Name */}
              <div className="mb-5 pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
                <label className="text-[12px] block mb-2 tracking-[0.12em]" style={S.faint}>owner name (optional)</label>
                <input type="text" value={config.ownerName || ''} onChange={e => onConfigChange({ ...config, ownerName: e.target.value })}
                  placeholder="displayed on your box" className="w-full bg-transparent text-[14px] p-2 outline-none"
                  style={{ border: '1px solid var(--tb-border-subtle)', ...S.accent }} />
              </div>

              {/* Sound */}
              <div className="mb-5 pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
                <label className="text-[12px] block mb-2 tracking-[0.12em]" style={S.faint}>collision sound</label>
                <div className="flex flex-wrap">
                  {SOUND_PRESETS.map((p, i) => (
                    <button key={p}
                      onClick={() => onConfigChange({ ...config, soundPreset: p, soundEnabled: p !== 'silent' })}
                      className="text-[14px] px-4 py-2 border cursor-pointer transition-all"
                      style={{
                        borderColor: config.soundPreset === p ? 'var(--tb-accent)' : 'var(--tb-border-subtle)',
                        color: config.soundPreset === p ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
                        borderLeftWidth: i === 0 ? 1 : 0,
                        background: 'transparent',
                      }}>{p}</button>
                  ))}
                </div>
              </div>

              {/* Embed */}
              <div className="mb-5 pb-5" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
                <label className="text-[12px] block mb-3 tracking-[0.12em]" style={S.faint}>embed code</label>
                <EmbedConfigurator
                  config={config}
                  userId={userId}
                  onSettingsChange={(settings: EmbedSettings) => onConfigChange({ ...config, embedSettings: settings })}
                />
              </div>

              <div className="mt-8 flex gap-3 items-center">
                <button onClick={() => setStep(2)} className="text-[14px] cursor-pointer" style={{ ...S.faint, background: 'none', border: 'none' }}>
                  ← back
                </button>
                <button
                  onClick={onComplete}
                  className="tb-btn text-[14px] tracking-[0.12em]"
                  style={{ color: 'var(--tb-accent)' }}
                >
                  done — open editor
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Live Preview */}
        <div className="flex flex-col overflow-hidden" style={{ background: 'var(--tb-bg-subtle)' }}>
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
            <span className="text-[14px] tracking-[0.12em]" style={S.faint}>live preview</span>
          </div>
          <div className="flex-1 flex items-center justify-center relative overflow-hidden"
            style={{
              background: config.backgroundColor === 'transparent'
                ? 'repeating-conic-gradient(var(--tb-bg-muted) 0% 25%, var(--tb-bg-subtle) 0% 50%) 50% / 16px 16px'
                : config.backgroundColor || 'var(--tb-bg)',
            }}>
            <div style={{ width: '90%', maxWidth: 500, aspectRatio: '1 / 1' }}>
              <TreasureBox items={items} config={config} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
