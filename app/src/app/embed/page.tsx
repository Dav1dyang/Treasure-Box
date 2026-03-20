'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { getPublicBoxConfig, getPublicItems } from '@/lib/firestore';
import type { TreasureItem, BoxConfig } from '@/lib/types';
import TreasureBox from '@/components/TreasureBox';
import { Suspense } from 'react';

function EmbedContent() {
  const searchParams = useSearchParams();
  const boxId = searchParams.get('box');
  const bgOverride = searchParams.get('bg');
  const embedMode = searchParams.get('mode') || 'contained';
  const scaleParam = searchParams.get('scale');

  // Padding params for contained mode (default 0 for backward compat)
  const pt = Math.max(0, Math.min(60, parseInt(searchParams.get('pt') || '0', 10) || 0));
  const pr = Math.max(0, Math.min(60, parseInt(searchParams.get('pr') || '0', 10) || 0));
  const pb = Math.max(0, Math.min(60, parseInt(searchParams.get('pb') || '0', 10) || 0));
  const pl = Math.max(0, Math.min(60, parseInt(searchParams.get('pl') || '0', 10) || 0));
  const hasPadding = pt > 0 || pr > 0 || pb > 0 || pl > 0;

  const [config, setConfig] = useState<BoxConfig | null>(null);
  const [items, setItems] = useState<TreasureItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!boxId) {
      setError('Missing box ID');
      return;
    }

    (async () => {
      try {
        const [cfg, itms] = await Promise.all([
          getPublicBoxConfig(boxId),
          getPublicItems(boxId),
        ]);

        if (!cfg) {
          setError('Box not found');
          return;
        }

        if (!cfg.isPublic) {
          setError('This box is private');
          return;
        }

        setConfig(cfg);
        setItems(itms);
      } catch {
        setError('Failed to load box');
      }
    })();
  }, [boxId]);

  // postMessage handler for overlay mode: notify parent when items escape/return
  const isOverlay = embedMode === 'overlay' || embedMode === 'fullpage';

  const handleItemsEscaped = useCallback((escapedItems: { id: string; imageUrl: string; label: string }[]) => {
    if (!isOverlay || typeof window === 'undefined') return;
    window.parent.postMessage({
      type: 'treasure-box',
      action: 'items-escaped',
      items: escapedItems,
      itemEffects: {
        brightness: config?.itemBrightness ?? 1,
        contrast: config?.itemContrast ?? 1,
        tint: config?.itemTint,
      },
    }, '*');
  }, [isOverlay, config]);

  const handleItemsReturned = useCallback(() => {
    if (!isOverlay || typeof window === 'undefined') return;
    window.parent.postMessage({
      type: 'treasure-box',
      action: 'items-returned',
    }, '*');
  }, [isOverlay]);

  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[#0e0e0e]">
        <div className="text-[#3a3a32] font-mono text-xs">{error}</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[#0e0e0e]">
        <div className="text-[#3a3a32] font-mono text-xs animate-pulse">loading...</div>
      </div>
    );
  }

  const bg = bgOverride ? decodeURIComponent(bgOverride) : config.backgroundColor;
  const scaleOverride = scaleParam ? parseFloat(scaleParam) : undefined;
  const effectiveConfig = scaleOverride && scaleOverride !== 1
    ? { ...config, contentScale: scaleOverride }
    : config;

  const isContained = !isOverlay;
  const paddingStyle = (isContained && hasPadding)
    ? { padding: `${pt}px ${pr}px ${pb}px ${pl}px` }
    : undefined;

  return (
    <div className="w-full h-screen overflow-hidden" style={paddingStyle}>
      <div className="w-full h-full">
        <TreasureBox
          items={items}
          config={effectiveConfig}
          backgroundColor={bg}
          fullpageMode={isOverlay}
          embedded={isContained}
          onItemsEscaped={isOverlay ? handleItemsEscaped : undefined}
          onItemsReturned={isOverlay ? handleItemsReturned : undefined}
        />
      </div>
    </div>
  );
}

export default function EmbedPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full h-screen flex items-center justify-center bg-[#0e0e0e]">
          <div className="text-[#3a3a32] font-mono text-xs animate-pulse">loading...</div>
        </div>
      }
    >
      <EmbedContent />
    </Suspense>
  );
}
