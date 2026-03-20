'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Matter from 'matter-js';
import { soundEngine } from '@/lib/sounds';
import { contourToVertices } from '@/lib/contour';
import type { TreasureItem, BoxConfig, BoxState, DrawerImages, BoxDimensions } from '@/lib/types';
import { DEFAULT_BOX_DIMENSIONS } from '@/lib/types';
import StoryCard from './StoryCard';

const ITEM_BASE_SIZE = 52;

interface Props {
  items: TreasureItem[];
  config: BoxConfig;
  backgroundColor?: string;
  fullpageMode?: boolean;
  onItemsEscaped?: (items: { id: string; imageUrl: string; label: string }[]) => void;
  onItemsReturned?: () => void;
}

const ALL_BOX_STATES: BoxState[] = ['IDLE', 'HOVER_PEEK', 'OPEN', 'HOVER_CLOSE', 'CLOSING', 'SLAMMING'];

export default function TreasureBox({ items, config, backgroundColor, fullpageMode, onItemsEscaped, onItemsReturned }: Props) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const bodiesRef = useRef<(Matter.Body & { itemData?: TreasureItem })[]>([]);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const blobUrlsRef = useRef<string[]>([]);

  // Drawer state machine — single source of truth
  const [boxState, setBoxState] = useState<BoxState>('IDLE');
  const [activeStory, setActiveStory] = useState<TreasureItem | null>(null);

  // Derived states from boxState — no separate boolean that can drift
  const isOpen = boxState === 'OPEN' || boxState === 'HOVER_CLOSE' || boxState === 'CLOSING' || boxState === 'SLAMMING';
  const physicsActive = boxState === 'OPEN' || boxState === 'HOVER_CLOSE';

  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spawnIndexRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const spawnIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const itemsHandedOffRef = useRef(false);
  const closingAnimRef = useRef(false);

  // Managed timeout system — tracks ALL timeouts for clean cancellation
  const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const managedTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timeoutsRef.current.delete(id);
      fn();
    }, ms);
    timeoutsRef.current.add(id);
    return id;
  }, []);

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(id => clearTimeout(id));
    timeoutsRef.current.clear();
  }, []);

  const hasGeneratedImages = !!(config.drawerImages && (config.drawerImages.spriteUrl || config.drawerImages.urls?.IDLE));
  const bg = backgroundColor || config.backgroundColor || '#0e0e0e';
  const isTransparent = bg === 'transparent' || bg === 'rgba(0,0,0,0)';
  const isLightBg = isTransparent ? false : isLightColor(bg);

  // Preload image via fetch → blob URL to avoid CORS canvas tainting
  const loadImageAsBlobUrl = useCallback((key: string, url: string, onLoad?: () => void) => {
    if (imagesRef.current.has(key)) return;
    const img = new Image();
    if (onLoad) img.onload = onLoad;
    imagesRef.current.set(key, img);

    fetch(url)
      .then(res => res.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        blobUrlsRef.current.push(blobUrl);
        img.src = blobUrl;
      })
      .catch(() => {
        // Fallback: load directly if fetch fails (e.g. local dev without CORS)
        img.src = url;
      });
  }, []);

  // Preload item images via blob URLs
  const [imagesLoaded, setImagesLoaded] = useState(0);
  useEffect(() => {
    items.forEach(item => {
      loadImageAsBlobUrl(item.id, item.imageUrl, () => setImagesLoaded(n => n + 1));
    });
  }, [items, loadImageAsBlobUrl]);

  // Preload drawer images (sprite sheet or legacy per-state)
  useEffect(() => {
    if (!config.drawerImages) return;
    if (config.drawerImages.spriteUrl) {
      loadImageAsBlobUrl('drawer_sprite', config.drawerImages.spriteUrl);
    } else if (config.drawerImages.urls) {
      const urls = config.drawerImages.urls;
      ALL_BOX_STATES.forEach(state => {
        const url = urls[state];
        if (url) loadImageAsBlobUrl(`drawer_${state}`, url);
      });
    }
  }, [config.drawerImages, loadImageAsBlobUrl]);

  // Init sound
  useEffect(() => {
    soundEngine.init();
    soundEngine.setEnabled(config.soundEnabled);
    soundEngine.setVolume(config.soundVolume);
    soundEngine.setPreset(config.soundPreset);
  }, [config]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    if (!canvas || !scene) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = scene.offsetWidth * dpr;
    canvas.height = scene.offsetHeight * dpr;
    canvas.style.width = scene.offsetWidth + 'px';
    canvas.style.height = scene.offsetHeight + 'px';
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
      if (engineRef.current) Matter.Engine.clear(engineRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
      timeoutsRef.current.forEach(id => clearTimeout(id));
      timeoutsRef.current.clear();
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    };
  }, []);

  const clearPhysics = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
    if (engineRef.current) {
      Matter.Engine.clear(engineRef.current);
      engineRef.current = null;
    }
    runnerRef.current = null;
    bodiesRef.current = [];
    // Clear canvas
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    }
  }, []);

  const initPhysics = useCallback(() => {
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    if (!canvas || !scene) return;

    // Guard: destroy existing engine to prevent leaks on double-init
    if (engineRef.current) {
      if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
      Matter.Engine.clear(engineRef.current);
    }

    const engine = Matter.Engine.create({ gravity: { x: 0, y: 2 } });
    engineRef.current = engine;

    const w = scene.offsetWidth;
    const h = scene.offsetHeight;
    // Adaptive walls: scale to container size instead of hardcoded values
    const boxW = Math.min(420, w * 0.85);
    const boxCenterX = w / 2;
    const floorY = h - Math.max(120, h * 0.3);

    const wallOpts = { isStatic: true, friction: 0.9, restitution: 0.15 };
    const floor = Matter.Bodies.rectangle(boxCenterX, floorY, boxW, 14, wallOpts);
    const leftWall = Matter.Bodies.rectangle(
      boxCenterX - boxW / 2 - 7, floorY - 300, 14, 700, wallOpts
    );
    const rightWall = Matter.Bodies.rectangle(
      boxCenterX + boxW / 2 + 7, floorY - 300, 14, 700, wallOpts
    );

    Matter.Composite.add(engine.world, [floor, leftWall, rightWall]);

    const mouse = Matter.Mouse.create(canvas);
    mouse.pixelRatio = window.devicePixelRatio || 1;
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse,
      constraint: { stiffness: 0.5, render: { visible: false } },
    });
    Matter.Composite.add(engine.world, mouseConstraint);

    // Long press for story
    Matter.Events.on(mouseConstraint, 'mousedown', (e: any) => {
      const body = e.source.body;
      if (body?.itemData) {
        longPressRef.current = setTimeout(() => {
          setActiveStory(body.itemData);
        }, 800);
      }
    });
    Matter.Events.on(mouseConstraint, 'mouseup', () => {
      if (longPressRef.current) clearTimeout(longPressRef.current);
    });
    Matter.Events.on(mouseConstraint, 'mousemove', () => {
      if (longPressRef.current) clearTimeout(longPressRef.current);
    });

    // Collision sounds
    Matter.Events.on(engine, 'collisionStart', (e) => {
      e.pairs.forEach(pair => {
        const vel = Math.sqrt(
          Math.pow(pair.bodyA.velocity.x - pair.bodyB.velocity.x, 2) +
          Math.pow(pair.bodyA.velocity.y - pair.bodyB.velocity.y, 2)
        );
        soundEngine.playCollision(vel);
      });
    });

    const runner = Matter.Runner.create();
    runnerRef.current = runner;
    Matter.Runner.run(runner, engine);
  }, []);

  const spawnItems = useCallback(() => {
    const scene = sceneRef.current;
    const engine = engineRef.current;
    if (!scene || !engine) return;

    const w = scene.offsetWidth;
    const h = scene.offsetHeight;
    const spawnY = h - 200;
    const centerX = w / 2;

    spawnIndexRef.current = 0;

    // Clear any previous spawn interval
    if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);

    const interval = setInterval(() => {
      const idx = spawnIndexRef.current;
      if (idx >= items.length) {
        clearInterval(interval);
        spawnIntervalRef.current = null;
        return;
      }

      const item = items[idx];
      const x = centerX + (Math.random() - 0.5) * 100;
      const itemScale = item.scale ?? 1;
      const size = ITEM_BASE_SIZE * itemScale;

      let body: Matter.Body & { itemData?: TreasureItem };

      if (item.contourPoints && item.contourPoints.length >= 4) {
        try {
          const verts = contourToVertices(item.contourPoints, size, size);
          body = Matter.Bodies.fromVertices(x, spawnY, [verts], {
            restitution: 0.25, friction: 0.7, density: 0.003, chamfer: { radius: 2 },
          }) as any;
        } catch {
          body = Matter.Bodies.rectangle(x, spawnY, size, size * 0.8, {
            restitution: 0.25, friction: 0.7, density: 0.003, chamfer: { radius: 4 },
          }) as any;
        }
      } else {
        const aspectRatio = 0.7 + Math.random() * 0.6;
        body = Matter.Bodies.rectangle(x, spawnY, size, size * aspectRatio, {
          restitution: 0.25, friction: 0.7, density: 0.003, chamfer: { radius: 4 },
        }) as any;
      }

      body.itemData = item;

      // Set initial rotation from item config (degrees to radians), or random
      if (item.rotation !== undefined) {
        Matter.Body.setAngle(body, (item.rotation * Math.PI) / 180);
      }

      Matter.Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 5,
        y: -(4 + Math.random() * 6),
      });
      // If rotation is explicitly set, use minimal spin so item lands near configured angle
      const angVel = (item.rotation !== undefined && item.rotation !== 0)
        ? (Math.random() - 0.5) * 0.02
        : (Math.random() - 0.5) * 0.15;
      Matter.Body.setAngularVelocity(body, angVel);

      bodiesRef.current.push(body);
      Matter.Composite.add(engine.world, body);

      spawnIndexRef.current++;
    }, 200);
    spawnIntervalRef.current = interval;
  }, [items]);

  const renderLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // In fullpage mode, skip rendering items locally once handed off to host page
    if (itemsHandedOffRef.current) {
      animFrameRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    bodiesRef.current.forEach(body => {
      const { x, y } = body.position;
      const angle = body.angle;
      const item = body.itemData;
      if (!item) return;

      let size = ITEM_BASE_SIZE * (item.scale ?? 1);

      // During closing, shrink items as they converge on the drawer
      if (closingAnimRef.current) {
        const drawerCenterX = w / 2;
        const drawerY = h - 150;
        const dist = Math.sqrt((x - drawerCenterX) ** 2 + (y - drawerY) ** 2);
        const shrink = Math.min(1, dist / 200); // closer = smaller
        size *= Math.max(0.1, shrink);
        if (size < 3) return; // skip tiny items
      }
      const img = imagesRef.current.get(item.id);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      ctx.shadowColor = isLightBg ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 4;

      if (img && img.complete && img.naturalWidth > 0) {
        const imgAspect = img.naturalWidth / img.naturalHeight;
        let drawW = size;
        let drawH = size;
        if (imgAspect > 1) drawH = size / imgAspect;
        else drawW = size * imgAspect;

        ctx.beginPath();
        ctx.roundRect(-drawW / 2, -drawH / 2, drawW, drawH, 4);
        ctx.clip();
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      } else {
        ctx.fillStyle = '#5a5a4a';
        ctx.beginPath();
        ctx.roundRect(-size / 2, -size / 2, size, size, 4);
        ctx.fill();
      }

      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = isLightBg ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      ctx.restore();

      ctx.save();
      ctx.font = '500 8px "IBM Plex Mono", monospace';
      ctx.fillStyle = isLightBg ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.25)';
      ctx.textAlign = 'center';
      ctx.fillText(item.label.substring(0, 14), x, y + size / 2 + 14);
      ctx.restore();
    });

    animFrameRef.current = requestAnimationFrame(renderLoop);
  }, [isLightBg]);

  // ===== State machine handlers =====

  const openDrawer = useCallback(() => {
    // Guard: only open from closed states
    if (isOpen) return;

    // Clean slate: cancel any pending timeouts from previous cycles
    clearAllTimeouts();
    if (spawnIntervalRef.current) { clearInterval(spawnIntervalRef.current); spawnIntervalRef.current = null; }
    clearPhysics();
    itemsHandedOffRef.current = false;
    closingAnimRef.current = false;

    setBoxState('OPEN');

    managedTimeout(() => {
      initPhysics();
      managedTimeout(() => {
        spawnItems();
        renderLoop();
      }, 200);
    }, 600);

    // In fullpage mode, notify parent that items have escaped
    if (fullpageMode && onItemsEscaped) {
      managedTimeout(() => {
        onItemsEscaped(items.map(item => ({
          id: item.id,
          imageUrl: item.imageUrl,
          label: item.label,
        })));
        itemsHandedOffRef.current = true;
      }, 800);
    }
  }, [isOpen, initPhysics, spawnItems, renderLoop, clearPhysics, clearAllTimeouts, managedTimeout, fullpageMode, onItemsEscaped, items]);

  const closeDrawer = useCallback(() => {
    // Guard: only close from open states
    if (!isOpen) return;

    // Cancel all pending open timeouts + spawn interval
    clearAllTimeouts();
    if (spawnIntervalRef.current) { clearInterval(spawnIntervalRef.current); spawnIntervalRef.current = null; }

    // Reset fullpage handoff so items render locally during close animation
    itemsHandedOffRef.current = false;

    // In fullpage mode, notify parent that items are returning
    if (fullpageMode && onItemsReturned) {
      onItemsReturned();
    }

    // Pull items INTO the drawer (toward the drawer opening)
    const scene = sceneRef.current;
    const engine = engineRef.current;
    const drawerCenterX = scene ? scene.offsetWidth / 2 : 200;
    // Target: the drawer opening area (bottom of the scene, where the drawer is)
    const drawerY = scene ? scene.offsetHeight - 150 : 300;

    if (engine) {
      // Kill gravity so items float toward the drawer
      engine.gravity.y = 0;
      engine.gravity.x = 0;
    }

    // Animate items flying into the drawer over ~400ms using a repeating force
    closingAnimRef.current = true;
    const pullInterval = setInterval(() => {
      if (!closingAnimRef.current) { clearInterval(pullInterval); return; }
      bodiesRef.current.forEach(body => {
        const dx = drawerCenterX - body.position.x;
        const dy = drawerY - body.position.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        // Strong pull toward drawer center
        Matter.Body.applyForce(body, body.position, {
          x: (dx / dist) * 0.015,
          y: (dy / dist) * 0.015,
        });
        // Dampen velocity for smooth convergence
        Matter.Body.setVelocity(body, {
          x: body.velocity.x * 0.9,
          y: body.velocity.y * 0.9,
        });
      });
    }, 16);

    // Transition: CLOSING → SLAMMING → IDLE
    setBoxState('CLOSING');

    managedTimeout(() => {
      closingAnimRef.current = false;
      clearInterval(pullInterval);
      setBoxState('SLAMMING');

      managedTimeout(() => {
        clearPhysics();
        setBoxState('IDLE');
      }, 350);
    }, 500);
  }, [isOpen, clearPhysics, clearAllTimeouts, managedTimeout, fullpageMode, onItemsReturned]);

  // Stable refs so handlers don't go stale across re-renders
  const openDrawerRef = useRef(openDrawer);
  const closeDrawerRef = useRef(closeDrawer);
  useEffect(() => { openDrawerRef.current = openDrawer; }, [openDrawer]);
  useEffect(() => { closeDrawerRef.current = closeDrawer; }, [closeDrawer]);

  const handleDrawerMouseEnter = useCallback(() => {
    if (boxState === 'IDLE') {
      setBoxState('HOVER_PEEK');
    } else if (boxState === 'OPEN') {
      setBoxState('HOVER_CLOSE');
    }
  }, [boxState]);

  const handleDrawerMouseLeave = useCallback(() => {
    if (boxState === 'HOVER_PEEK') {
      setBoxState('IDLE');
    } else if (boxState === 'HOVER_CLOSE') {
      setBoxState('OPEN');
    }
  }, [boxState]);

  const handleDrawerClick = useCallback(() => {
    if (boxState === 'IDLE' || boxState === 'HOVER_PEEK') {
      openDrawerRef.current();
    } else if (boxState === 'OPEN' || boxState === 'HOVER_CLOSE') {
      closeDrawerRef.current();
    }
    // CLOSING and SLAMMING: ignore clicks (animation in progress)
  }, [boxState]);

  // Click on canvas (not on a body) → close the drawer
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (boxState !== 'OPEN' && boxState !== 'HOVER_CLOSE') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Check if click is on any physics body
    const bodies = bodiesRef.current;
    const clickedBody = bodies.some(body => {
      const bx = body.position.x;
      const by = body.position.y;
      const size = 52 * (body.itemData?.scale ?? 1);
      return Math.abs(x - bx) < size / 2 && Math.abs(y - by) < size / 2;
    });
    if (!clickedBody) {
      closeDrawerRef.current();
    }
  }, [boxState]);

  // Accelerometer for mobile
  useEffect(() => {
    const handler = (e: DeviceMotionEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      const ax = e.accelerationIncludingGravity?.x;
      const ay = e.accelerationIncludingGravity?.y;
      if (ax != null && ay != null) {
        engine.gravity.x = ax * -0.15;
        engine.gravity.y = Math.max(0.5, ay * 0.15);
      }
    };
    window.addEventListener('devicemotion', handler);
    return () => window.removeEventListener('devicemotion', handler);
  }, []);

  return (
    <div
      ref={sceneRef}
      className="relative w-full h-full min-h-[400px] overflow-hidden select-none"
      style={{ background: isTransparent ? 'transparent' : bg }}
    >
      {/* Drawer area — below canvas when open so items render on top */}
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 cursor-pointer"
        style={{ zIndex: isOpen ? 10 : 20 }}
        onMouseEnter={handleDrawerMouseEnter}
        onMouseLeave={handleDrawerMouseLeave}
        onClick={handleDrawerClick}
      >
        {hasGeneratedImages ? (
          // === AI-Generated Image Drawer ===
          <DrawerImage
            images={config.drawerImages!}
            currentState={boxState}
            isLight={isLightBg}
          />
        ) : (
          // === ASCII Art Fallback (dimension-aware) ===
          <DynamicASCIIBox
            dimensions={config.boxDimensions || DEFAULT_BOX_DIMENSIONS}
            label={config.drawerLabel || 'TREASURE BOX'}
            state={boxState}
            isOpen={isOpen}
            isLight={isLightBg}
          />
        )}
      </div>

      {/* Physics canvas — above drawer when open so items are visible */}
      <canvas
        ref={canvasRef}
        onClick={physicsActive ? handleCanvasClick : undefined}
        className={`absolute inset-0 ${physicsActive ? 'pointer-events-auto' : 'pointer-events-none'}`}
        style={{ zIndex: isOpen ? 15 : 5 }}
      />

      {/* Story overlay */}
      {activeStory && (
        <StoryCard item={activeStory} onClose={() => setActiveStory(null)} isLight={isLightBg} />
      )}

      {/* Subtle scanlines */}
      <div
        className="absolute inset-0 pointer-events-none z-[999]"
        style={{
          background: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.015) 2px, rgba(0,0,0,0.015) 4px)`,
          mixBlendMode: 'multiply',
        }}
      />
    </div>
  );
}

// ===== AI-Generated Drawer Image Component =====

// CSS sprite rendering: frame index maps each state to a frame in the sprite sheet.
// The img is rendered at 5× container width inside an overflow:hidden wrapper,
// and translateX shifts the visible frame instantly.
const STATE_TO_FRAME: Record<BoxState, number> = {
  IDLE: 0,         // Frame 0: closed
  HOVER_PEEK: 1,   // Frame 1: 25% open
  OPEN: 4,         // Frame 4: 100% open
  HOVER_CLOSE: 3,  // Frame 3: 75% open
  CLOSING: 1,      // Frame 1: ~30% (closest match)
  SLAMMING: 0,     // Frame 0: closed
};

function DrawerImage({
  images,
  currentState,
  isLight,
}: {
  images: DrawerImages;
  currentState: BoxState;
  isLight: boolean;
}) {
  const dropShadow = isLight ? 'none' : 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))';

  return (
    <div className="relative" style={{ width: 420, height: 300 }}>
      {images.spriteUrl ? (
        // CSS sprite technique: oversized img inside clipping container, translateX to select frame
        <div
          style={{
            width: 420,
            height: 300,
            overflow: 'hidden',
            filter: dropShadow,
          }}
        >
          <img
            src={images.spriteUrl}
            alt="drawer"
            className="pointer-events-none"
            style={{
              width: 420 * 5,
              height: 300,
              maxWidth: 'none', // prevent CSS resets from constraining width
              transform: `translateX(-${STATE_TO_FRAME[currentState] * 420}px)`,
              // No transition — instant frame switching
            }}
            draggable={false}
          />
        </div>
      ) : (
        // Legacy fallback: per-state images (instant switching, no fade)
        ALL_BOX_STATES.map(state => (
          <img
            key={state}
            src={images.urls[state]}
            alt={state}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            style={{
              opacity: currentState === state ? 1 : 0,
              filter: dropShadow,
            }}
            draggable={false}
          />
        ))
      )}

      {/* Hint text for IDLE state */}
      {currentState === 'IDLE' && (
        <div
          className="absolute bottom-0 left-0 right-0 text-center text-[10px] animate-pulse"
          style={{ color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.25)' }}
        >
          ▸ hover to peek, click to open
        </div>
      )}
    </div>
  );
}

// ===== Dynamic ASCII Box (dimension-aware) =====

function DynamicASCIIBox({
  dimensions,
  label,
  state,
  isOpen,
  isLight,
}: {
  dimensions: BoxDimensions;
  label: string;
  state: BoxState;
  isOpen: boolean;
  isLight: boolean;
}) {
  const fg = isLight ? '#5a5a50' : '#7a7a6a';
  const dim = isLight ? '#c0b8a8' : '#3a3a32';
  const rust = isLight ? '#8a5a30' : '#8a6a4a';
  const accent = isLight ? '#6a5a3a' : '#b0a080';

  const w = dimensions.boxWidth;
  const bodyH = dimensions.boxHeight;
  const drawerH = dimensions.drawerHeight;
  const pullout = dimensions.drawerPullout[state];
  const innerW = w - 4;
  const handleStyle = dimensions.handleStyle;

  // Build handle string
  const renderHandle = () => {
    const available = innerW - 2;
    switch (handleStyle) {
      case 'knob': {
        const pad = Math.floor((available - 3) / 2);
        return { before: ' '.repeat(pad), handle: '(O)', after: ' '.repeat(available - pad - 3) };
      }
      case 'pull-bar': {
        const barW = Math.min(16, available - 4);
        const pad = Math.floor((available - barW) / 2);
        const bar = `[ ${'═'.repeat(Math.max(0, barW - 4))} ]`;
        return { before: ' '.repeat(pad), handle: bar, after: ' '.repeat(Math.max(0, available - pad - barW)) };
      }
      case 'ring': {
        const pad = Math.floor((available - 5) / 2);
        return { before: ' '.repeat(pad), handle: '(( ))', after: ' '.repeat(available - pad - 5) };
      }
      case 'tab': {
        const pad = Math.floor((available - 7) / 2);
        return { before: ' '.repeat(pad), handle: '[_____]', after: ' '.repeat(available - pad - 7) };
      }
    }
  };

  const { before: hPad, handle: hText, after: hAfter } = renderHandle();
  const rivet = dimensions.hasRivets;

  // Padded label
  const maxLabelW = innerW - 4;
  const truncLabel = label.substring(0, maxLabelW);
  const padLabel = truncLabel.padStart(Math.floor((maxLabelW + truncLabel.length) / 2)).padEnd(maxLabelW);

  return (
    <div>
      {/* Slide-out portion */}
      <div
        className="overflow-hidden transition-[max-height] duration-700 ease-out"
        style={{ maxHeight: pullout > 0 ? 300 : 0 }}
      >
        {pullout > 0 && (
          <pre className="font-mono text-[11px] leading-[1.3]" style={{ color: fg, whiteSpace: 'pre' }}>
            {(() => {
              const slideRows = Math.max(1, Math.round((pullout / 100) * (drawerH + 2)));
              const lines: React.ReactElement[] = [];

              // 2.5D depth: 0-9%→0, 10-30%→1, 31-60%→2, 61+→3
              const maxDepth = 3;
              const depth = pullout < 10 ? 0 : Math.min(maxDepth, Math.ceil(pullout / 30));
              const safeDepth = Math.min(depth, Math.floor((innerW - 2 - 8) / 2));

              if (safeDepth === 0) {
                // Flat fallback (SLAMMING or very small pullout)
                const slideW = innerW - 2;
                lines.push(
                  <span key="st">{'    '}{'┌'}{'─'.repeat(slideW)}{'┐'}{'\n'}</span>
                );
                for (let i = 0; i < slideRows - 1; i++) {
                  if (i === 0 && pullout > 50) {
                    lines.push(
                      <span key={`si${i}`}>{'    │ '}<span style={{ color: dim }}>{'░'.repeat(slideW - 2)}</span>{' │\n'}</span>
                    );
                  } else {
                    lines.push(
                      <span key={`si${i}`}>{'    │'}{' '.repeat(slideW)}{'│\n'}</span>
                    );
                  }
                }
                lines.push(
                  <span key="sb">{'    '}{'└'}{'─'.repeat(slideW)}{'┘'}{'\n'}</span>
                );
              } else {
                // 2.5D trapezoid: narrower top, wider bottom aligning with box
                const topW = innerW - 2 * safeDepth;

                // Top border (narrowest, indented)
                lines.push(
                  <span key="st">{' '.repeat(2 + safeDepth)}{'┌'}{'─'.repeat(topW)}{'┐'}{'\n'}</span>
                );

                // Interior rows with expanding perspective lines
                for (let i = 0; i < slideRows; i++) {
                  const progress = slideRows > 1 ? (i + 1) / (slideRows + 1) : 0.5;
                  const sideW = Math.min(safeDepth, Math.round(progress * safeDepth));
                  const indent = safeDepth - sideW;

                  const leftPersp = sideW > 0
                    ? <><span style={{ color: dim }}>{'╱'}</span>{' '.repeat(sideW - 1)}</>
                    : null;
                  const rightPersp = sideW > 0
                    ? <>{' '.repeat(sideW - 1)}<span style={{ color: dim }}>{'╲'}</span></>
                    : null;

                  const content = (i === 0 && pullout > 50)
                    ? <span style={{ color: dim }}>{'░'.repeat(topW)}</span>
                    : ' '.repeat(topW);

                  lines.push(
                    <span key={`si${i}`}>
                      {' '.repeat(2 + indent)}{leftPersp}{'│'}{content}{'│'}{rightPersp}{'\n'}
                    </span>
                  );
                }
                // No bottom border — main box ╔═╗ serves as the drawer floor
              }

              return lines;
            })()}
          </pre>
        )}
      </div>

      {/* Main box */}
      <pre className="font-mono text-[11px] leading-[1.3]" style={{ color: fg, whiteSpace: 'pre' }}>
        {/* Top border */}
        {'  ╔'}{'═'.repeat(innerW)}{'╗\n'}

        {/* Drawer face rows */}
        {Array.from({ length: drawerH }).map((_, row) => {
          const mid = Math.floor(drawerH / 2);
          const isRivetRow = rivet && (row === 0 || row === drawerH - 1);

          if (row === mid) {
            return (
              <span key={`d${row}`}>
                {'  ║'}
                {isRivetRow ? <span style={{ color: rust }}>o</span> : ' '}
                {hPad}<span style={{ color: accent }}>{hText}</span>{hAfter}
                {isRivetRow ? <span style={{ color: rust }}>o</span> : ' '}
                {'║\n'}
              </span>
            );
          }

          if (row === mid - 1 && drawerH > 4) {
            // Label row
            return (
              <span key={`d${row}`}>
                {'  ║'}
                {isRivetRow ? <span style={{ color: rust }}>o</span> : ' '}
                {' '}<span style={{ color: rust }}>{padLabel}</span>{' '}
                {isRivetRow ? <span style={{ color: rust }}>o</span> : ' '}
                {'║\n'}
              </span>
            );
          }

          if (row === mid + 1 && dimensions.hasKeyhole) {
            const kPad = Math.floor((innerW - 5) / 2);
            return (
              <span key={`d${row}`}>
                {'  ║'}{' '.repeat(kPad)}<span style={{ color: accent }}>{'[@]'}</span>{' '.repeat(innerW - kPad - 3)}{'║\n'}
              </span>
            );
          }

          return (
            <span key={`d${row}`}>
              {'  ║'}
              {isRivetRow ? <span style={{ color: rust }}>o</span> : ' '}
              {' '.repeat(innerW - 2)}
              {isRivetRow ? <span style={{ color: rust }}>o</span> : ' '}
              {'║\n'}
            </span>
          );
        })}

        {/* Divider */}
        {'  ╠'}{'═'.repeat(innerW)}{'╣\n'}

        {/* Body rows */}
        {Array.from({ length: bodyH }).map((_, row) => {
          const isRivetRow = rivet && (row === 0 || row === bodyH - 1);
          const isTexRow = row === 1 || row === bodyH - 2;

          return (
            <span key={`b${row}`}>
              {'  ║'}
              {isRivetRow ? <span style={{ color: rust }}>o</span> : ' '}
              {isTexRow
                ? <span style={{ color: dim }}>{'░'.repeat(innerW - 2)}</span>
                : ' '.repeat(innerW - 2)
              }
              {isRivetRow ? <span style={{ color: rust }}>o</span> : ' '}
              {'║\n'}
            </span>
          );
        })}

        {/* Bottom border */}
        {'  ╚'}{'═'.repeat(innerW)}{'╝\n'}

        {/* Shadow */}
        <span style={{ color: dim }}>{'  '}{'·'.repeat(innerW + 2)}</span>
      </pre>

      {/* Hint */}
      {state === 'IDLE' && (
        <div
          className="text-center text-[10px] mt-3 animate-pulse"
          style={{ color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.25)' }}
        >
          ▸ click to open drawer
        </div>
      )}

      {/* Slam effect */}
      {state === 'SLAMMING' && (
        <div className="text-center text-[10px] mt-1" style={{ color: rust }}>
          ~ ~ ~ SLAM ~ ~ ~
        </div>
      )}
    </div>
  );
}

function isLightColor(color: string): boolean {
  let r = 0, g = 0, b = 0;
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
  }
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}
