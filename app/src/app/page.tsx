'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { getPublicBoxes, getRandomPublicBox, getPublicItems } from '@/lib/firestore';
import type { TreasureItem, BoxConfig } from '@/lib/types';

const TreasureBox = dynamic(() => import('@/components/TreasureBox'), { ssr: false });

export default function Home() {
  const { user, loading: authLoading, signIn, logOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [demoConfig, setDemoConfig] = useState<BoxConfig | null>(null);
  const [demoItems, setDemoItems] = useState<TreasureItem[]>([]);
  const [demoLoading, setDemoLoading] = useState(true);
  const [publicBoxes, setPublicBoxes] = useState<BoxConfig[]>([]);
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
        const boxes = await getPublicBoxes();
        setPublicBoxes(boxes);
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
        className="fixed top-0 right-0 z-50 flex items-center gap-4 px-5 py-3 text-[12px] tracking-[0.12em] opacity-100"
      >
        <a href="#gallery" className="no-underline transition-colors min-h-[44px] flex items-center" style={{ color: 'var(--tb-fg-muted)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--tb-fg)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--tb-fg-muted)'}
        >
          gallery
        </a>
        <span style={{ color: 'var(--tb-fg-ghost)' }}>&middot;</span>
        {authLoading ? null : user ? (
          <>
            <Link href="/editor" className="no-underline min-h-[44px] flex items-center" style={{ color: 'var(--tb-accent)' }}>
              my box
            </Link>
            <span style={{ color: 'var(--tb-fg-ghost)' }}>&middot;</span>
            <button onClick={logOut} className="cursor-pointer min-h-[44px]" style={{ color: 'var(--tb-fg-muted)' }}>
              sign out
            </button>
          </>
        ) : (
          <button onClick={signIn} className="cursor-pointer min-h-[44px]" style={{ color: 'var(--tb-accent)' }}>
            sign in
          </button>
        )}
        <span style={{ color: 'var(--tb-fg-ghost)' }}>&middot;</span>
        <button
          onClick={toggleTheme}
          className="cursor-pointer text-[12px] min-h-[44px] min-w-[44px] flex items-center justify-center"
          style={{ color: 'var(--tb-fg-faint)' }}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
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
              <pre className="text-[12px] leading-relaxed text-center" style={{ color: 'var(--tb-fg-faint)' }}>
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
          className={`absolute bottom-[25%] text-[14px] tracking-[0.2em] uppercase transition-opacity duration-1000 ${
            idleHintVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{ color: 'var(--tb-fg-faint)' }}
        >
          pull the drawer
        </div>

        {/* Scroll hint */}
        <div
          className={`absolute bottom-8 text-[12px] tracking-[0.15em] uppercase transition-opacity duration-700 ${
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
        <div className="max-w-lg text-center">
          <h2
            className="text-[20px] tracking-[0.12em] uppercase mb-6"
            style={{ color: 'var(--tb-accent)' }}
          >
            treasure box
          </h2>
          <p className="text-[14px] leading-relaxed mb-8" style={{ color: 'var(--tb-fg-muted)' }}>
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
            className="tb-btn inline-block text-[14px] px-8 py-3 no-underline tracking-[0.12em] uppercase"
            style={{
              color: 'var(--tb-accent)',
            }}
          >
            {user ? 'open editor' : 'sign in to make yours'}
          </Link>
        </div>
      </section>

      {/* ═══ PUBLIC GALLERY — Museum Catalog Bento Grid ═══ */}
      <section id="gallery" className="px-6 py-16" style={{ borderTop: '1px solid var(--tb-border)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="text-[20px] tracking-[0.12em] uppercase" style={{ color: 'var(--tb-accent)' }}>
              public boxes
            </h2>
            <span className="text-[12px]" style={{ color: 'var(--tb-fg-ghost)' }}>
              {publicBoxes.length} {publicBoxes.length === 1 ? 'box' : 'boxes'}
            </span>
          </div>

          {galleryError ? (
            <div className="text-center py-16 text-[14px]" style={{ color: '#f87171' }}>
              {galleryError}
            </div>
          ) : publicBoxes.length === 0 ? (
            <div className="text-center py-16 text-[14px]" style={{ color: 'var(--tb-fg-faint)' }}>
              no public boxes yet — toggle yours to public in the editor
            </div>
          ) : (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-0"
              style={{ border: '1px solid var(--tb-border)' }}
            >
              {publicBoxes.slice(0, 11).map((box, i) => (
                <GalleryCard key={box.id} box={box} index={i} />
              ))}
              {/* Summary cell */}
              <div
                className="flex items-center justify-center p-6"
                style={{
                  border: '1px solid var(--tb-border)',
                  background: 'var(--tb-bg)',
                  aspectRatio: '1 / 1',
                }}
              >
                <div className="text-center">
                  <div className="text-[20px] mb-2" style={{ color: 'var(--tb-accent)' }}>
                    public boxes.
                  </div>
                  <div className="text-[12px]" style={{ color: 'var(--tb-fg-muted)' }}>
                    {publicBoxes.length} on display
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="py-12 text-center" style={{ borderTop: '1px solid var(--tb-border)' }}>
        <p className="text-[12px] tracking-[0.2em]" style={{ color: 'var(--tb-fg-ghost)' }}>
          physics &middot; memories &middot; webring
        </p>
      </footer>
    </div>
  );
}

function GalleryCard({ box, index }: { box: BoxConfig; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<TreasureItem[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // IntersectionObserver for lazy loading
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '100px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch items when visible
  useEffect(() => {
    if (!isVisible || loaded) return;
    getPublicItems(box.ownerId).then(fetchedItems => {
      setItems(fetchedItems);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [isVisible, loaded, box.ownerId]);

  return (
    <div
      ref={cardRef}
      className="relative group"
      style={{
        border: '1px solid var(--tb-border)',
        background: 'var(--tb-bg-subtle)',
        aspectRatio: '1 / 1',
      }}
    >
      {/* Index number — top left */}
      <span
        className="absolute top-3 left-3 text-[11px] tabular-nums z-10"
        style={{ color: 'var(--tb-fg-ghost)' }}
      >
        {String(index + 1).padStart(2, '0')}
      </span>

      {/* Live TreasureBox — centered with generous whitespace */}
      <div className="absolute inset-8 flex items-center justify-center">
        {isVisible && loaded ? (
          <TreasureBox items={items} config={box} />
        ) : (
          <div
            className="animate-pulse w-full h-full"
            style={{ border: '1px solid var(--tb-border-subtle)' }}
          />
        )}
      </div>

      {/* Title overlay — bottom */}
      <div className="absolute bottom-3 left-3 right-3">
        <div className="text-[12px] truncate" style={{ color: 'var(--tb-fg-muted)' }}>
          {box.title || 'untitled'}
        </div>
        {box.ownerName && (
          <div className="text-[11px]" style={{ color: 'var(--tb-fg-faint)' }}>
            {box.ownerName}
          </div>
        )}
      </div>

      {/* Link overlay on hover */}
      <Link
        href={`/embed?box=${box.ownerId}`}
        target="_blank"
        className="absolute inset-0 z-20 no-underline opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-3"
      >
        <span className="text-[11px] tracking-widest uppercase" style={{ color: 'var(--tb-fg-faint)' }}>
          open &rarr;
        </span>
      </Link>
    </div>
  );
}
