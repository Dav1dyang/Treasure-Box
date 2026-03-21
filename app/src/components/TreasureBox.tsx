'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Matter from 'matter-js';
import { soundEngine } from '@/lib/sounds';
import { contourToVertices } from '@/lib/contour';
import type { TreasureItem, BoxConfig, BoxState, DrawerImages, BoxDimensions } from '@/lib/types';
import { DEFAULT_DRAWER_DISPLAY_SIZE } from '@/lib/types';
import { DEFAULT_BOX_DIMENSIONS } from '@/lib/types';
import StoryCard from './StoryCard';

const ITEM_BASE_SIZE = 52;

interface OverlayPreviewConfig {
  /** CSS styles to position the drawer at the anchor point */
  drawerStyle: React.CSSProperties;
  /** Spawn origin as fraction of scene (0-1) */
  spawnOrigin: { x: number; y: number };
  /** Drag callback — fired with PointerEvent and phase */
  onDrag?: (e: PointerEvent, phase: 'start' | 'move' | 'end') => void;
}

interface Props {
  items: TreasureItem[];
  config: BoxConfig;
  backgroundColor?: string;
  fullpageMode?: boolean;
  onItemsEscaped?: (items: { id: string; imageUrl: string; label: string }[]) => void;
  onItemsReturned?: () => void;
  /** When set, TreasureBox uses full-scene edge walls and positions drawer at anchor */
  overlayPreview?: OverlayPreviewConfig;
  /** When true, skips min-h constraint for iframe/contained embeds */
  embedded?: boolean;
}

const ALL_BOX_STATES: BoxState[] = ['IDLE', 'HOVER_PEEK', 'OPEN', 'HOVER_CLOSE', 'CLOSING', 'SLAMMING'];

export default function TreasureBox({ items, config, backgroundColor, fullpageMode, onItemsEscaped, onItemsReturned, overlayPreview, embedded }: Props) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const bodiesRef = useRef<(Matter.Body & { itemData?: TreasureItem })[]>([]);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const blobUrlsRef = useRef<string[]>([]);
  const appliedScaleRef = useRef<Map<string, number>>(new Map());
  const contentScaleRef = useRef(config.contentScale ?? 1);

  // Drawer state machine — single source of truth
  const [boxState, setBoxState] = useState<BoxState>('IDLE');
  const [activeStory, setActiveStory] = useState<TreasureItem | null>(null);

  // Derived states from boxState — no separate boolean that can drift
  const isOpen = boxState === 'OPEN' || boxState === 'HOVER_CLOSE' || boxState === 'CLOSING' || boxState === 'SLAMMING';
  const physicsActive = boxState === 'OPEN' || boxState === 'HOVER_CLOSE';

  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseDownBodyRef = useRef<any>(null);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);
  const longPressFiredRef = useRef(false);
  const pendingLinkRef = useRef<string | null>(null);
  const spawnIndexRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const spawnIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const itemsHandedOffRef = useRef(false);
  const closingAnimRef = useRef(false);
  const drawerElRef = useRef<HTMLDivElement>(null);

  // Drag-to-reposition state (overlay preview only)
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDraggingDrawer = useRef(false);

  // Keep overlayPreview ref fresh for use inside callbacks
  const overlayPreviewRef = useRef(overlayPreview);
  useEffect(() => { overlayPreviewRef.current = overlayPreview; }, [overlayPreview]);

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

  // Keep contentScale ref in sync for use inside initPhysics closure
  useEffect(() => { contentScaleRef.current = config.contentScale ?? 1; }, [config.contentScale]);

  const contentScale = config.contentScale ?? 1;
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

  // Sync physics bodies when items prop changes (scale/rotation sliders)
  useEffect(() => {
    if (!engineRef.current) return;

    bodiesRef.current.forEach(body => {
      const itemData = body.itemData;
      if (!itemData) return;

      const currentItem = items.find(i => i.id === itemData.id);
      if (!currentItem) return;

      // Rotation sync — setAngle is absolute
      const newAngleRad = ((currentItem.rotation ?? 0) * Math.PI) / 180;
      const oldAngleRad = ((itemData.rotation ?? 0) * Math.PI) / 180;
      if (Math.abs(newAngleRad - oldAngleRad) > 0.001) {
        Matter.Body.setAngle(body, newAngleRad);
      }

      // Scale sync — Body.scale() is relative, compute ratio from tracked absolute
      const newScale = currentItem.scale ?? 1;
      const appliedScale = appliedScaleRef.current.get(itemData.id) ?? 1;
      if (Math.abs(newScale - appliedScale) > 0.001) {
        const ratio = newScale / appliedScale;
        Matter.Body.scale(body, ratio, ratio);
        appliedScaleRef.current.set(itemData.id, newScale);
      }

      // Update itemData so render loop reads current values
      body.itemData = currentItem;
    });
  }, [items]);

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
    // Backward compat: old boxes with 'ai-generated' preset fall back to 'metallic'
    const preset = config.soundPreset === 'ai-generated' as string ? 'metallic' : config.soundPreset;
    soundEngine.setPreset(preset);
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
    appliedScaleRef.current.clear();
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
    const cs = contentScaleRef.current;
    const wallOpts = { isStatic: true, friction: 0.9, restitution: 0.15 };

    if (overlayPreviewRef.current) {
      // Full-scene walls — items bounce off all 4 edges of the preview
      Matter.Composite.add(engine.world, [
        Matter.Bodies.rectangle(w / 2, h + 7, w + 14, 14, wallOpts),   // floor
        Matter.Bodies.rectangle(w / 2, -7, w + 14, 14, wallOpts),       // ceiling
        Matter.Bodies.rectangle(-7, h / 2, 14, h + 14, wallOpts),       // left
        Matter.Bodies.rectangle(w + 7, h / 2, 14, h + 14, wallOpts),    // right
      ]);

      // Drawer collision body — bottom 3/4 is solid, top 1/4 is open.
      // Items land on the top surface of the solid portion (the "rim"),
      // and visually overlap the top 1/4 since the canvas z-index (15)
      // sits above the drawer z-index (10) when open — creating the
      // illusion of items sitting inside the drawer, peeking out.
      if (drawerElRef.current && sceneRef.current) {
        const sceneRect = sceneRef.current.getBoundingClientRect();
        const drawerRect = drawerElRef.current.getBoundingClientRect();
        const dw = drawerRect.width;
        const dh = drawerRect.height;
        const centerX = drawerRect.left - sceneRect.left + dw / 2;
        const centerY = drawerRect.top - sceneRect.top + dh / 2;

        // Solid body = bottom 3/4 of the drawer visual
        //   top edge:    centerY - dh/2 + dh*0.25  (1/4 down from visual top)
        //   bottom edge: centerY + dh/2             (visual bottom)
        //   center:      centerY + dh/8             (shifted down by 1/8)
        const bodyH = dh * 0.75;
        const bodyY = centerY + dh / 8;
        const drawerBody = Matter.Bodies.rectangle(centerX, bodyY, dw, bodyH, {
          isStatic: true, friction: 0.9, restitution: 0.3, label: 'drawer',
        });
        Matter.Composite.add(engine.world, drawerBody);
      }
    } else {
      // Normal mode: box-shaped walls centered around the actual drawer element
      let boxCenterX = w / 2;
      let floorY = h - Math.max(120 * cs, h * 0.3);
      let boxW = Math.min(420 * cs, w * 0.85);

      // Derive wall positions from the drawer element's actual DOM rect
      if (drawerElRef.current && scene) {
        const sceneRect = scene.getBoundingClientRect();
        const drawerRect = drawerElRef.current.getBoundingClientRect();
        boxCenterX = drawerRect.left - sceneRect.left + drawerRect.width / 2;
        floorY = drawerRect.top - sceneRect.top + drawerRect.height * 0.25;
        boxW = Math.max(drawerRect.width, 200 * cs);
      }

      const floor = Matter.Bodies.rectangle(boxCenterX, floorY, boxW, 14, wallOpts);
      const leftWall = Matter.Bodies.rectangle(
        boxCenterX - boxW / 2 - 7, floorY - 300, 14, 700 * cs, wallOpts
      );
      const rightWall = Matter.Bodies.rectangle(
        boxCenterX + boxW / 2 + 7, floorY - 300, 14, 700 * cs, wallOpts
      );
      Matter.Composite.add(engine.world, [floor, leftWall, rightWall]);
    }

    const mouse = Matter.Mouse.create(canvas);
    mouse.pixelRatio = window.devicePixelRatio || 1;
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse,
      constraint: { stiffness: 0.5, render: { visible: false } },
    });
    Matter.Composite.add(engine.world, mouseConstraint);

    // Item interaction: quick-click → open link, drag → move, long-press → story
    Matter.Events.on(mouseConstraint, 'mousedown', (e: any) => {
      const body = e.source.body;
      didDragRef.current = false;
      longPressFiredRef.current = false;
      mouseDownBodyRef.current = body?.itemData ? body : null;
      mouseDownPosRef.current = body?.itemData
        ? { x: mouse.position.x, y: mouse.position.y }
        : null;
      if (body?.itemData) {
        longPressRef.current = setTimeout(() => {
          longPressFiredRef.current = true;
          setActiveStory(body.itemData);
        }, 800);
      }
    });
    Matter.Events.on(mouseConstraint, 'mouseup', () => {
      if (longPressRef.current) {
        clearTimeout(longPressRef.current);
        longPressRef.current = null;
      }
      const body = mouseDownBodyRef.current;
      if (body?.itemData && !didDragRef.current && !longPressFiredRef.current) {
        const link = body.itemData.link;
        if (link) {
          pendingLinkRef.current = link;
        }
      }
      mouseDownBodyRef.current = null;
      mouseDownPosRef.current = null;
    });
    Matter.Events.on(mouseConstraint, 'mousemove', () => {
      if (!mouseDownPosRef.current) return;
      const dx = mouse.position.x - mouseDownPosRef.current.x;
      const dy = mouse.position.y - mouseDownPosRef.current.y;
      if (dx * dx + dy * dy > 25) {
        didDragRef.current = true;
        if (longPressRef.current) {
          clearTimeout(longPressRef.current);
          longPressRef.current = null;
        }
      }
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
    const cs = contentScaleRef.current;
    const op = overlayPreviewRef.current;

    // Derive spawn position from the actual drawer element when available
    let spawnY: number;
    let centerX: number;
    if (op) {
      spawnY = op.spawnOrigin.y * h;
      centerX = op.spawnOrigin.x * w;
    } else if (drawerElRef.current) {
      const sceneRect = scene.getBoundingClientRect();
      const drawerRect = drawerElRef.current.getBoundingClientRect();
      centerX = drawerRect.left - sceneRect.left + drawerRect.width / 2;
      spawnY = drawerRect.top - sceneRect.top - 20 * cs;
    } else {
      spawnY = h - 200 * cs;
      centerX = w / 2;
    }

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
      appliedScaleRef.current.set(item.id, itemScale);
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
        const shrink = Math.min(1, dist / 250); // closer = smaller
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

        // Apply brightness/contrast/grayscale filter
        const br = config.itemBrightness ?? 1;
        const ct = config.itemContrast ?? 1;
        const bw = config.itemTint === 'bw';
        if (br !== 1 || ct !== 1 || bw) {
          ctx.filter = `brightness(${br}) contrast(${ct})${bw ? ' grayscale(1)' : ''}`;
        }

        ctx.beginPath();
        ctx.roundRect(-drawW / 2, -drawH / 2, drawW, drawH, 4);
        ctx.clip();
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

        // Apply tint overlay (skip for grayscale mode)
        if (config.itemTint && config.itemTint !== 'bw') {
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = config.itemTint + '40';
          ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH);
          ctx.globalCompositeOperation = 'source-over';
        }

        ctx.filter = 'none';
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

    });

    animFrameRef.current = requestAnimationFrame(renderLoop);
  }, [isLightBg, config.itemBrightness, config.itemContrast, config.itemTint]);

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
    soundEngine.playDrawerOpen();

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
    const drawerEl = drawerElRef.current;
    let drawerCenterX: number;
    let drawerY: number;
    if (drawerEl && scene) {
      const sceneRect = scene.getBoundingClientRect();
      const drawerRect = drawerEl.getBoundingClientRect();
      drawerCenterX = drawerRect.left - sceneRect.left + drawerRect.width / 2;
      drawerY = drawerRect.top - sceneRect.top + drawerRect.height / 2;
    } else {
      drawerCenterX = scene ? scene.offsetWidth / 2 : 200;
      drawerY = scene ? scene.offsetHeight - 150 : 300;
    }

    if (engine) {
      // Kill gravity so items float toward the drawer
      engine.gravity.y = 0;
      engine.gravity.x = 0;
    }

    // Arc animation: items fly up in a basketball-arc curve then descend into the drawer
    closingAnimRef.current = true;
    const startPositions = bodiesRef.current.map(b => ({ x: b.position.x, y: b.position.y }));
    const startTime = performance.now();
    const duration = 700; // slower, more graceful arc

    // Per-item Bezier control points for unique arcs
    const controlPoints = startPositions.map((start, i) => {
      const midX = (start.x + drawerCenterX) / 2;
      const highestY = Math.min(start.y, drawerY);
      // Deterministic per-item variety
      const seed = ((i * 7 + 3) % 11) / 11;
      const arcHeight = 150 + seed * 150; // 150-300px above
      const xJitter = (seed - 0.5) * 120; // -60..+60px horizontal offset
      return { x: midX + xJitter, y: highestY - arcHeight };
    });

    // Stagger: each item starts 40ms after the previous
    const staggerDelays = startPositions.map((_, i) => i * 40);
    const maxStagger = staggerDelays[staggerDelays.length - 1] || 0;

    const pullInterval = setInterval(() => {
      if (!closingAnimRef.current) { clearInterval(pullInterval); return; }
      const now = performance.now();

      bodiesRef.current.forEach((body, i) => {
        const start = startPositions[i];
        const cp = controlPoints[i];
        if (!start || !cp) return;

        const itemElapsed = now - startTime - staggerDelays[i];
        if (itemElapsed < 0) return; // not started yet

        const t = Math.min(1, itemElapsed / duration);
        // Ease-in-out: smooth acceleration and deceleration
        const eased = t < 0.5
          ? 2 * t * t
          : 1 - Math.pow(-2 * t + 2, 2) / 2;

        // Quadratic Bezier: B(t) = (1-t)^2*P0 + 2(1-t)*t*P1 + t^2*P2
        const oneMinusT = 1 - eased;
        const x = oneMinusT * oneMinusT * start.x
                + 2 * oneMinusT * eased * cp.x
                + eased * eased * drawerCenterX;
        const y = oneMinusT * oneMinusT * start.y
                + 2 * oneMinusT * eased * cp.y
                + eased * eased * drawerY;

        Matter.Body.setPosition(body, { x, y });
        Matter.Body.setVelocity(body, { x: 0, y: 0 });

        // Gentle tumbling spin during arc
        if (t < 0.9) {
          const spin = (i % 2 === 0 ? 1 : -1) * 0.02;
          Matter.Body.setAngularVelocity(body, spin);
        }
      });
    }, 16);

    // Transition: CLOSING → SLAMMING (when items are descending) → IDLE
    setBoxState('CLOSING');

    managedTimeout(() => {
      setBoxState('SLAMMING');
      soundEngine.playDrawerClose();

      // Clean up after all items have arrived
      managedTimeout(() => {
        closingAnimRef.current = false;
        clearInterval(pullInterval);
        clearPhysics();
        setBoxState('IDLE');
      }, maxStagger + 300);
    }, Math.round(duration * 0.6 + maxStagger));
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

  // Click on canvas — open pending link or close drawer
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (pendingLinkRef.current) {
      window.open(pendingLinkRef.current, '_blank', 'noopener,noreferrer');
      pendingLinkRef.current = null;
      return;
    }
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
      const size = ITEM_BASE_SIZE * (body.itemData?.scale ?? 1);
      return Math.abs(x - bx) < size / 2 && Math.abs(y - by) < size / 2;
    });
    if (!clickedBody) {
      closeDrawerRef.current();
    }
  }, [boxState]);

  // Detect hover over drawer area when canvas is on top (OPEN state)
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const drawerEl = drawerElRef.current;
    if (!drawerEl) return;
    const rect = drawerEl.getBoundingClientRect();
    const inside = (
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom
    );
    if (inside && boxState === 'OPEN') {
      setBoxState('HOVER_CLOSE');
    } else if (!inside && boxState === 'HOVER_CLOSE') {
      setBoxState('OPEN');
    }
  }, [boxState]);

  const handleCanvasMouseLeave = useCallback(() => {
    if (boxState === 'HOVER_CLOSE') {
      setBoxState('OPEN');
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

  // --- Drag-to-reposition handlers for overlay preview ---
  const handleDrawerPointerDown = useCallback((e: React.PointerEvent) => {
    if (!overlayPreviewRef.current?.onDrag) return;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    isDraggingDrawer.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleDrawerPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartPos.current || !overlayPreviewRef.current?.onDrag) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    if (!isDraggingDrawer.current && Math.abs(dx) + Math.abs(dy) > 5) {
      isDraggingDrawer.current = true;
      overlayPreviewRef.current.onDrag(e.nativeEvent, 'start');
    }
    if (isDraggingDrawer.current) {
      overlayPreviewRef.current.onDrag(e.nativeEvent, 'move');
    }
  }, []);

  const handleDrawerPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragStartPos.current) return;
    const wasDragging = isDraggingDrawer.current;
    dragStartPos.current = null;
    isDraggingDrawer.current = false;
    if (wasDragging && overlayPreviewRef.current?.onDrag) {
      overlayPreviewRef.current.onDrag(e.nativeEvent, 'end');
    } else {
      // Not a drag — treat as normal click
      handleDrawerClick();
    }
  }, [handleDrawerClick]);

  return (
    <div
      ref={sceneRef}
      className={`relative w-full h-full select-none ${(overlayPreview || embedded) ? '' : 'min-h-[400px]'} overflow-hidden`}
      style={{ background: isTransparent ? 'transparent' : bg }}
    >
      {/* Drawer area — below canvas when open so items render on top */}
      <div
        ref={drawerElRef}
        className={overlayPreview ? 'absolute cursor-pointer touch-none' : 'absolute bottom-6 left-1/2 -translate-x-1/2 cursor-pointer'}
        style={{
          ...(overlayPreview?.drawerStyle || {}),
          zIndex: isOpen ? 10 : 20,
          cursor: overlayPreview?.onDrag ? (isDraggingDrawer.current ? 'grabbing' : 'grab') : 'pointer',
        }}
        onMouseEnter={overlayPreview?.onDrag ? undefined : handleDrawerMouseEnter}
        onMouseLeave={overlayPreview?.onDrag ? undefined : handleDrawerMouseLeave}
        onClick={overlayPreview?.onDrag ? undefined : handleDrawerClick}
        onPointerDown={overlayPreview?.onDrag ? handleDrawerPointerDown : undefined}
        onPointerMove={overlayPreview?.onDrag ? handleDrawerPointerMove : undefined}
        onPointerUp={overlayPreview?.onDrag ? handleDrawerPointerUp : undefined}
      >
        <div style={{ transform: `scale(${contentScale})`, transformOrigin: 'bottom center' }}>
          {hasGeneratedImages ? (
            // === AI-Generated Image Drawer ===
            <DrawerImage
              images={config.drawerImages!}
              currentState={boxState}
              isLight={isLightBg}
              displaySize={config.drawerDisplaySize}
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
      </div>

      {/* Physics canvas — above drawer when open so items are visible */}
      <canvas
        ref={canvasRef}
        onClick={physicsActive ? handleCanvasClick : undefined}
        onMouseMove={physicsActive ? handleCanvasMouseMove : undefined}
        onMouseLeave={physicsActive ? handleCanvasMouseLeave : undefined}
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
  CLOSING: 2,      // Frame 2: 50% open, briefly visible during close
  SLAMMING: 0,     // Frame 0: closed
};

function DrawerImage({
  images,
  currentState,
  isLight,
  displaySize,
}: {
  images: DrawerImages;
  currentState: BoxState;
  isLight: boolean;
  displaySize?: { width: number; height: number };
}) {
  const dropShadow = isLight ? 'none' : 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))';
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);

  const maxW = displaySize?.width || DEFAULT_DRAWER_DISPLAY_SIZE.width;
  const maxH = displaySize?.height || DEFAULT_DRAWER_DISPLAY_SIZE.height;

  // Contain-fit: preserve natural frame aspect ratio within the bounding box.
  // Before the image loads, fall back to the bounding box ratio (no layout shift for square defaults).
  const ratio = naturalRatio ?? (maxW / maxH);
  let actualW: number;
  let actualH: number;
  if (maxW / maxH > ratio) {
    // Height-limited
    actualH = maxH;
    actualW = Math.round(maxH * ratio);
  } else {
    // Width-limited
    actualW = maxW;
    actualH = Math.round(maxW / ratio);
  }

  return (
    <div className="relative" style={{ width: actualW, height: actualH, maxWidth: '95%', imageRendering: 'auto' }}>
      {images.spriteUrl ? (
        // CSS sprite technique: oversized img inside clipping container, translateX to select frame
        <div
          style={{
            width: actualW,
            height: actualH,
            overflow: 'hidden',
            filter: dropShadow,
          }}
        >
          <img
            src={images.spriteUrl}
            alt="drawer"
            className="pointer-events-none"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setNaturalRatio((img.naturalWidth / 5) / img.naturalHeight);
              }
            }}
            style={{
              width: actualW * 5,
              height: actualH,
              maxWidth: 'none',
              transform: `translateX(-${STATE_TO_FRAME[currentState] * actualW}px)`,
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
