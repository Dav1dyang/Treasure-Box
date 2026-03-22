'use client';

import { useEffect } from 'react';
import type { TreasureItem } from '@/lib/types';

interface Props {
  item: TreasureItem;
  onClose: () => void;
  isLight: boolean;
}

export default function StoryCard({ item, onClose, isLight }: Props) {
  const bg = isLight ? '#f5f0e8' : '#0e0e0e';
  const border = isLight ? '#d0c8b8' : '#3a3a32';
  const accent = isLight ? '#6a5a3a' : '#b0a080';
  const fg = isLight ? '#4a4a40' : '#8a8a7a';
  const rust = isLight ? '#8a5a30' : '#8a6a4a';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center cursor-pointer"
      style={{ background: 'rgba(0,0,0,0.88)' }}
      onClick={onClose}
      aria-label="Close story"
    >
      <div
        className="font-mono rounded-sm max-w-[400px] w-full mx-4"
        role="dialog"
        aria-modal="true"
        aria-label={`Story: ${item.label}`}
        style={{
          background: bg,
          border: `1px solid ${border}`,
          padding: '28px 32px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Item photo */}
        {item.imageUrl && (
          <div className="flex justify-center mb-4">
            <img
              src={item.imageUrl}
              alt={item.label}
              className="max-w-[120px] max-h-[120px] object-contain"
              style={{ filter: 'drop-shadow(2px 4px 8px rgba(0,0,0,0.3))' }}
            />
          </div>
        )}

        {/* Label */}
        <div
          className="text-center text-[16px] font-medium mb-2"
          style={{ color: accent }}
        >
          {item.label}
        </div>

        {/* Story text */}
        {item.story && (
          <div
            className="text-center text-[14px] leading-[1.7] mb-4"
            style={{ color: fg }}
          >
            &ldquo;{item.story}&rdquo;
          </div>
        )}

        {/* Link */}
        {item.link && (
          <div
            className="text-center pt-3"
            style={{ borderTop: `1px solid ${border}` }}
          >
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] no-underline transition-colors hover:opacity-80"
              style={{ color: rust }}
            >
              → visit link
            </a>
          </div>
        )}

        {/* Close hint */}
        <div className="text-center mt-4 text-[11px] opacity-30">
          click anywhere or press Esc to close
        </div>
      </div>
    </div>
  );
}
