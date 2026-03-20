'use client';

import { useState, useRef, useCallback } from 'react';
import type { EmbedPosition, AnchorCorner } from '@/lib/types';

const S = {
  accent: { color: 'var(--tb-accent)' },
  faint: { color: 'var(--tb-fg-faint)' },
  ghost: { color: 'var(--tb-fg-ghost)' },
};

interface Props {
  url: string;
  onUrlChange: (url: string) => void;
  pinPosition: EmbedPosition;
  onPinChange: (pos: EmbedPosition) => void;
  boxWidth: number;
  boxHeight: number;
}

export default function WebsitePreview({ url, onUrlChange, pinPosition, onPinChange, boxWidth, boxHeight }: Props) {
  const [urlInput, setUrlInput] = useState(url);
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleLoadUrl = () => {
    let normalized = urlInput.trim();
    if (normalized && !normalized.startsWith('http')) {
      normalized = 'https://' + normalized;
    }
    setUrlInput(normalized);
    onUrlChange(normalized);
    setLoadError(false);
    setLoaded(false);
  };

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;

    // Determine closest anchor corner based on click position
    const anchor: AnchorCorner =
      xPct < 50 && yPct < 50 ? 'top-left' :
      xPct >= 50 && yPct < 50 ? 'top-right' :
      xPct < 50 ? 'bottom-left' : 'bottom-right';

    // Calculate offset from the anchor corner
    let offsetX: number, offsetY: number;
    switch (anchor) {
      case 'top-left':
        offsetX = xPct;
        offsetY = yPct;
        break;
      case 'top-right':
        offsetX = 100 - xPct;
        offsetY = yPct;
        break;
      case 'bottom-left':
        offsetX = xPct;
        offsetY = 100 - yPct;
        break;
      case 'bottom-right':
        offsetX = 100 - xPct;
        offsetY = 100 - yPct;
        break;
    }

    onPinChange({
      anchor,
      xPercent: Math.round(Math.min(50, Math.max(0, offsetX))),
      yPercent: Math.round(Math.min(50, Math.max(0, offsetY))),
    });
  }, [onPinChange]);

  // Convert pin position to absolute percentage for rendering the marker
  const getPinAbsolutePosition = () => {
    const { anchor, xPercent, yPercent } = pinPosition;
    switch (anchor) {
      case 'top-left': return { left: `${xPercent}%`, top: `${yPercent}%` };
      case 'top-right': return { right: `${xPercent}%`, top: `${yPercent}%` };
      case 'bottom-left': return { left: `${xPercent}%`, bottom: `${yPercent}%` };
      case 'bottom-right': return { right: `${xPercent}%`, bottom: `${yPercent}%` };
    }
  };

  const pinStyle = getPinAbsolutePosition();
  const previewScale = 0.4; // Scale factor for the iframe preview

  return (
    <div>
      {/* URL Input */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLoadUrl()}
          placeholder="https://your-website.com"
          className="flex-1 bg-transparent text-[10px] p-2 outline-none"
          style={{ border: '1px solid var(--tb-border-subtle)', ...S.accent }}
        />
        <button
          onClick={handleLoadUrl}
          className="text-[10px] px-3 cursor-pointer shrink-0"
          style={{ border: '1px solid var(--tb-border)', ...S.accent }}
        >
          load
        </button>
      </div>

      {/* Preview Panel */}
      <div
        className="relative overflow-hidden"
        style={{
          border: '1px solid var(--tb-border-subtle)',
          background: 'var(--tb-bg-muted)',
          height: 300,
        }}
      >
        {url ? (
          <>
            {/* Scaled iframe */}
            <div
              className="origin-top-left"
              style={{
                width: `${100 / previewScale}%`,
                height: `${300 / previewScale}px`,
                transform: `scale(${previewScale})`,
              }}
            >
              <iframe
                src={url}
                className="w-full h-full border-none"
                onLoad={() => setLoaded(true)}
                onError={() => setLoadError(true)}
                sandbox="allow-scripts allow-same-origin"
                title="Website preview"
              />
            </div>

            {/* Click overlay */}
            <div
              ref={overlayRef}
              onClick={handleOverlayClick}
              className="absolute inset-0 cursor-crosshair"
              style={{ background: 'transparent' }}
            />

            {/* Pin Marker */}
            <div
              className="absolute pointer-events-none"
              style={{
                ...pinStyle,
                width: boxWidth * previewScale,
                height: boxHeight * previewScale,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div
                className="w-full h-full flex items-center justify-center text-[8px]"
                style={{
                  border: '2px solid var(--tb-accent)',
                  background: 'rgba(var(--tb-accent-rgb, 180, 160, 100), 0.15)',
                  boxShadow: '0 0 12px rgba(var(--tb-accent-rgb, 180, 160, 100), 0.3)',
                }}
              >
                <span style={S.accent}>📦</span>
              </div>
            </div>

            {/* Load error overlay */}
            {loadError && (
              <div className="absolute inset-0 flex items-center justify-center p-4" style={{ background: 'var(--tb-bg-muted)' }}>
                <div className="text-center">
                  <p className="text-[10px] mb-2" style={S.faint}>couldn&apos;t load preview</p>
                  <p className="text-[8px]" style={S.ghost}>many sites block iframe embedding — use the corner + offset controls above instead</p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-[10px] mb-1" style={S.faint}>enter your website URL above</p>
              <p className="text-[8px]" style={S.ghost}>click on the preview to pin your treasure box</p>
            </div>
          </div>
        )}
      </div>

      {url && loaded && !loadError && (
        <p className="text-[8px] mt-1" style={S.ghost}>
          click anywhere on the preview to set pin position
        </p>
      )}
    </div>
  );
}
