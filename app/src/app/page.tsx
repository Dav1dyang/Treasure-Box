'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { getPublicBoxesWithItems, getRandomPublicBox } from '@/lib/firestore';
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

  useEffect(() => {
    (async () => {
      try {
        const result = await getRandomPublicBox();
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
        className="h-screen flex flex-col items-center justify-center relative overflow-hidden"
        onClick={handleHeroInteraction}
        onMouseMove={handleHeroInteraction}
      >
        <div className="w-[90vw] max-w-[600px] aspect-square relative">
          {demoLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="animate-pulse w-full h-full"
                style={{ border: '1px solid var(--tb-border)' }}
              />
            </div>
          ) : demoConfig ? (
            <TreasureBox items={demoItems} config={demoConfig} />
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
          className={`absolute bottom-[25%] text-[10px] tracking-[0.2em] uppercase transition-opacity duration-1000 ${
            idleHintVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{ color: 'var(--tb-fg-faint)' }}
        >
          pull the drawer
        </div>

        {/* Scroll hint */}
        <div
          className={`absolute bottom-8 text-[9px] tracking-[0.15em] uppercase transition-opacity duration-700 ${
            hasInteracted ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{ color: 'var(--tb-fg-ghost)' }}
        >
          scroll to explore
          <div className="mt-2 flex justify-center">
            <div className="w-px h-4 animate-bounce" style={{ background: 'var(--tb-fg-ghost)' }} />
          </div>
        </div>
      </section>

      {/* ═══ ABOUT ═══ */}
      <section
        className="min-h-[60vh] flex items-center justify-center px-6 py-20"
        style={{ borderTop: '1px solid var(--tb-border)' }}
      >
        <div className="max-w-md text-center">
          <h2
            className="text-[11px] tracking-[0.12em] uppercase mb-6"
            style={{ color: 'var(--tb-accent)' }}
          >
            treasure box
          </h2>
          <p className="text-[11px] leading-relaxed mb-8" style={{ color: 'var(--tb-fg-muted)' }}>
            a tangible memory box for the web. upload photos of things that
            matter to you — old keys, letters, polaroids, shells — attach stories
            and links to people you care about, and embed your treasure box
            anywhere. physics makes them feel real. long-press to read the story.
          </p>
          <Link
            href={user ? '/editor' : '#'}
            onClick={e => {
              if (!user) {
                e.preventDefault();
                signIn();
              }
            }}
            className="inline-block text-[10px] px-8 py-3 transition-colors no-underline tracking-[0.12em] uppercase"
            style={{
              border: '1px solid var(--tb-border)',
              color: 'var(--tb-accent)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--tb-bg-muted)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {user ? 'open editor' : 'sign in to make yours'}
          </Link>
        </div>
      </section>

      {/* ═══ PUBLIC GALLERY ═══ */}
      <section id="gallery" className="px-6 py-16" style={{ borderTop: '1px solid var(--tb-border)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="text-[11px] tracking-[0.12em] uppercase" style={{ color: 'var(--tb-accent)' }}>
              public boxes
            </h2>
            <span className="text-[9px]" style={{ color: 'var(--tb-fg-ghost)' }}>
              {galleryBoxes.length} {galleryBoxes.length === 1 ? 'box' : 'boxes'}
            </span>
          </div>

          {galleryError ? (
            <div className="text-center py-16 text-[10px]" style={{ color: '#f87171' }}>
              {galleryError}
            </div>
          ) : galleryBoxes.length === 0 ? (
            <div className="text-center py-16 text-[10px]" style={{ color: 'var(--tb-fg-faint)' }}>
              no public boxes yet — toggle yours to public in the editor
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {galleryBoxes.map((entry) => (
                <GalleryBox key={entry.config.id} config={entry.config} items={entry.items} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="py-12 text-center" style={{ borderTop: '1px solid var(--tb-border)' }}>
        <p className="text-[9px] tracking-[0.2em]" style={{ color: 'var(--tb-fg-ghost)' }}>
          physics &middot; memories &middot; webring
        </p>
      </footer>
    </div>
  );
}

function GalleryBox({ config, items }: { config: BoxConfig; items: TreasureItem[] }) {
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
    <div ref={ref} className="flex flex-col">
      <div
        className="aspect-square relative overflow-hidden"
        style={{ border: '1px solid var(--tb-border-subtle)' }}
      >
        {isVisible && (
          <TreasureBox items={items} config={config} />
        )}
      </div>
      <div className="pt-3 pb-1">
        <div className="text-[10px] truncate" style={{ color: 'var(--tb-fg-muted)' }}>
          {config.title || 'untitled'}
        </div>
        {config.ownerName && (
          <div className="text-[8px] mt-[2px]" style={{ color: 'var(--tb-fg-ghost)' }}>
            {config.ownerName}
          </div>
        )}
      </div>
    </div>
  );
}
