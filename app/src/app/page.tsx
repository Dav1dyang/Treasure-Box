'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { getPublicBoxesWithItems, getDemoBox } from '@/lib/firestore';
import type { TreasureItem, BoxConfig } from '@/lib/types';

const TreasureBox = dynamic(() => import('@/components/TreasureBox'), { ssr: false });

export default function Home() {
  const { user, loading: authLoading, signIn, logOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [demoConfig, setDemoConfig] = useState<BoxConfig | null>(null);
  const [demoItems, setDemoItems] = useState<TreasureItem[]>([]);
  const [demoLoading, setDemoLoading] = useState(true);
  const [galleryBoxes, setGalleryBoxes] = useState<{ config: BoxConfig; items: TreasureItem[] }[]>([]);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [idleHintVisible, setIdleHintVisible] = useState(true);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);

  const textColliders = useMemo(() => [
    { ref: titleRef, label: 'title' },
    { ref: subtitleRef, label: 'subtitle' },
  ], []);

  useEffect(() => {
    (async () => {
      try {
        const result = await getDemoBox();
        if (result) {
          setDemoConfig(result.config);
          setDemoItems(result.items);
        }
      } catch {
        // No public boxes
      } finally {
        setDemoLoading(false);
      }
    })();

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

  useEffect(() => {
    const timer = setTimeout(() => setIdleHintVisible(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleHeroInteraction = () => {
    if (!hasInteracted) {
      setHasInteracted(true);
      setIdleHintVisible(false);
    }
  };

  return (
    <div className="font-mono" style={{ background: 'var(--tb-bg)', color: 'var(--tb-fg)' }}>
      {/* ═══ NAV ═══ */}
      <nav
        className={`fixed top-0 right-0 z-50 flex items-center gap-4 px-5 py-3 text-[10px] tracking-[0.12em] transition-opacity duration-500 ${
          hasInteracted ? 'opacity-100' : 'opacity-0 hover:opacity-100'
        }`}
      >
        <a href="#gallery" className="no-underline transition-colors" style={{ color: 'var(--tb-fg-muted)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--tb-fg)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--tb-fg-muted)'}
        >
          gallery
        </a>
        <span style={{ color: 'var(--tb-fg-ghost)' }}>&middot;</span>
        {authLoading ? null : user ? (
          <>
            <Link href="/editor" className="no-underline" style={{ color: 'var(--tb-accent)' }}>
              my box
            </Link>
            <span style={{ color: 'var(--tb-fg-ghost)' }}>&middot;</span>
            <button onClick={logOut} className="cursor-pointer" style={{ color: 'var(--tb-fg-muted)' }}>
              sign out
            </button>
          </>
        ) : (
          <button onClick={signIn} className="cursor-pointer" style={{ color: 'var(--tb-accent)' }}>
            sign in
          </button>
        )}
        <span style={{ color: 'var(--tb-fg-ghost)' }}>&middot;</span>
        <button
          onClick={toggleTheme}
          className="cursor-pointer text-[10px]"
          style={{ color: 'var(--tb-fg-faint)' }}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '○' : '●'}
        </button>
      </nav>

      {/* ═══ HERO ═══ */}
      <section
        className="min-h-screen flex flex-col items-center justify-center relative px-6 py-20"
        onClick={handleHeroInteraction}
        onMouseMove={handleHeroInteraction}
      >
        {/* Title and subtitle — inside the TreasureBox coordinate space for physics collision */}
        <h1
          ref={titleRef}
          className="text-center uppercase leading-none relative z-20 pointer-events-none"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(48px, 10vw, 80px)',
            letterSpacing: '-0.02em',
            color: 'var(--tb-fg)',
          }}
        >
          Junk Drawer
        </h1>
        <p
          ref={subtitleRef}
          className="mt-3 text-center relative z-20 pointer-events-none"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 'clamp(18px, 3.5vw, 28px)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            color: 'var(--tb-fg-muted)',
          }}
        >
          a tiny widget for your most treasured things
        </p>

        <div className="absolute inset-0">
          {demoLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="animate-pulse w-full h-full"
                style={{ border: '1px solid var(--tb-border)' }}
              />
            </div>
          ) : demoConfig ? (
            <TreasureBox items={demoItems} config={demoConfig} textColliders={textColliders} backgroundColor="transparent" />
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

        {/* Idle hint */}
        <div
          className={`mt-6 text-[10px] tracking-[0.2em] uppercase transition-opacity duration-1000 relative z-20 pointer-events-none ${
            idleHintVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{ color: 'var(--tb-fg-faint)' }}
        >
          pull the drawer
        </div>
      </section>

      {/* ═══ CATALOG GRID ═══ */}
      <section id="gallery">
        {galleryError ? (
          <div className="text-center py-16 text-[10px]" style={{ color: '#f87171' }}>
            {galleryError}
          </div>
        ) : galleryBoxes.length === 0 ? (
          <div className="text-center py-16 text-[10px]" style={{ color: 'var(--tb-fg-faint)' }}>
            no public boxes yet — toggle yours to public in the editor
          </div>
        ) : (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
            style={{ borderTop: '1px solid var(--tb-border)', borderLeft: '1px solid var(--tb-border)' }}
          >
            {galleryBoxes.map((entry, i) => (
              <GalleryBox key={entry.config.id} config={entry.config} items={entry.items} index={i + 1} />
            ))}
          </div>
        )}</section>
    </div>
  );
}

function GalleryBox({ config, items, index }: { config: BoxConfig; items: TreasureItem[]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

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
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="aspect-square relative overflow-hidden"
      style={{
        borderRight: '1px solid var(--tb-border)',
        borderBottom: '1px solid var(--tb-border)',
      }}
    >
      {/* Inset container for specimen-box centering */}
      <div
        className="absolute inset-3 overflow-hidden"
        style={{ boxShadow: 'inset 0 1px 6px rgba(0,0,0,0.08)' }}
      >
        {isVisible && (
          <TreasureBox items={items} config={config} backgroundColor="transparent" />
        )}
      </div>
      {/* Index number */}
      <span
        className="absolute top-2 left-2.5 text-[10px] leading-none pointer-events-none z-10"
        style={{ color: 'var(--tb-fg-ghost)', fontVariantNumeric: 'tabular-nums' }}
      >
        {index}
      </span>
      {/* Title label */}
      <span
        className="absolute bottom-2 left-2.5 right-2.5 text-[9px] leading-none truncate pointer-events-none z-10"
        style={{ color: 'var(--tb-fg-faint)' }}
      >
        {config.title || config.ownerName || 'untitled'}
      </span>
    </div>
  );
}
