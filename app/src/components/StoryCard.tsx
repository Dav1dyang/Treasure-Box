'use client';

import type { TreasureItem } from '@/lib/types';

interface Props {
  item: TreasureItem;
  onClose: () => void;
}

export default function StoryCard({ item, onClose }: Props) {
  // Scale popup image proportionally to the item's drawer scale, clamped to a usable range
  const imgScale = Math.max(0.7, Math.min(item.scale ?? 1, 1.8));
  const imgMaxSize = Math.round(140 * imgScale);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center cursor-pointer"
      style={{ background: 'rgba(0,0,0,0.82)' }}
      onClick={onClose}
    >
      <div
        className="rounded-sm max-w-[420px] w-full mx-5 max-h-[85vh] overflow-y-auto"
        style={{
          background: 'var(--tb-bg)',
          border: '1px solid var(--tb-border)',
          padding: 'clamp(20px, 4vw, 32px) clamp(20px, 5vw, 36px) clamp(16px, 3vw, 28px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Item photo — scaled to match drawer appearance */}
        {item.imageUrl && (
          <div className="flex justify-center mb-5">
            <img
              src={item.imageUrl}
              alt={item.label}
              className="object-contain"
              style={{
                maxWidth: `${imgMaxSize}px`,
                maxHeight: `${imgMaxSize}px`,
                filter: 'drop-shadow(2px 4px 10px rgba(0,0,0,0.25))',
              }}
            />
          </div>
        )}

        {/* Label — Barlow Condensed to match hero title */}
        <div
          className="text-center uppercase mb-2"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 'clamp(22px, 3vw, 28px)',
            letterSpacing: '0.04em',
            color: 'var(--tb-fg)',
            lineHeight: 1.1,
          }}
        >
          {item.label}
        </div>

        {/* Story text — Inconsolata body */}
        {item.story && (
          <div
            className="text-center mt-3 mb-5"
            style={{
              fontFamily: "'Inconsolata', monospace",
              fontWeight: 400,
              fontSize: 'clamp(14px, 1.8vw, 17px)',
              lineHeight: 1.75,
              letterSpacing: '0.01em',
              color: 'var(--tb-fg-muted)',
            }}
          >
            &ldquo;{item.story}&rdquo;
          </div>
        )}

        {/* Link — styled as a visible button */}
        {item.link && (
          <div
            className="text-center pt-5"
            style={{ borderTop: '1px solid var(--tb-border-subtle)' }}
          >
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline uppercase transition-colors inline-block"
              style={{
                fontFamily: "'Inconsolata', monospace",
                fontWeight: 600,
                fontSize: '14px',
                letterSpacing: '0.1em',
                color: 'var(--tb-accent)',
                display: 'inline-block',
                padding: '8px 16px',
              }}
            >
              Visit Link &rarr;
            </a>
          </div>
        )}

        {/* Close hint */}
        <div
          className="text-center mt-5"
          style={{
            fontFamily: "'Inconsolata', monospace",
            fontWeight: 400,
            fontSize: '12px',
            letterSpacing: '0.08em',
            color: 'var(--tb-fg-faint)',
          }}
        >
          tap anywhere to close
        </div>
      </div>
    </div>
  );
}
