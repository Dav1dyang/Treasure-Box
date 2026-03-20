'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { EmbedPosition, AnchorCorner } from '@/lib/types';

const REFERENCE_W = 1440;
const REFERENCE_H = 900;

const S = {
  accent: { color: 'var(--tb-accent)' },
  faint: { color: 'var(--tb-fg-faint)' },
  ghost: { color: 'var(--tb-fg-ghost)' },
};

interface Props {
  position: EmbedPosition;
  boxWidth: number;
  boxHeight: number;
  onPositionChange: (pos: EmbedPosition) => void;
  previewUrl?: string;
  onPreviewUrlChange?: (url: string) => void;
}

function determineAnchor(cx: number, cy: number, cw: number, ch: number): AnchorCorner {
  if (cx < cw / 2 && cy < ch / 2) return 'top-left';
  if (cx >= cw / 2 && cy < ch / 2) return 'top-right';
  if (cx < cw / 2) return 'bottom-left';
  return 'bottom-right';
}

/** Convert EmbedPosition (anchor + reference-viewport pixel offsets) → container pixel position (top-left of box) */
function positionToContainer(
  pos: EmbedPosition,
  containerW: number,
  containerH: number,
  boxW: number,
  boxH: number,
): { left: number; top: number } {
  const scaleX = containerW / REFERENCE_W;
  const scaleY = containerH / REFERENCE_H;

  let left: number, top: number;
  if (pos.anchor.includes('right')) {
    left = containerW - pos.offsetX * scaleX - boxW;
  } else {
    left = pos.offsetX * scaleX;
  }
  if (pos.anchor.includes('bottom')) {
    top = containerH - pos.offsetY * scaleY - boxH;
  } else {
    top = pos.offsetY * scaleY;
  }
  return { left, top };
}

/** Convert container pixel position (top-left of box) → EmbedPosition */
function containerToPosition(
  left: number,
  top: number,
  boxW: number,
  boxH: number,
  containerW: number,
  containerH: number,
): EmbedPosition {
  const scaleX = containerW / REFERENCE_W;
  const scaleY = containerH / REFERENCE_H;

  const cx = left + boxW / 2;
  const cy = top + boxH / 2;
  const anchor = determineAnchor(cx, cy, containerW, containerH);

  let offsetX: number, offsetY: number;
  if (anchor.includes('right')) {
    offsetX = (containerW - left - boxW) / scaleX;
  } else {
    offsetX = left / scaleX;
  }
  if (anchor.includes('bottom')) {
    offsetY = (containerH - top - boxH) / scaleY;
  } else {
    offsetY = top / scaleY;
  }

  return {
    anchor,
    offsetX: Math.round(Math.max(0, offsetX)),
    offsetY: Math.round(Math.max(0, offsetY)),
  };
}

export default function OverlayPositioner({
  position,
  boxWidth,
  boxHeight,
  onPositionChange,
  previewUrl,
  onPreviewUrlChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [boxLeft, setBoxLeft] = useState(0);
  const [boxTop, setBoxTop] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const grabOffset = useRef({ x: 0, y: 0 });

  // URL input state
  const [urlInput, setUrlInput] = useState(previewUrl || '');
  const [loadedUrl, setLoadedUrl] = useState(previewUrl || '');
  const [iframeLoading, setIframeLoading] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  // Compute scaled box dimensions
  const getScaledBox = useCallback(() => {
    if (!containerRef.current) return { w: 50, h: 40 };
    const cw = containerRef.current.offsetWidth;
    const ch = containerRef.current.offsetHeight;
    return {
      w: Math.max(40, boxWidth * cw / REFERENCE_W),
      h: Math.max(30, boxHeight * ch / REFERENCE_H),
    };
  }, [boxWidth, boxHeight]);

  // Sync position prop → container pixels (only when not dragging)
  useEffect(() => {
    if (isDragging || !containerRef.current) return;
    const cw = containerRef.current.offsetWidth;
    const ch = containerRef.current.offsetHeight;
    const box = getScaledBox();
    const { left, top } = positionToContainer(position, cw, ch, box.w, box.h);
    setBoxLeft(Math.max(0, Math.min(cw - box.w, left)));
    setBoxTop(Math.max(0, Math.min(ch - box.h, top)));
  }, [position, isDragging, getScaledBox]);

  const scaledBox = getScaledBox();

  // --- Pointer events for drag ---
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const boxRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    grabOffset.current = {
      x: e.clientX - boxRect.left,
      y: e.clientY - boxRect.top,
    };
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const box = getScaledBox();
    const newLeft = Math.max(0, Math.min(
      containerRect.width - box.w,
      e.clientX - containerRect.left - grabOffset.current.x,
    ));
    const newTop = Math.max(0, Math.min(
      containerRect.height - box.h,
      e.clientY - containerRect.top - grabOffset.current.y,
    ));
    setBoxLeft(newLeft);
    setBoxTop(newTop);
  }, [isDragging, getScaledBox]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return;
    setIsDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    const cw = containerRef.current.offsetWidth;
    const ch = containerRef.current.offsetHeight;
    const box = getScaledBox();
    onPositionChange(containerToPosition(boxLeft, boxTop, box.w, box.h, cw, ch));
  }, [isDragging, boxLeft, boxTop, getScaledBox, onPositionChange]);

  // Click-to-place on container
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (isDragging || !containerRef.current) return;
    // Ignore clicks on the box itself
    if ((e.target as HTMLElement).closest('[data-drag-box]')) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const box = getScaledBox();
    const cw = containerRect.width;
    const ch = containerRect.height;
    const newLeft = Math.max(0, Math.min(cw - box.w, e.clientX - containerRect.left - box.w / 2));
    const newTop = Math.max(0, Math.min(ch - box.h, e.clientY - containerRect.top - box.h / 2));
    setBoxLeft(newLeft);
    setBoxTop(newTop);
    onPositionChange(containerToPosition(newLeft, newTop, box.w, box.h, cw, ch));
  }, [isDragging, getScaledBox, onPositionChange]);

  // Determine active anchor for visual feedback
  const activeAnchor = containerRef.current
    ? determineAnchor(
        boxLeft + scaledBox.w / 2,
        boxTop + scaledBox.h / 2,
        containerRef.current.offsetWidth,
        containerRef.current.offsetHeight,
      )
    : position.anchor;

  // URL loading
  const handleLoadUrl = useCallback(() => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setLoadedUrl('');
      setIframeError(false);
      onPreviewUrlChange?.('');
      return;
    }
    // Add protocol if missing
    let url = trimmed;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    setLoadedUrl(url);
    setIframeLoading(true);
    setIframeError(false);
    onPreviewUrlChange?.(url);
  }, [urlInput, onPreviewUrlChange]);

  return (
    <div>
      {/* URL input */}
      <div className="flex gap-1 mb-2">
        <input
          type="text"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleLoadUrl(); }}
          placeholder="paste your website URL (optional)"
          className="flex-1 bg-transparent text-[10px] px-2 py-[5px] outline-none"
          style={{
            border: '1px solid var(--tb-border-subtle)',
            color: 'var(--tb-fg-muted)',
          }}
        />
        <button
          onClick={handleLoadUrl}
          className="text-[9px] px-2 py-[5px] cursor-pointer shrink-0"
          style={{
            border: '1px solid var(--tb-border-subtle)',
            color: 'var(--tb-fg-faint)',
            background: 'transparent',
          }}
        >
          {loadedUrl ? 'reload' : 'load'}
        </button>
        {loadedUrl && (
          <button
            onClick={() => {
              setUrlInput('');
              setLoadedUrl('');
              setIframeError(false);
              onPreviewUrlChange?.('');
            }}
            className="text-[9px] px-1 py-[5px] cursor-pointer shrink-0"
            style={{ color: 'var(--tb-fg-ghost)', background: 'transparent', border: 'none' }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Preview container */}
      <div
        ref={containerRef}
        onClick={handleContainerClick}
        className="relative overflow-hidden cursor-crosshair select-none"
        style={{
          border: '1px solid var(--tb-border-subtle)',
          background: 'var(--tb-bg-muted)',
          aspectRatio: '16 / 10',
          width: '100%',
        }}
      >
        {/* Background: iframe or wireframe */}
        {loadedUrl && !iframeError ? (
          <>
            <iframe
              src={loadedUrl}
              sandbox=""
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ opacity: 0.5, border: 'none' }}
              onLoad={() => setIframeLoading(false)}
              onError={() => { setIframeError(true); setIframeLoading(false); }}
            />
            {/* Scrim overlay so box stays visible */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'rgba(0,0,0,0.15)' }}
            />
            {iframeLoading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[9px]" style={S.ghost}>loading...</span>
              </div>
            )}
          </>
        ) : (
          <>
            <MockWireframe />
            {iframeError && (
              <div className="absolute bottom-1 left-2 text-[7px] pointer-events-none" style={S.ghost}>
                couldn&apos;t load site — showing wireframe
              </div>
            )}
          </>
        )}

        {/* Quadrant crosshair lines */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '50%',
            top: 0,
            bottom: 0,
            width: 0,
            borderLeft: '1px dashed var(--tb-border-subtle)',
            opacity: 0.4,
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            top: '50%',
            left: 0,
            right: 0,
            height: 0,
            borderTop: '1px dashed var(--tb-border-subtle)',
            opacity: 0.4,
          }}
        />

        {/* Active anchor quadrant highlight */}
        <div
          className="absolute pointer-events-none transition-opacity duration-200"
          style={{
            width: '50%',
            height: '50%',
            background: 'rgba(var(--tb-accent-rgb, 180, 160, 100), 0.04)',
            ...(activeAnchor.includes('top') ? { top: 0 } : { bottom: 0 }),
            ...(activeAnchor.includes('left') ? { left: 0 } : { right: 0 }),
          }}
        />

        {/* Draggable box indicator */}
        <div
          data-drag-box
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute flex flex-col items-center justify-center touch-none"
          style={{
            width: scaledBox.w,
            height: scaledBox.h,
            left: boxLeft,
            top: boxTop,
            border: `2px solid var(--tb-accent)`,
            background: 'rgba(var(--tb-accent-rgb, 180, 160, 100), 0.18)',
            boxShadow: isDragging
              ? '0 4px 20px rgba(var(--tb-accent-rgb, 180, 160, 100), 0.5)'
              : '0 2px 8px rgba(var(--tb-accent-rgb, 180, 160, 100), 0.2)',
            cursor: isDragging ? 'grabbing' : 'grab',
            zIndex: 10,
            transition: isDragging ? 'none' : 'box-shadow 0.15s',
            transform: isDragging ? 'scale(1.03)' : 'none',
          }}
        >
          {/* Mini drawer representation */}
          <div
            className="pointer-events-none"
            style={{
              width: '60%',
              height: '2px',
              background: 'var(--tb-accent)',
              opacity: 0.6,
              borderRadius: 1,
              marginBottom: 3,
            }}
          />
          <span className="text-[8px] tracking-wider pointer-events-none select-none" style={S.accent}>
            {isDragging ? 'release' : '◫'}
          </span>
        </div>
      </div>

      {/* Position readout */}
      <div className="flex items-center justify-between mt-[6px]">
        <span className="text-[8px]" style={S.ghost}>
          {position.anchor} &middot; {position.offsetX}px, {position.offsetY}px
        </span>
        <span className="text-[8px]" style={S.ghost}>
          drag or click to position
        </span>
      </div>
    </div>
  );
}

/** Minimal wireframe representing a generic website layout */
export function MockWireframe() {
  const bar = { background: 'var(--tb-border)' };
  const block = { background: 'var(--tb-border-subtle)' };
  return (
    <div className="absolute inset-0 p-4 space-y-2 opacity-25 pointer-events-none overflow-hidden">
      {/* Nav bar */}
      <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--tb-border-subtle)' }}>
        <div className="h-2 w-6 rounded-sm" style={bar} />
        <div className="flex-1" />
        <div className="h-[5px] w-8 rounded-sm" style={block} />
        <div className="h-[5px] w-8 rounded-sm" style={block} />
        <div className="h-[5px] w-8 rounded-sm" style={block} />
      </div>
      {/* Hero */}
      <div className="h-3 w-2/3 rounded-sm" style={bar} />
      <div className="h-2 w-full rounded-sm" style={block} />
      <div className="h-2 w-5/6 rounded-sm" style={block} />
      {/* Image placeholder */}
      <div className="h-14 w-full rounded-sm" style={block} />
      {/* Body text */}
      <div className="h-2 w-full rounded-sm" style={block} />
      <div className="h-2 w-4/5 rounded-sm" style={block} />
      <div className="h-2 w-full rounded-sm" style={block} />
      <div className="h-2 w-2/3 rounded-sm" style={block} />
      {/* Two-column cards */}
      <div className="flex gap-2 mt-1">
        <div className="flex-1 h-10 rounded-sm" style={block} />
        <div className="flex-1 h-10 rounded-sm" style={block} />
      </div>
    </div>
  );
}
