'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { EmbedPosition, AnchorCorner } from '@/lib/types';

const REFERENCE_VIEWPORT = { width: 1440, height: 900 };

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
}

/** Convert anchor+offset to absolute pixel position within a container */
function positionToAbsolute(
  pos: EmbedPosition,
  containerW: number,
  containerH: number,
  scale: number,
): { x: number; y: number } {
  const offX = pos.offsetX / scale;
  const offY = pos.offsetY / scale;
  const x = pos.anchor.includes('right') ? containerW - offX : offX;
  const y = pos.anchor.includes('bottom') ? containerH - offY : offY;
  return { x, y };
}

/** Convert absolute position to nearest-corner anchor + pixel offsets */
function absoluteToPosition(
  x: number,
  y: number,
  containerW: number,
  containerH: number,
  scale: number,
): EmbedPosition {
  const anchor: AnchorCorner =
    x < containerW / 2 && y < containerH / 2 ? 'top-left' :
    x >= containerW / 2 && y < containerH / 2 ? 'top-right' :
    x < containerW / 2 ? 'bottom-left' : 'bottom-right';

  let offsetX: number, offsetY: number;
  switch (anchor) {
    case 'top-left':
      offsetX = x; offsetY = y; break;
    case 'top-right':
      offsetX = containerW - x; offsetY = y; break;
    case 'bottom-left':
      offsetX = x; offsetY = containerH - y; break;
    case 'bottom-right':
      offsetX = containerW - x; offsetY = containerH - y; break;
  }

  return {
    anchor,
    offsetX: Math.round(Math.max(0, offsetX * scale)),
    offsetY: Math.round(Math.max(0, offsetY * scale)),
  };
}

export default function OverlayPositioner({ position, boxWidth, boxHeight, onPositionChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const getScale = useCallback(() => {
    if (!containerRef.current) return 1;
    return REFERENCE_VIEWPORT.width / containerRef.current.offsetWidth;
  }, []);

  const getScaledBox = useCallback(() => {
    if (!containerRef.current) return { w: 50, h: 40 };
    const scale = getScale();
    return { w: boxWidth / scale, h: boxHeight / scale };
  }, [boxWidth, boxHeight, getScale]);

  // Compute display position from props
  const getDisplayPos = useCallback(() => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current;
    const scale = getScale();
    return positionToAbsolute(position, rect.offsetWidth, rect.offsetHeight, scale);
  }, [position, getScale]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const pos = getDisplayPos();
    const box = getScaledBox();
    dragOffset.current = {
      x: e.clientX - (containerRef.current!.getBoundingClientRect().left + pos.x - box.w / 2),
      y: e.clientY - (containerRef.current!.getBoundingClientRect().top + pos.y - box.h / 2),
    };
    setDragging(true);
    setDragPos(pos);
  }, [getDisplayPos, getScaledBox]);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const box = getScaledBox();
      const x = Math.max(box.w / 2, Math.min(rect.width - box.w / 2,
        e.clientX - rect.left - dragOffset.current.x + box.w / 2));
      const y = Math.max(box.h / 2, Math.min(rect.height - box.h / 2,
        e.clientY - rect.top - dragOffset.current.y + box.h / 2));
      setDragPos({ x, y });
    };

    const handleUp = () => {
      setDragging(false);
      if (dragPos && containerRef.current) {
        const scale = getScale();
        onPositionChange(absoluteToPosition(
          dragPos.x, dragPos.y,
          containerRef.current.offsetWidth, containerRef.current.offsetHeight,
          scale,
        ));
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, dragPos, getScale, getScaledBox, onPositionChange]);

  // Also allow click-to-place
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (dragging) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const scale = getScale();
    onPositionChange(absoluteToPosition(x, y, rect.width, rect.height, scale));
  }, [dragging, getScale, onPositionChange]);

  // Resolve displayed position
  const displayPos = dragging && dragPos ? dragPos : (containerRef.current ? getDisplayPos() : { x: 0, y: 0 });
  const scaledBox = getScaledBox();

  return (
    <div>
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
        {/* Mock wireframe background */}
        <MockWireframe />

        {/* Draggable box indicator */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute flex items-center justify-center transition-shadow"
          style={{
            width: scaledBox.w,
            height: scaledBox.h,
            left: displayPos.x - scaledBox.w / 2,
            top: displayPos.y - scaledBox.h / 2,
            border: '2px solid var(--tb-accent)',
            background: 'rgba(var(--tb-accent-rgb, 180, 160, 100), 0.15)',
            boxShadow: dragging
              ? '0 0 16px rgba(var(--tb-accent-rgb, 180, 160, 100), 0.5)'
              : '0 0 8px rgba(var(--tb-accent-rgb, 180, 160, 100), 0.2)',
            cursor: dragging ? 'grabbing' : 'grab',
            zIndex: 10,
            transition: dragging ? 'none' : 'left 0.15s, top 0.15s',
          }}
        >
          <span className="text-[9px] tracking-wider pointer-events-none" style={S.accent}>
            {dragging ? 'drop here' : 'drag me'}
          </span>
        </div>
      </div>

      {/* Position readout */}
      <div className="flex items-center justify-between mt-[6px]">
        <span className="text-[8px]" style={S.ghost}>
          {position.anchor} &middot; {position.offsetX}px, {position.offsetY}px
        </span>
        <span className="text-[8px]" style={S.ghost}>
          click or drag to position
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
