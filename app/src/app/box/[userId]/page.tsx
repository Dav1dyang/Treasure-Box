'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { getPublicBoxConfig, getPublicItems } from '@/lib/firestore';
import { useTheme } from '@/components/ThemeProvider';
import type { TreasureItem, BoxConfig } from '@/lib/types';

const TreasureBox = dynamic(() => import('@/components/TreasureBox'), { ssr: false });

const MONO = "'Inconsolata', monospace";

export default function SharedBoxPage() {
  const params = useParams();
  const userId = params.userId as string;
  const { theme, toggleTheme } = useTheme();

  const [config, setConfig] = useState<BoxConfig | null>(null);
  const [items, setItems] = useState<TreasureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boxReady, setBoxReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const [cfg, itms] = await Promise.all([
          getPublicBoxConfig(userId),
          getPublicItems(userId),
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
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  // Track container size for proportional drawer scaling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const displayConfig = useMemo(() => {
    if (!config || !containerSize.width) return config;
    const shorter = Math.min(containerSize.width, containerSize.height);
    const drawerSize = Math.min(Math.round(shorter * 0.8), 520);
    return {
      ...config,
      drawerDisplaySize: { width: drawerSize, height: drawerSize },
    };
  }, [config, containerSize]);

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Error state ---
  if (error) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6"
        style={{ background: 'var(--tb-bg)', color: 'var(--tb-fg)', fontFamily: MONO }}
      >
        <pre
          className="text-center leading-relaxed"
          style={{ color: 'var(--tb-fg-faint)', fontSize: 'clamp(9px, 1.4vw, 11px)' }}
        >
{error === 'This box is private' ? `╔══════════════════════════════════════╗
║                                      ║
║     this box is private              ║
║     the owner hasn't shared it yet   ║
║                                      ║
╚══════════════════════════════════════╝` : `╔══════════════════════════════════════╗
║                                      ║
║     box not found                    ║
║     it may have been removed         ║
║                                      ║
╚══════════════════════════════════════╝`}
        </pre>
        <Link
          href="/"
          className="no-underline uppercase transition-colors"
          style={{
            fontFamily: MONO, fontWeight: 600, fontSize: 13,
            letterSpacing: '0.1em', color: 'var(--tb-accent)',
          }}
        >
          ← Back to Junk Shelf
        </Link>
      </div>
    );
  }

  // --- Loading state ---
  if (loading || !config) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--tb-bg)' }}
      >
        <div
          className="animate-pulse"
          style={{
            width: 120, height: 120,
            border: '0.5px solid var(--tb-border)',
          }}
        />
      </div>
    );
  }

  const ownerLabel = config.ownerName || 'anonymous';
  const itemCount = items.length;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--tb-bg)', color: 'var(--tb-fg)' }}>
      {/* ═══ HEADER ═══ */}
      <header
        className="flex items-center justify-between px-3 sm:px-5 py-3 z-30 flex-shrink-0"
        style={{ borderBottom: '0.5px solid var(--tb-border)' }}
      >
        {/* Left: back to junk shelf */}
        <Link
          href="/"
          className="no-underline uppercase transition-colors"
          style={{
            fontFamily: MONO, fontWeight: 600,
            fontSize: 'clamp(11px, 1.6vw, 14px)',
            letterSpacing: '0.08em',
            color: 'var(--tb-fg-muted)',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--tb-fg)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--tb-fg-muted)')}
        >
          Junk Drawer
        </Link>

        {/* Right: actions */}
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={handleShare}
            className="cursor-pointer uppercase"
            style={{
              fontFamily: MONO, fontWeight: 600,
              fontSize: 'clamp(10px, 1.4vw, 13px)',
              letterSpacing: '0.08em',
              padding: '4px 10px',
              border: `1px solid ${copied ? 'var(--tb-accent)' : 'var(--tb-border)'}`,
              color: copied ? 'var(--tb-accent)' : 'var(--tb-fg-faint)',
              background: 'transparent',
              transition: 'all 0.15s',
            }}
          >
            {copied ? 'Copied!' : 'Share'}
          </button>
          <button
            onClick={toggleTheme}
            className="cursor-pointer"
            style={{
              fontFamily: MONO,
              fontSize: 'clamp(12px, 1.6vw, 16px)',
              color: 'var(--tb-fg-faint)',
              background: 'none', border: 'none',
            }}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '○' : '●'}
          </button>
        </div>
      </header>

      {/* ═══ DRAWER VIEWPORT ═══ */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        style={{ minHeight: 0 }}
      >
        <div
          className="absolute inset-0 transition-opacity duration-700 ease-out"
          style={{ opacity: boxReady ? 1 : 0 }}
        >
          {displayConfig && (
            <TreasureBox
              items={items}
              config={displayConfig}
              backgroundColor="transparent"
              onReady={() => setBoxReady(true)}
            />
          )}
        </div>

        {/* Loading pulse while TreasureBox initializes */}
        {!boxReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="animate-pulse"
              style={{
                width: 100, height: 100,
                border: '0.5px solid var(--tb-border)',
              }}
            />
          </div>
        )}
      </div>

      {/* ═══ FOOTER ═══ */}
      <footer
        className="flex items-center justify-between px-3 sm:px-5 py-2.5 flex-shrink-0"
        style={{ borderTop: '0.5px solid var(--tb-border)' }}
      >
        <span
          className="uppercase truncate"
          style={{
            fontFamily: MONO, fontWeight: 500,
            fontSize: 'clamp(10px, 1.4vw, 13px)',
            letterSpacing: '0.08em',
            color: 'var(--tb-fg-muted)',
          }}
        >
          {ownerLabel}
        </span>
        <span
          style={{
            fontFamily: MONO, fontWeight: 400,
            fontSize: 'clamp(9px, 1.2vw, 12px)',
            letterSpacing: '0.06em',
            color: 'var(--tb-fg-ghost)',
            flexShrink: 0,
          }}
        >
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
      </footer>
    </div>
  );
}
