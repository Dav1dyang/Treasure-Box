'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { getPublicBoxConfig, getPublicItems } from '@/lib/firestore';
import type { TreasureItem, BoxConfig, FrameSyncBody, HostViewport, AnchorCorner } from '@/lib/types';
import TreasureBox from '@/components/TreasureBox';
import { computeCenteredDrawerPosition, computeCenteredSpawnOrigin } from '@/lib/embedPosition';
import { Suspense } from 'react';

function EmbedContent() {
  const searchParams = useSearchParams();
  const boxId = searchParams.get('box');
  const bgOverride = searchParams.get('bg');
  const scaleParam = searchParams.get('scale');

  // Overlay position params
  const anchorParam = (searchParams.get('anchor') || 'bottom-right') as AnchorCorner;
  const offsetXParam = parseInt(searchParams.get('ox') || '32', 10) || 32;
  const offsetYParam = parseInt(searchParams.get('oy') || '32', 10) || 32;

  const [config, setConfig] = useState<BoxConfig | null>(null);
  const [items, setItems] = useState<TreasureItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hostViewport, setHostViewport] = useState<HostViewport | null>(null);
  const [ready, setReady] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);

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

        // Send item URLs to parent for early preloading
        if (window.parent !== window && itms.length > 0) {
          window.parent.postMessage({
            type: 'treasure-box',
            action: 'item-urls',
            urls: itms.map(i => ({ id: i.id, url: i.imageUrl })),
          }, '*');
        }
      } catch {
        setError('Failed to load box');
      }
    })();
  }, [boxId]);

  // Listen for viewport-info from parent (widget.js)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'treasure-box') return;

      if (event.data.action === 'viewport-info') {
        setHostViewport({
          width: event.data.width,
          height: event.data.height,
          offsetX: event.data.offsetX || 0,
          offsetY: event.data.offsetY || 0,
        });
      }
    };

    window.addEventListener('message', handleMessage);

    // Request viewport info from parent on mount
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'treasure-box', action: 'request-viewport-info' }, '*');
    }

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Frame sync: stream body positions to parent for overlay rendering
  const handleFrameSync = useCallback((bodies: FrameSyncBody[], effects: Record<string, unknown>) => {
    if (typeof window === 'undefined') return;
    window.parent.postMessage({
      type: 'treasure-box',
      action: 'frame-sync',
      bodies,
      effects,
    }, '*');
  }, []);

  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-transparent">
        <div className="text-[#3a3a32] font-mono text-xs">{error}</div>
      </div>
    );
  }

  if (!config) {
    return <div className="w-full h-screen bg-transparent" />;
  }

  const bg = bgOverride ? decodeURIComponent(bgOverride) : config.backgroundColor;
  const scaleOverride = scaleParam ? parseFloat(scaleParam) : undefined;
  const effectiveConfig = scaleOverride && scaleOverride !== 1
    ? { ...config, contentScale: scaleOverride }
    : config;

  const handleReady = () => setReady(true);

  // Overlay mode with frame sync: position drawer and run physics locally
  if (hostViewport) {
    const overlayConfig = {
      ...effectiveConfig,
      backgroundColor: 'transparent',
      contentScale: effectiveConfig.contentScale ?? 1,
    };

    const containerW = sceneRef.current?.offsetWidth || window.innerWidth;
    const containerH = sceneRef.current?.offsetHeight || window.innerHeight;

    return (
      <div ref={sceneRef} className="w-full h-screen overflow-hidden" style={{ background: 'transparent' }}>
        <div style={{ opacity: ready ? 1 : 0, transition: 'opacity 0.3s ease-out', width: '100%', height: '100%' }}>
          <TreasureBox
            items={items}
            config={overlayConfig}
            backgroundColor="transparent"
            embedded
            overlayPreview={{
              drawerStyle: computeCenteredDrawerPosition(containerW, containerH),
              spawnOrigin: computeCenteredSpawnOrigin(),
            }}
            hostViewport={hostViewport}
            onFrameSync={handleFrameSync}
            onReady={handleReady}
          />
        </div>
      </div>
    );
  }

  // Fallback: direct browser visit or no parent frame — render standalone
  return (
    <div className="w-full h-screen overflow-hidden">
      <div className="w-full h-full" style={{ opacity: ready ? 1 : 0, transition: 'opacity 0.3s ease-out' }}>
        <TreasureBox
          items={items}
          config={effectiveConfig}
          backgroundColor={bg}
          onReady={handleReady}
        />
      </div>
    </div>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div className="w-full h-screen bg-transparent" />}>
      <EmbedContent />
    </Suspense>
  );
}
