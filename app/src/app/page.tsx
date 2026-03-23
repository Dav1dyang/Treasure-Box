'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { getPublicBoxesWithItems, getDemoBox, getBoxConfig, getItems } from '@/lib/firestore';
import type { TreasureItem, BoxConfig } from '@/lib/types';

const TreasureBox = dynamic(() => import('@/components/TreasureBox'), { ssr: false });

export default function Home() {
  const { user, loading: authLoading, signIn, logOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [demoConfig, setDemoConfig] = useState<BoxConfig | null>(null);
  const [demoItems, setDemoItems] = useState<TreasureItem[]>([]);
  const [demoLoading, setDemoLoading] = useState(true);
  const [heroReady, setHeroReady] = useState(false);
  const [userHasBox, setUserHasBox] = useState(false);
  const [galleryBoxes, setGalleryBoxes] = useState<{ config: BoxConfig; items: TreasureItem[] }[]>([]);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  const titleRef = useRef<HTMLHeadingElement>(null);

  const textColliders = useMemo(() => [
    { ref: titleRef, label: 'title' },
  ], []);

  // Load hero box: user's own box if logged in, otherwise random public box
  useEffect(() => {
    if (authLoading) return;
    (async () => {
      try {
        if (user) {
          const config = await getBoxConfig(user.uid);
          if (config) {
            const items = await getItems(user.uid);
            setDemoConfig(config);
            setDemoItems(items);
            setUserHasBox(true);
          } else {
            // Logged in but no box yet — fall back to curated demo
            setUserHasBox(false);
            const result = await getDemoBox();
            if (result) {
              setDemoConfig(result.config);
              setDemoItems(result.items);
            }
          }
        } else {
          const result = await getDemoBox();
          if (result) {
            setDemoConfig(result.config);
            setDemoItems(result.items);
          }
        }
      } catch {
        // No boxes available
      } finally {
        setDemoLoading(false);
      }
    })();
  }, [user, authLoading]);

  // Load gallery
  useEffect(() => {
    (async () => {
      try {
        const boxes = await getPublicBoxesWithItems(20);
        setGalleryBoxes(boxes);
      } catch (err) {
        console.error('Gallery fetch failed:', err);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('index')) {
          setGalleryError('Firestore composite index required — check the browser console for the creation link.');
        } else {
          setGalleryError('Failed to load public boxes. Check console for details.');
        }
      }
    })();
  }, []);

  const handleHeroInteraction = () => {
    if (!hasInteracted) {
      setHasInteracted(true);
    }
  };

  return (
    <div className="font-mono" style={{ background: 'var(--tb-bg)', color: 'var(--tb-fg)' }}>
      {/* ═══ NAV ═══ */}
      <nav
        className={`fixed top-0 right-0 z-50 flex items-center gap-5 px-5 py-4 uppercase transition-opacity duration-500 ${
          hasInteracted ? 'opacity-100' : 'opacity-0 hover:opacity-100'
        }`}
        style={{
          fontFamily: "'Inconsolata', monospace",
          fontWeight: 600,
          fontSize: 'clamp(15px, 1.8vw, 18px)',
          letterSpacing: '0.08em',
        }}
      >
        <a href="#gallery" className="no-underline transition-colors" style={{ color: 'var(--tb-fg-muted)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--tb-fg)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--tb-fg-muted)'}
        >
          Public Gallery
        </a>
        {authLoading ? null : user ? (
          <>
            <Link href="/editor" className="no-underline" style={{ color: 'var(--tb-accent)' }}>
              My Box
            </Link>
            <button onClick={logOut} className="cursor-pointer" style={{ color: 'var(--tb-fg-muted)' }}>
              Sign Out
            </button>
          </>
        ) : (
          <button onClick={signIn} className="cursor-pointer uppercase" style={{ color: 'var(--tb-accent)' }}>
            Sign In
          </button>
        )}
        <button
          onClick={toggleTheme}
          className="cursor-pointer"
          style={{ color: 'var(--tb-fg-faint)', fontSize: 'inherit' }}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '○' : '●'}
        </button>
      </nav>

      {/* ═══ HERO ═══ */}
      <section
        className="h-screen flex flex-col justify-end relative"
        onClick={handleHeroInteraction}
        onMouseMove={handleHeroInteraction}
      >
        {/* TreasureBox fills the entire hero */}
        <div className="absolute inset-0">
          {demoLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="animate-pulse w-full h-full"
                style={{ border: '0.5px solid var(--tb-border)' }}
              />
            </div>
          ) : demoConfig ? (
            <div
              className="absolute inset-0 transition-opacity duration-700 ease-out"
              style={{ opacity: heroReady ? 1 : 0 }}
            >
              <TreasureBox items={demoItems} config={demoConfig} textColliders={textColliders} backgroundColor="transparent" onReady={() => setHeroReady(true)} />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <pre className="text-[9px] leading-relaxed text-center" style={{ color: 'var(--tb-fg-faint)' }}>
{`╔══════════════════════════════════════╗
║                                      ║
║                                      ║
║     no public boxes yet              ║
║     be the first to share yours      ║
║                                      ║
║  ┌────────────────────────────────┐  ║
║  │      [ ═══ PULL ═══ ]         │  ║
║  └────────────────────────────────┘  ║
╚══════════════════════════════════════╝`}
              </pre>
            </div>
          )}
        </div>

        {/* Title block — pinned to absolute bottom, centered */}
        <div className="relative z-20 pointer-events-none w-full text-center">
          <h1
            ref={titleRef}
            className="uppercase"
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 900,
              fontSize: 'clamp(64px, 18vw, 220px)',
              letterSpacing: '-0.03em',
              color: 'var(--tb-fg)',
              margin: '0 auto',
              padding: 0,
              lineHeight: 0.72,
              width: 'fit-content',
            }}
          >
            Junk Drawer
          </h1>
        </div>

      </section>

      {/* ═══ CATALOG GRID ═══ */}
      <section id="gallery">
        {/* Section label */}
        <div
          className="uppercase text-center"
          style={{
            fontFamily: "'Inconsolata', monospace",
            fontWeight: 600,
            fontSize: 'clamp(14px, 1.8vw, 18px)',
            letterSpacing: '0.12em',
            color: 'var(--tb-fg-muted)',
            padding: '16px 0 12px 0',
            borderTop: '0.5px solid var(--tb-border)',
            marginTop: '8px',
          }}
        >
          Public Gallery
        </div>
        {galleryError ? (
          <div className="text-center py-16 text-[10px]" style={{ color: '#f87171' }}>
            {galleryError}
          </div>
        ) : galleryBoxes.length === 0 ? (
          <div className="text-center py-16" style={{
            color: 'var(--tb-fg-faint)',
            fontFamily: "'Inconsolata', monospace",
            fontWeight: 400,
            fontSize: 'clamp(11px, 1.4vw, 14px)',
            letterSpacing: '0.08em',
          }}>
            no public boxes yet — toggle yours to public in the editor
          </div>
        ) : (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
            style={{ borderTop: '0.5px solid var(--tb-border)', borderLeft: '0.5px solid var(--tb-border)' }}
          >
            {galleryBoxes.map((entry, i) => (
              <GalleryBox key={entry.config.id} config={entry.config} items={entry.items} index={i + 1} />
            ))}
            {/* Instructions cell — are.na style */}
            <InstructionsCell index={galleryBoxes.length + 1} />
            {/* CTA cell — only if no box yet */}
            {(!user || !userHasBox) && (
              <CreateYoursCell index={galleryBoxes.length + 2} user={user} signIn={signIn} />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

const MONO_STYLE = {
  fontFamily: "'Inconsolata', monospace",
} as const;

function InstructionsCell({ index }: { index: number }) {
  return (
    <div
      className="aspect-square sm:aspect-square relative overflow-hidden min-h-[280px] sm:min-h-0"
      style={{
        borderRight: '0.5px solid var(--tb-border)',
        borderBottom: '0.5px solid var(--tb-border)',
      }}
    >
      {/* Specimen label */}
      <span
        className="absolute top-2.5 left-3 right-3 leading-none pointer-events-none z-10 uppercase"
        style={{
          ...MONO_STYLE,
          fontWeight: 500,
          fontSize: '13px',
          letterSpacing: '0.08em',
          color: 'var(--tb-fg-ghost)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {String(index).padStart(2, '0')}&ensp;—&ensp;how it works
      </span>
      {/* Instructions body */}
      <div
        className="absolute inset-0 flex flex-col justify-center px-4 sm:px-8 pt-8"
        style={{
          ...MONO_STYLE,
          fontWeight: 400,
          fontSize: 'clamp(12px, 1.6vw, 16px)',
          lineHeight: 1.7,
          color: 'var(--tb-fg-muted)',
          letterSpacing: '0.02em',
        }}
      >
        <p style={{ margin: '0 0 12px 0', color: 'var(--tb-fg)' }}>
          Each box is a small collection of things that matter to someone.
          Share it with friends or embed it on your own site.
        </p>
        <p style={{ margin: '0 0 4px 0' }}>
          <span style={{ color: 'var(--tb-fg)' }}>pull</span>&ensp;the drawer to open
        </p>
        <p style={{ margin: '0 0 4px 0' }}>
          <span style={{ color: 'var(--tb-fg)' }}>double-click</span>&ensp;an item to visit its link
        </p>
        <p style={{ margin: '0 0 4px 0' }}>
          <span style={{ color: 'var(--tb-fg)' }}>hold</span>&ensp;an item to read its story
        </p>
      </div>
    </div>
  );
}

function CreateYoursCell({ index, user, signIn }: { index: number; user: any; signIn: () => void }) {
  return (
    <div
      className="aspect-square relative overflow-hidden"
      style={{
        borderRight: '0.5px solid var(--tb-border)',
        borderBottom: '0.5px solid var(--tb-border)',
      }}
    >
      {/* Specimen label */}
      <span
        className="absolute top-2.5 left-3 right-3 leading-none pointer-events-none z-10 uppercase"
        style={{
          ...MONO_STYLE,
          fontWeight: 500,
          fontSize: '13px',
          letterSpacing: '0.08em',
          color: 'var(--tb-fg-ghost)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {String(index).padStart(2, '0')}&ensp;—&ensp;yours
      </span>
      {/* CTA */}
      <div className="absolute inset-0 flex items-center justify-center">
        {user ? (
          <Link
            href="/editor"
            className="no-underline uppercase transition-colors"
            style={{
              ...MONO_STYLE,
              fontWeight: 600,
              fontSize: '14px',
              letterSpacing: '0.12em',
              color: 'var(--tb-accent)',
            }}
          >
            Create Your Box →
          </Link>
        ) : (
          <button
            onClick={signIn}
            className="cursor-pointer uppercase transition-colors"
            style={{
              ...MONO_STYLE,
              fontWeight: 600,
              fontSize: '14px',
              letterSpacing: '0.12em',
              color: 'var(--tb-accent)',
            }}
          >
            Sign In to Create →
          </button>
        )}
      </div>
    </div>
  );
}

function GalleryBox({ config, items, index }: { config: BoxConfig; items: TreasureItem[]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [boxReady, setBoxReady] = useState(false);
  const [cellSize, setCellSize] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );
    observer.observe(el);

    // Measure cell size for proportional drawer scaling
    const ro = new ResizeObserver(([entry]) => {
      setCellSize(entry.contentRect.width);
    });
    ro.observe(el);

    return () => { observer.disconnect(); ro.disconnect(); };
  }, []);

  // Scale drawer proportionally to cell size
  const galleryConfig = useMemo(() => {
    if (!cellSize) return config;
    const drawerSize = Math.min(Math.round(cellSize * 0.7), 420);
    return {
      ...config,
      drawerDisplaySize: { width: drawerSize, height: drawerSize },
    };
  }, [config, cellSize]);

  return (
    <div
      ref={ref}
      className="aspect-square relative overflow-hidden"
      style={{
        borderRight: '0.5px solid var(--tb-border)',
        borderBottom: '0.5px solid var(--tb-border)',
      }}
    >
      {/* TreasureBox fills the entire cell — soft pop-in on load */}
      <div
        className="absolute inset-0 transition-opacity duration-500 ease-out"
        style={{ opacity: boxReady ? 1 : 0 }}
      >
        {isVisible && (
          <TreasureBox items={items} config={galleryConfig} backgroundColor="transparent" onReady={() => setBoxReady(true)} />
        )}
      </div>
      {/* Specimen label — top left, "01 — Name" — links to share page */}
      <Link
        href={`/box/${config.id}`}
        className="absolute top-2.5 left-3 right-3 leading-none truncate z-10 uppercase no-underline transition-colors"
        style={{
          fontFamily: "'Inconsolata', monospace",
          fontWeight: 500,
          fontSize: '13px',
          letterSpacing: '0.08em',
          color: 'var(--tb-fg-faint)',
          fontVariantNumeric: 'tabular-nums',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--tb-accent)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--tb-fg-faint)')}
      >
        {String(index).padStart(2, '0')}&ensp;—&ensp;{config.ownerName || 'untitled'}
      </Link>
    </div>
  );
}
