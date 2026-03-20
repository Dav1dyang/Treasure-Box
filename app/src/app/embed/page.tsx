'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getPublicBoxConfig, getPublicItems } from '@/lib/firestore';
import type { TreasureItem, BoxConfig } from '@/lib/types';
import TreasureBox from '@/components/TreasureBox';
import { Suspense } from 'react';

function EmbedContent() {
  const searchParams = useSearchParams();
  const boxId = searchParams.get('box');
  const bgOverride = searchParams.get('bg');

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

        setConfig(cfg);
        setItems(itms);
      } catch (e) {
        setError('Failed to load box');
      }
    })();
  }, [boxId]);

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

  return (
    <div className="w-full h-screen overflow-hidden">
      <TreasureBox items={items} config={config} backgroundColor={bg} />
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
