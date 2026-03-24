'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Matter from 'matter-js';
import { soundEngine } from '@/lib/sounds';
import { contourToVertices, extractFrameFromSprite, extractDrawerWallPath } from '@/lib/contour';
import { computeCenteredDrawerPosition, computeCenteredSpawnOrigin } from '@/lib/embedPosition';
import type { TreasureItem, BoxConfig, BoxState, DrawerImages, BoxDimensions, FrameSyncBody, HostViewport, DomColliderRect } from '@/lib/types';
import { DEFAULT_DRAWER_DISPLAY_SIZE, DEFAULT_BOX_DIMENSIONS } from '@/lib/config';
import { normalizeDimensions } from '@/lib/boxStyles';
import StoryCard from './StoryCard';

const ITEM_BASE_SIZE = 52;
const SPAWN_ANIM_DURATION = 300;

type PhysicsBody = Matter.Body & { itemData?: TreasureItem; spawnTime?: number; closeT?: number; returnT?: number; returningToDrawer?: boolean };

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
  onItemsEscaped?: (items: { id: string; imageUrl: string; label: string }[]) => void;
  onItemsReturned?: () => void;
  /** When set, TreasureBox uses full-scene edge walls and positions drawer at anchor */
  overlayPreview?: OverlayPreviewConfig;
  /** When true, skips min-h constraint for iframe/contained embeds */
  embedded?: boolean;
  /** Called each render frame with body positions for postMessage streaming */
  onFrameSync?: (bodies: FrameSyncBody[], effects: Record<string, unknown>) => void;
  /** Host viewport dimensions for wall placement when embedded in an iframe */
  hostViewport?: HostViewport;
  /** Called once when the component is ready to display (images loaded or ASCII fallback) */
  onReady?: () => void;
  /** DOM elements to create static physics collider bodies from (e.g. title text) */
  textColliders?: Array<{ ref: React.RefObject<HTMLElement | null>; label: string }>;
  /** Rects from host page DOM elements (via postMessage) for cross-document collision */
  domColliderRects?: DomColliderRect[];
}

const ALL_BOX_STATES: BoxState[] = ['IDLE', 'HOVER_PEEK', 'OPEN', 'HOVER_CLOSE', 'CLOSING', 'SLAMMING'];

export default function TreasureBox({ items, config, backgroundColor, onItemsEscaped, onItemsReturned, overlayPreview, embedded, onFrameSync, hostViewport, onReady, textColliders, domColliderRects }: Props) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const bodiesRef = useRef<PhysicsBody[]>([]);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const blobUrlsRef = useRef<string[]>([]);
  const appliedScaleRef = useRef<Map<string, number>>(new Map());
  const boxScaleRef = useRef(config.boxScale ?? 1);

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
  const hostInitiatedRef = useRef(false);
  const hostMouseUpPendingRef = useRef(false);
  const handleDrawerClickRef = useRef<() => void>(() => {});
  const handleDrawerMouseEnterRef = useRef<() => void>(() => {});
  const handleDrawerMouseLeaveRef = useRef<() => void>(() => {});
  const pendingLinkRef = useRef<string | null>(null);
  const lastClickTimeRef = useRef(0);
  const lastClickBodyRef = useRef<string | null>(null);
  const spawnIndexRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const spawnIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const itemsHandedOffRef = useRef(false);
  const closingAnimRef = useRef(false);
  const onReadyFiredRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const drawerElRef = useRef<HTMLDivElement>(null);

  // Drag-to-return: gulp animation + per-item return intervals
  const [gulpState, setGulpState] = useState<BoxState | null>(null);
  const gulpTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const returnAnimIntervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);

  // Text collider bodies (e.g. title text as physics obstacles)
  const textBodiesRef = useRef<Matter.Body[]>([]);
  const textCollidersRef = useRef(textColliders);
  useEffect(() => { textCollidersRef.current = textColliders; }, [textColliders]);

  // DOM collider bodies from host page (cross-document via postMessage)
  const domBodiesRef = useRef<Matter.Body[]>([]);
  const domColliderRectsRef = useRef(domColliderRects);
  domColliderRectsRef.current = domColliderRects;

  // Wall body references for dynamic repositioning
  const wallsRef = useRef<{
    floor?: Matter.Body;
    ceiling?: Matter.Body;
    left?: Matter.Body;
    right?: Matter.Body;
    drawerBody?: Matter.Body;
    drawerBodies?: Matter.Body[];
  }>({});
  const repositionRafRef = useRef<number>(0);
  const drawerWallPathRef = useRef<{ x: number; y: number }[] | null>(null);

  // Host mouse forwarding handler ref (for cleanup)
  const hostMouseHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);

  // Drag-to-reposition state (overlay preview only)
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDraggingDrawer = useRef(false);

  // Auto-synthesize centered overlay when none is provided
  const [autoOverlay, setAutoOverlay] = useState<OverlayPreviewConfig | null>(null);
  useEffect(() => {
    if (overlayPreview) { setAutoOverlay(null); return; }
    const scene = sceneRef.current;
    if (!scene) return;
    const update = () => {
      const w = scene.offsetWidth;
      const h = scene.offsetHeight;
      if (w === 0 || h === 0) return;
      setAutoOverlay({
        drawerStyle: computeCenteredDrawerPosition(w, h),
        spawnOrigin: computeCenteredSpawnOrigin(),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(scene);
    return () => ro.disconnect();
  }, [overlayPreview]);

  const effectiveOverlay = overlayPreview ?? autoOverlay;

  // Keep overlayPreview ref fresh for use inside callbacks
  const overlayPreviewRef = useRef(effectiveOverlay);
  useEffect(() => { overlayPreviewRef.current = effectiveOverlay; }, [effectiveOverlay]);

  // Keep onFrameSync and hostViewport refs fresh
  const onFrameSyncRef = useRef(onFrameSync);
  useEffect(() => { onFrameSyncRef.current = onFrameSync; }, [onFrameSync]);
  const hostViewportRef = useRef(hostViewport);
  useEffect(() => { hostViewportRef.current = hostViewport; }, [hostViewport]);

  // Sync DOM collider rects from host page into Matter.js static bodies
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !domColliderRects || domColliderRects.length === 0) {
      // Remove old bodies if rects cleared
      if (engine && domBodiesRef.current.length > 0) {
        Matter.Composite.remove(engine.world, domBodiesRef.current);
        domBodiesRef.current = [];
      }
      return;
    }
    const hv = hostViewportRef.current;
    const hvOx = hv ? hv.offsetX : 0;
    const hvOy = hv ? hv.offsetY : 0;

    // Remove old bodies
    if (domBodiesRef.current.length > 0) {
      Matter.Composite.remove(engine.world, domBodiesRef.current);
    }

    // Create new static bodies
    const newBodies = domColliderRects.map(rect =>
      Matter.Bodies.rectangle(
        rect.x - hvOx, rect.y - hvOy, rect.width, rect.height,
        { isStatic: true, friction: 0.6, restitution: 0.3, label: 'dom-collider-' + rect.id }
      )
    );
    Matter.Composite.add(engine.world, newBodies);
    domBodiesRef.current = newBodies;
  }, [domColliderRects]);

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
    // Also clear gulp animation timeouts
    gulpTimeoutsRef.current.forEach(id => clearTimeout(id));
    gulpTimeoutsRef.current = [];
  }, []);

  // Keep boxScale ref in sync for use inside initPhysics closure
  useEffect(() => { boxScaleRef.current = config.boxScale ?? 1; }, [config.boxScale]);

  // Reposition walls and drawer body when position/scale changes (smooth — items keep momentum).
  // Works for both overlay (4 viewport walls + drawer body) and normal (3-wall box) modes.
  const repositionBoundaries = useCallback(() => {
    const engine = engineRef.current;
    const walls = wallsRef.current;
    const scene = sceneRef.current;
    if (!engine || !scene) return;

    const cs = boxScaleRef.current;
    const wallOpts = { isStatic: true, friction: 0.9, restitution: 0.15 };

    if (overlayPreviewRef.current || hostViewportRef.current) {
      // Overlay mode: reposition 4 viewport walls + drawer body
      const hv = hostViewportRef.current;
      const wallW = hv ? hv.width : scene.offsetWidth;
      const wallH = hv ? hv.height : scene.offsetHeight;
      const hvOx = hv ? hv.offsetX : 0;
      const hvOy = hv ? hv.offsetY : 0;

      if (walls.floor) Matter.Body.setPosition(walls.floor, { x: wallW / 2 - hvOx, y: wallH - hvOy + 7 });
      if (walls.ceiling) Matter.Body.setPosition(walls.ceiling, { x: wallW / 2 - hvOx, y: -hvOy - 7 });
      if (walls.left) Matter.Body.setPosition(walls.left, { x: -hvOx - 7, y: wallH / 2 - hvOy });
      if (walls.right) Matter.Body.setPosition(walls.right, { x: wallW - hvOx + 7, y: wallH / 2 - hvOy });

      // Reposition drawer collision body (contour-based wall segments if available).
      // drawerElRef has explicit scaled dimensions, so getBoundingClientRect = visual size.
      if (drawerElRef.current) {
        const sceneRect = scene.getBoundingClientRect();
        const drawerRect = drawerElRef.current.getBoundingClientRect();
        const scaledW = drawerRect.width;
        const scaledH = drawerRect.height;
        const centerX = drawerRect.left - sceneRect.left + scaledW / 2;
        const centerY = drawerRect.top - sceneRect.top + scaledH / 2;
        // Remove old drawer bodies
        if (walls.drawerBody) Matter.Composite.remove(engine.world, walls.drawerBody);
        if (walls.drawerBodies) walls.drawerBodies.forEach(b => Matter.Composite.remove(engine.world, b));
        walls.drawerBody = undefined;
        walls.drawerBodies = undefined;

        const wallPath = drawerWallPathRef.current;
        if (wallPath && wallPath.length >= 4) {
          const bodies: Matter.Body[] = [];
          const thickness = 12;
          for (let i = 0; i < wallPath.length - 1; i++) {
            const p1 = wallPath[i];
            const p2 = wallPath[i + 1];
            const x1 = centerX - scaledW / 2 + p1.x * scaledW;
            const y1 = centerY - scaledH / 2 + p1.y * scaledH;
            const x2 = centerX - scaledW / 2 + p2.x * scaledW;
            const y2 = centerY - scaledH / 2 + p2.y * scaledH;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const segLen = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
            if (segLen < 1) continue;
            const angle = Math.atan2(y2 - y1, x2 - x1);
            bodies.push(Matter.Bodies.rectangle(midX, midY, segLen + thickness * 0.25, thickness, {
              isStatic: true, friction: 0.3, restitution: 0.6, slop: 0.1, label: 'drawer', angle,
            }));
          }
          if (bodies.length > 0) {
            Matter.Composite.add(engine.world, bodies);
            walls.drawerBodies = bodies;
          }
        } else {
          const bodyH = scaledH * 0.75;
          const bodyY = centerY + scaledH * 0.125;
          const newDrawerBody = Matter.Bodies.rectangle(centerX, bodyY, scaledW, bodyH, {
            isStatic: true, friction: 0.3, restitution: 0.6, slop: 0.1, label: 'drawer',
          });
          Matter.Composite.add(engine.world, newDrawerBody);
          walls.drawerBody = newDrawerBody;
        }
      }
    } else if (drawerElRef.current) {
      // Normal mode: reposition walls + drawer collision body.
      // drawerElRef has explicit scaled dimensions → rect = visual size.
      const sceneRect = scene.getBoundingClientRect();
      const drawerRect = drawerElRef.current.getBoundingClientRect();
      const scaledW = drawerRect.width;
      const scaledH = drawerRect.height;
      const centerX = drawerRect.left - sceneRect.left + scaledW / 2;
      const centerY = drawerRect.top - sceneRect.top + scaledH / 2;
      const floorY = centerY - scaledH * 0.25;
      const boxW = Math.max(scaledW, 200 * cs);

      // Remove old walls, create new ones at updated positions/sizes
      if (walls.floor) Matter.Composite.remove(engine.world, walls.floor);
      if (walls.left) Matter.Composite.remove(engine.world, walls.left);
      if (walls.right) Matter.Composite.remove(engine.world, walls.right);

      walls.floor = Matter.Bodies.rectangle(centerX, floorY, boxW, 14, wallOpts);
      walls.left = Matter.Bodies.rectangle(centerX - boxW / 2 - 7, floorY - 300, 14, 700 * cs, wallOpts);
      walls.right = Matter.Bodies.rectangle(centerX + boxW / 2 + 7, floorY - 300, 14, 700 * cs, wallOpts);
      Matter.Composite.add(engine.world, [walls.floor, walls.left, walls.right]);

      // Update drawer collision body to match current drawer size
      if (walls.drawerBody) Matter.Composite.remove(engine.world, walls.drawerBody);
      if (walls.drawerBodies) walls.drawerBodies.forEach(b => Matter.Composite.remove(engine.world, b));
      walls.drawerBody = undefined;
      walls.drawerBodies = undefined;

      const wallPath = drawerWallPathRef.current;
      if (wallPath && wallPath.length >= 4) {
        const bodies: Matter.Body[] = [];
        const thickness = 12;
        for (let i = 0; i < wallPath.length - 1; i++) {
          const p1 = wallPath[i];
          const p2 = wallPath[i + 1];
          const x1 = centerX - scaledW / 2 + p1.x * scaledW;
          const y1 = centerY - scaledH / 2 + p1.y * scaledH;
          const x2 = centerX - scaledW / 2 + p2.x * scaledW;
          const y2 = centerY - scaledH / 2 + p2.y * scaledH;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const segLen = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
          if (segLen < 1) continue;
          const angle = Math.atan2(y2 - y1, x2 - x1);
          bodies.push(Matter.Bodies.rectangle(midX, midY, segLen + thickness * 0.5, thickness, {
            isStatic: true, friction: 0.9, restitution: 0.3, label: 'drawer', angle,
          }));
        }
        if (bodies.length > 0) {
          Matter.Composite.add(engine.world, bodies);
          walls.drawerBodies = bodies;
        }
      } else {
        const bodyH = scaledH * 0.75;
        const bodyY = centerY + scaledH * 0.125;
        const newDrawerBody = Matter.Bodies.rectangle(centerX, bodyY, scaledW, bodyH, {
          isStatic: true, friction: 0.9, restitution: 0.3, label: 'drawer',
        });
        Matter.Composite.add(engine.world, newDrawerBody);
        walls.drawerBody = newDrawerBody;
      }
    }

    // Reposition text collider bodies on resize
    if (textBodiesRef.current.length > 0 && textCollidersRef.current && scene) {
      const sceneRect = scene.getBoundingClientRect();
      textCollidersRef.current.forEach(({ ref }, i) => {
        const el = ref.current;
        const body = textBodiesRef.current[i];
        if (!el || !body) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left - sceneRect.left + rect.width / 2;
        const cy = rect.top - sceneRect.top + rect.height / 2;
        Matter.Body.setPosition(body, { x: cx, y: cy });
        // Update size by scaling vertices
        const scaleX = rect.width / (body.bounds.max.x - body.bounds.min.x);
        const scaleY = rect.height / (body.bounds.max.y - body.bounds.min.y);
        if (Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01) {
          Matter.Body.scale(body, scaleX, scaleY);
        }
      });
    }
  }, []);

  // Throttled boundary reposition — max once per animation frame
  const scheduleRepositionBoundaries = useCallback(() => {
    if (repositionRafRef.current) return;
    repositionRafRef.current = requestAnimationFrame(() => {
      repositionRafRef.current = 0;
      repositionBoundaries();
    });
  }, [repositionBoundaries]);

  // Watch effective overlay style changes and trigger repositioning
  const prevDrawerStyleKey = useRef('');
  useEffect(() => {
    if (!effectiveOverlay?.drawerStyle) return;
    const key = JSON.stringify(effectiveOverlay.drawerStyle);
    if (key === prevDrawerStyleKey.current) return;
    prevDrawerStyleKey.current = key;
    scheduleRepositionBoundaries();
  }, [effectiveOverlay?.drawerStyle, scheduleRepositionBoundaries]);

  // Watch hostViewport changes and trigger repositioning
  useEffect(() => {
    if (!hostViewport) return;
    scheduleRepositionBoundaries();
  }, [hostViewport, scheduleRepositionBoundaries]);

  // Watch boxScale changes and trigger repositioning (all modes)
  useEffect(() => {
    scheduleRepositionBoundaries();
  }, [config.boxScale, scheduleRepositionBoundaries]);

  const boxScale = config.boxScale ?? 1;
  // Compute the drawer's visual (scaled) dimensions — used for explicit sizing
  // so that layout matches visual and getBoundingClientRect returns correct values.
  const drawerBaseW = config.drawerDisplaySize?.width || DEFAULT_DRAWER_DISPLAY_SIZE.width;
  const drawerBaseH = config.drawerDisplaySize?.height || DEFAULT_DRAWER_DISPLAY_SIZE.height;
  const scaledDrawerW = Math.round(drawerBaseW * boxScale);
  const scaledDrawerH = Math.round(drawerBaseH * boxScale);
  const hasGeneratedImages = !!(config.drawerImages && (config.drawerImages.spriteUrl || config.drawerImages.urls?.IDLE));
  const bg = backgroundColor || config.backgroundColor || '#0e0e0e';
  const isTransparent = bg === 'transparent' || bg === 'rgba(0,0,0,0)';
  const isLightBg = isTransparent ? false : isLightColor(bg);

  // Track which URL each key was loaded with, so we detect URL changes (e.g. sprite regeneration)
  const imageUrlsRef = useRef<Map<string, string>>(new Map());

  // Preload image via fetch → blob URL to avoid CORS canvas tainting
  const loadImageAsBlobUrl = useCallback((key: string, url: string, onLoad?: () => void) => {
    const existingUrl = imageUrlsRef.current.get(key);
    if (existingUrl === url) {
      // Same URL — if already loaded, fire callback immediately
      const existing = imagesRef.current.get(key);
      if (existing && existing.complete && existing.naturalWidth > 0 && onLoad) onLoad();
      return;
    }
    // Different URL or first load — revoke previous blob URL if replacing
    const prevUrl = imageUrlsRef.current.get(key);
    if (prevUrl) {
      const prevBlobIdx = blobUrlsRef.current.findIndex(b => {
        const prevImg = imagesRef.current.get(key);
        return prevImg && prevImg.src === b;
      });
      if (prevBlobIdx !== -1) {
        URL.revokeObjectURL(blobUrlsRef.current[prevBlobIdx]);
        blobUrlsRef.current.splice(prevBlobIdx, 1);
      }
    }
    imageUrlsRef.current.set(key, url);
    const img = new Image();
    if (onLoad) img.onload = onLoad;
    img.onerror = () => {
      console.warn(`[TreasureBox] Failed to load image: ${key}`);
      if (onLoad) onLoad();
    };
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

  // Preload drawer images (sprite sheet or legacy per-state) and extract contour
  useEffect(() => {
    if (!config.drawerImages) {
      // ASCII fallback — ready immediately
      if (!onReadyFiredRef.current) {
        onReadyFiredRef.current = true;
        onReadyRef.current?.();
      }
      return;
    }
    onReadyFiredRef.current = false;
    if (config.drawerImages.spriteUrl) {
      loadImageAsBlobUrl('drawer_sprite', config.drawerImages.spriteUrl, () => {
        // Extract wall path from OPEN frame (frame 4) once sprite loads
        const spriteImg = imagesRef.current.get('drawer_sprite');
        if (spriteImg && spriteImg.naturalWidth > 0) {
          const frameData = extractFrameFromSprite(spriteImg, 4, 5);
          if (frameData) {
            drawerWallPathRef.current = extractDrawerWallPath(frameData);
          }
        }
        if (!onReadyFiredRef.current) {
          onReadyFiredRef.current = true;
          onReadyRef.current?.();
        }
      });
    } else if (config.drawerImages.urls) {
      const urls = config.drawerImages.urls;
      ALL_BOX_STATES.forEach(state => {
        const url = urls[state];
        if (url) loadImageAsBlobUrl(`drawer_${state}`, url, state === 'IDLE' ? () => {
          if (!onReadyFiredRef.current) {
            onReadyFiredRef.current = true;
            onReadyRef.current?.();
          }
        } : undefined);
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
    const scene = sceneRef.current;
    let ro: ResizeObserver | undefined;
    if (scene) {
      ro = new ResizeObserver(() => {
        resizeCanvas();
        scheduleRepositionBoundaries();
      });
      ro.observe(scene);
    }
    window.addEventListener('resize', resizeCanvas);
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      ro?.disconnect();
    };
  }, [resizeCanvas, scheduleRepositionBoundaries]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
      if (engineRef.current) Matter.Engine.clear(engineRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (repositionRafRef.current) cancelAnimationFrame(repositionRafRef.current);
      if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
      returnAnimIntervalsRef.current.forEach(id => clearInterval(id));
      returnAnimIntervalsRef.current = [];
      gulpTimeoutsRef.current.forEach(tid => clearTimeout(tid));
      gulpTimeoutsRef.current = [];
      timeoutsRef.current.forEach(id => clearTimeout(id));
      timeoutsRef.current.clear();
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
      if (hostMouseHandlerRef.current) {
        window.removeEventListener('message', hostMouseHandlerRef.current);
        hostMouseHandlerRef.current = null;
      }
    };
  }, []);

  const clearPhysics = useCallback(() => {
    console.log('[TB] clearPhysics called', new Error().stack?.split('\n').slice(1, 4).join(' | '));
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
    if (engineRef.current) {
      Matter.Engine.clear(engineRef.current);
      engineRef.current = null;
    }
    runnerRef.current = null;
    bodiesRef.current = [];
    domBodiesRef.current = [];
    appliedScaleRef.current.clear();
    // Clear any in-progress return animations
    returnAnimIntervalsRef.current.forEach(id => clearInterval(id));
    returnAnimIntervalsRef.current = [];
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
    engine.positionIterations = 10;  // better at resolving overlaps
    engine.velocityIterations = 8;   // smoother collision response
    engineRef.current = engine;

    const w = scene.offsetWidth;
    const h = scene.offsetHeight;
    const cs = boxScaleRef.current;
    const wallOpts = { isStatic: true, friction: 0.9, restitution: 0.15 };

    // Determine wall bounds — use hostViewport if provided (embed overlay), else scene dimensions.
    // In overlay mode, offset wall positions so that after frame-sync adds (offsetX, offsetY),
    // walls map exactly to the host viewport edges.
    const hv = hostViewportRef.current;
    const wallW = hv ? hv.width : w;
    const wallH = hv ? hv.height : h;
    const hvOx = hv ? hv.offsetX : 0;
    const hvOy = hv ? hv.offsetY : 0;

    // Unified: full-scene walls — items bounce off all 4 edges in every mode
    const floor = Matter.Bodies.rectangle(wallW / 2 - hvOx, wallH - hvOy + 7, wallW + 14, 14, wallOpts);
    const ceiling = Matter.Bodies.rectangle(wallW / 2 - hvOx, -hvOy - 7, wallW + 14, 14, wallOpts);
    const left = Matter.Bodies.rectangle(-hvOx - 7, wallH / 2 - hvOy, 14, wallH + 14, wallOpts);
    const right = Matter.Bodies.rectangle(wallW - hvOx + 7, wallH / 2 - hvOy, 14, wallH + 14, wallOpts);
    Matter.Composite.add(engine.world, [floor, ceiling, left, right]);
    wallsRef.current = { floor, ceiling, left, right };

    // Drawer collision body — uses contour-based wall segments if available, else rectangle fallback.
    // drawerElRef has explicit scaled dimensions, so getBoundingClientRect = visual size.
    if (drawerElRef.current && sceneRef.current) {
      const sceneRect = sceneRef.current.getBoundingClientRect();
      const drawerRect = drawerElRef.current.getBoundingClientRect();
      const scaledW = drawerRect.width;
      const scaledH = drawerRect.height;
      const centerX = drawerRect.left - sceneRect.left + scaledW / 2;
      const centerY = drawerRect.top - sceneRect.top + scaledH / 2;
      const wallPath = drawerWallPathRef.current;

      if (wallPath && wallPath.length >= 4) {
        // Create chain of thin rectangles tracing the drawer contour (U-shape)
        const bodies: Matter.Body[] = [];
        const thickness = 12;
        for (let i = 0; i < wallPath.length - 1; i++) {
          const p1 = wallPath[i];
          const p2 = wallPath[i + 1];
          // Convert normalized 0-1 to absolute pixel coords relative to the drawer
          const x1 = centerX - scaledW / 2 + p1.x * scaledW;
          const y1 = centerY - scaledH / 2 + p1.y * scaledH;
          const x2 = centerX - scaledW / 2 + p2.x * scaledW;
          const y2 = centerY - scaledH / 2 + p2.y * scaledH;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const segLen = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
          if (segLen < 1) continue;
          const angle = Math.atan2(y2 - y1, x2 - x1);
          // Slightly extend each segment to prevent gaps
          bodies.push(Matter.Bodies.rectangle(midX, midY, segLen + thickness * 0.25, thickness, {
            isStatic: true, friction: 0.3, restitution: 0.6, slop: 0.1, label: 'drawer', angle,
          }));
        }
        if (bodies.length > 0) {
          Matter.Composite.add(engine.world, bodies);
          wallsRef.current.drawerBodies = bodies;
        }
      } else {
        // Fallback: rectangle covering bottom 3/4
        const bodyH = scaledH * 0.75;
        const rectY = centerY + scaledH * 0.125;
        const drawerBody = Matter.Bodies.rectangle(centerX, rectY, scaledW, bodyH, {
          isStatic: true, friction: 0.3, restitution: 0.6, slop: 0.1, label: 'drawer',
        });
        Matter.Composite.add(engine.world, drawerBody);
        wallsRef.current.drawerBody = drawerBody;
      }
    }

    // Create static physics bodies for text colliders (e.g. hero title)
    if (textCollidersRef.current && sceneRef.current) {
      const sceneRect = sceneRef.current.getBoundingClientRect();
      const newBodies: Matter.Body[] = [];
      textCollidersRef.current.forEach(({ ref, label }) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left - sceneRect.left + rect.width / 2;
        const cy = rect.top - sceneRect.top + rect.height / 2;
        const body = Matter.Bodies.rectangle(cx, cy, rect.width, rect.height, {
          isStatic: true, friction: 0.5, restitution: 0.4, label,
        });
        newBodies.push(body);
      });
      if (newBodies.length > 0) {
        Matter.Composite.add(engine.world, newBodies);
        textBodiesRef.current = newBodies;
      }
    }

    const mouse = Matter.Mouse.create(canvas);
    // Allow page scrolling through the canvas — Matter.js captures wheel events by default.
    // Remove all wheel-related listeners Matter.js may have added, then add a passive
    // no-op listener to guarantee the browser never blocks native scroll.
    const wheelHandler = (mouse as any).mousewheel;
    if (wheelHandler) {
      canvas.removeEventListener('mousewheel', wheelHandler);
      canvas.removeEventListener('DOMMouseScroll', wheelHandler);
      canvas.removeEventListener('wheel', wheelHandler);
    }
    // Overwrite the handler so Matter.js can't re-add it
    (mouse as any).mousewheel = null;
    // Passive no-op ensures browser always allows native scroll through canvas
    canvas.addEventListener('wheel', () => {}, { passive: true });
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
        if (hostInitiatedRef.current) {
          // Host canvas handles interaction — only grab physics, skip timers
          hostInitiatedRef.current = false;
        } else {
          // Native iframe interaction — full behavior
          if (window.parent !== window) {
            window.parent.postMessage({ type: 'treasure-box', action: 'item-drag-start' }, '*');
          }
          longPressRef.current = setTimeout(() => {
            longPressFiredRef.current = true;
            setActiveStory(body.itemData);
          }, 800);
        }
      }
    });
    Matter.Events.on(mouseConstraint, 'mouseup', () => {
      // Notify parent that item drag ended
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'treasure-box', action: 'item-drag-end' }, '*');
      }
      if (longPressRef.current) {
        clearTimeout(longPressRef.current);
        longPressRef.current = null;
      }
      const body = mouseDownBodyRef.current;
      if (body?.itemData && !didDragRef.current && !longPressFiredRef.current) {
        const link = body.itemData.link;
        if (link) {
          const now = Date.now();
          const bodyId = String(body.id);
          if (lastClickBodyRef.current === bodyId && now - lastClickTimeRef.current < 400) {
            pendingLinkRef.current = link;
            lastClickTimeRef.current = 0;
            lastClickBodyRef.current = null;
          } else {
            lastClickTimeRef.current = now;
            lastClickBodyRef.current = bodyId;
          }
        }
      }
      // Tap-to-close: if no body was tapped/dragged, check if tap is near drawer → close
      // This handles mobile where Matter.js preventDefault() blocks synthetic click events
      const isHostMouseUp = hostMouseUpPendingRef.current;
      hostMouseUpPendingRef.current = false;
      console.log('[TB] mouseConstraint mouseup', { hasBody: !!body?.itemData, didDrag: didDragRef.current, longPress: longPressFiredRef.current, isHostMouseUp });
      // In overlay mode, skip tap-to-close for host-forwarded mouseups — the host handles
      // drawer clicks separately via the 'drawer-click' message. Without this guard, a host
      // item drag ending near the drawer triggers tap-to-close (because the iframe's
      // MouseConstraint never grabbed the body, so hasBody=false and didDrag=false).
      if (!body?.itemData && !didDragRef.current && !isHostMouseUp) {
        const drawerEl = drawerElRef.current;
        const sceneEl = sceneRef.current;
        if (drawerEl && sceneEl) {
          const sceneRect = sceneEl.getBoundingClientRect();
          const drawerRect = drawerEl.getBoundingClientRect();
          const mx = mouse.position.x;
          const my = mouse.position.y;
          // drawerRect is already the visual (scaled) size — no inset needed
          const margin = 5;
          const insideDrawer = (
            mx >= (drawerRect.left - sceneRect.left - margin) &&
            mx <= (drawerRect.right - sceneRect.left + margin) &&
            my >= (drawerRect.top - sceneRect.top - margin) &&
            my <= (drawerRect.bottom - sceneRect.top + margin)
          );
          if (insideDrawer) {
            closeDrawerRef.current();
          }
        }
      }
      // Drag-to-return: if item was dragged near the drawer, return it
      if (body?.itemData && didDragRef.current && !longPressFiredRef.current && !closingAnimRef.current) {
        const drawerEl = drawerElRef.current;
        const sceneEl = sceneRef.current;
        if (drawerEl && sceneEl) {
          const sceneRect = sceneEl.getBoundingClientRect();
          const dRect = drawerEl.getBoundingClientRect();
          // drawerRect is already the visual (scaled) size
          const dLeft = dRect.left - sceneRect.left;
          const dRight = dRect.right - sceneRect.left;
          const dTop = dRect.top - sceneRect.top;
          const dBottom = dRect.bottom - sceneRect.top;
          const bx = body.position.x;
          const by = body.position.y;
          if (bx >= dLeft && bx <= dRight && by >= dTop && by <= dBottom) {
            returnItemToDrawerRef.current(body);
          }
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

    // In overlay embed: receive forwarded mouse events from host page when drag extends outside iframe
    const handleHostMouseForward = (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'treasure-box-host') return;
      if (event.data.action === 'mouse-down') {
        hostInitiatedRef.current = true;
        mouse.position.x = event.data.x;
        mouse.position.y = event.data.y;
        mouse.absolute.x = event.data.x;
        mouse.absolute.y = event.data.y;
        mouse.button = 0;
      }
      if (event.data.action === 'mouse-move') {
        mouse.position.x = event.data.x;
        mouse.position.y = event.data.y;
        mouse.absolute.x = event.data.x;
        mouse.absolute.y = event.data.y;
      }
      if (event.data.action === 'mouse-up') {
        mouse.button = -1;
        hostMouseUpPendingRef.current = true;
        const cvs = canvasRef.current;
        if (cvs) {
          cvs.dispatchEvent(new MouseEvent('mouseup', {
            clientX: event.data.x,
            clientY: event.data.y,
          }));
        }
      }
      if (event.data.action === 'dismiss-story') {
        setActiveStory(null);
      }
      // Host canvas: drag-to-return item
      if (event.data.action === 'return-item' && event.data.itemId) {
        // Release mouse constraint first
        mouse.button = -1;
        // Find the body and trigger return animation
        const targetBody = bodiesRef.current.find(b => b.itemData?.id === event.data.itemId);
        if (targetBody) {
          returnItemToDrawerRef.current(targetBody);
        }
      }
      // Host canvas drawer interaction forwarding (overlay embed)
      if (event.data.action === 'drawer-click') {
        console.log('[TB] host drawer-click received');
        handleDrawerClickRef.current();
      }
      if (event.data.action === 'drawer-hover-enter') {
        handleDrawerMouseEnterRef.current();
      }
      if (event.data.action === 'drawer-hover-leave') {
        handleDrawerMouseLeaveRef.current();
      }
    };
    if (window.parent !== window) {
      // Remove previous handler if re-initializing
      if (hostMouseHandlerRef.current) {
        window.removeEventListener('message', hostMouseHandlerRef.current);
      }
      hostMouseHandlerRef.current = handleHostMouseForward;
      window.addEventListener('message', handleHostMouseForward);
    }

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

    // Stuck-detection safety net: nudge items embedded in drawer walls
    const stuckFrames = new Map<number, number>();
    Matter.Events.on(engine, 'beforeUpdate', () => {
      if (closingAnimRef.current) return;
      bodiesRef.current.forEach(body => {
        if (body.isStatic || body.returningToDrawer) return;
        const age = performance.now() - (body.spawnTime ?? 0);
        if (age < 2000) return;
        const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
        const key = body.id;
        if (speed < 0.3) {
          const allDrawer = [
            ...(wallsRef.current.drawerBodies ?? []),
            ...(wallsRef.current.drawerBody ? [wallsRef.current.drawerBody] : []),
          ];
          let overlapping = false;
          for (const sb of allDrawer) {
            if (Matter.Bounds.overlaps(body.bounds, sb.bounds)) {
              overlapping = true;
              break;
            }
          }
          if (overlapping) {
            const count = (stuckFrames.get(key) ?? 0) + 1;
            stuckFrames.set(key, count);
            if (count >= 120) {
              const drawerCenterX = allDrawer.reduce((s, b) => s + b.position.x, 0) / allDrawer.length;
              Matter.Body.setVelocity(body, {
                x: (body.position.x > drawerCenterX) ? -2 : 2,
                y: -4,
              });
              stuckFrames.set(key, 0);
            }
          } else {
            stuckFrames.delete(key);
          }
        } else {
          stuckFrames.delete(key);
        }
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
    const cs = boxScaleRef.current;
    const op = overlayPreviewRef.current;

    // Derive spawn position from the actual drawer element (most accurate).
    // Falls back to spawnOrigin fraction if drawer element isn't available.
    let spawnY: number;
    let centerX: number;
    if (drawerElRef.current) {
      const sceneRect = scene.getBoundingClientRect();
      const drawerRect = drawerElRef.current.getBoundingClientRect();
      centerX = drawerRect.left - sceneRect.left + drawerRect.width / 2;
      // drawerRect is already the visual (scaled) size
      const visualTop = drawerRect.top - sceneRect.top;
      spawnY = visualTop - Math.max(20, drawerRect.height * 0.15);
    } else if (op) {
      spawnY = op.spawnOrigin.y * h;
      centerX = op.spawnOrigin.x * w;
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

      // Use real image aspect ratio for physics body so hitbox matches the visual
      const img = imagesRef.current.get(item.id);
      const imgAspect = (img?.complete && img.naturalWidth > 0)
        ? img.naturalWidth / img.naturalHeight : 1;
      let physW = size, physH = size;
      if (imgAspect > 1) physH = size / imgAspect;
      else physW = size * imgAspect;

      let body: PhysicsBody;

      if (item.contourPoints && item.contourPoints.length >= 4) {
        try {
          const verts = contourToVertices(item.contourPoints, physW, physH);
          body = Matter.Bodies.fromVertices(x, spawnY, [verts], {
            restitution: 0.45, friction: 0.4, density: 0.003, chamfer: { radius: 2 },
          }) as any;
        } catch {
          body = Matter.Bodies.rectangle(x, spawnY, physW, physH, {
            restitution: 0.45, friction: 0.4, density: 0.003, chamfer: { radius: 4 },
          }) as any;
        }
      } else {
        body = Matter.Bodies.rectangle(x, spawnY, physW, physH, {
          restitution: 0.25, friction: 0.7, density: 0.003, chamfer: { radius: 4 },
        }) as any;
      }

      body.itemData = item;
      body.spawnTime = performance.now();
      body.closeT = 0;

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

    try {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // Skip local item rendering when:
    // - items have been handed off to host page (fullpage mode)
    // - onFrameSync is active (overlay mode — host canvas draws items)
    const skipLocalItems = itemsHandedOffRef.current || !!onFrameSyncRef.current;

    if (!skipLocalItems) {
    bodiesRef.current.forEach(body => {
      const { x, y } = body.position;
      const angle = body.angle;
      const item = body.itemData;
      if (!item) return;

      let size = ITEM_BASE_SIZE * (item.scale ?? 1);

      // Spawn animation: scale + opacity ease-out
      const age = performance.now() - (body.spawnTime ?? 0);
      const spawnT = Math.min(1, age / SPAWN_ANIM_DURATION);
      const spawnScale = 1 - Math.pow(1 - spawnT, 5);   // ease-out quintic: ~86% at 100ms
      const spawnOpacity = 1 - Math.pow(1 - spawnT, 4);  // ease-out quartic: near-instant visibility
      size *= spawnScale;
      if (spawnScale < 0.01) return; // not yet visible

      // Close animation: time-based shrink + fade
      let closeScale = 1;
      let closeOpacity = 1;
      if (closingAnimRef.current) {
        const closeT = (body as PhysicsBody).closeT ?? 0;
        closeScale = Math.max(0.05, 1 - closeT * closeT);       // ease-in quad
        closeOpacity = Math.max(0, 1 - Math.pow(closeT, 3));     // cubic fade
        size *= closeScale;
        if (size < 2) return;
      }

      // Individual return-to-drawer animation (independent of global close)
      if ((body as PhysicsBody).returningToDrawer) {
        const rt = (body as PhysicsBody).returnT ?? 0;
        const returnScale = Math.max(0.05, 1 - rt * rt);
        const returnOpacity = Math.max(0, 1 - Math.pow(rt, 3));
        closeScale *= returnScale;
        closeOpacity *= returnOpacity;
        size *= returnScale;
        if (size < 2) return;
      }

      const img = imagesRef.current.get(item.id);

      ctx.save();
      ctx.globalAlpha = spawnOpacity * closeOpacity;
      ctx.translate(x, y);
      ctx.rotate(angle);

      ctx.shadowColor = isLightBg ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.2)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 2;

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

    });
    } // end skipLocalItems guard

    // Stream body positions to parent via onFrameSync (for postMessage position sync)
    if (onFrameSyncRef.current && bodiesRef.current.length > 0) {
      const hv = hostViewportRef.current;
      const ox = hv ? hv.offsetX : 0;
      const oy = hv ? hv.offsetY : 0;
      const syncBodies: FrameSyncBody[] = bodiesRef.current.map(body => {
        const item = body.itemData;
        const baseSize = ITEM_BASE_SIZE * (item?.scale ?? 1);
        const syncAge = performance.now() - ((body as PhysicsBody).spawnTime ?? 0);
        const syncSpawnT = Math.min(1, syncAge / SPAWN_ANIM_DURATION);
        const syncSpawnScale = 1 - Math.pow(1 - syncSpawnT, 5);
        const syncSpawnOpacity = 1 - Math.pow(1 - syncSpawnT, 4);
        const syncCloseT = (body as PhysicsBody).closeT ?? 0;
        const syncCloseScale = closingAnimRef.current ? Math.max(0.05, 1 - syncCloseT * syncCloseT) : 1;
        const syncCloseOpacity = closingAnimRef.current ? Math.max(0, 1 - Math.pow(syncCloseT, 3)) : 1;
        // Individual return-to-drawer animation
        const syncReturnT = (body as PhysicsBody).returnT ?? 0;
        const syncReturnScale = (body as PhysicsBody).returningToDrawer ? Math.max(0.05, 1 - syncReturnT * syncReturnT) : 1;
        const syncReturnOpacity = (body as PhysicsBody).returningToDrawer ? Math.max(0, 1 - Math.pow(syncReturnT, 3)) : 1;
        const finalSize = baseSize * syncSpawnScale * syncCloseScale * syncReturnScale;
        return {
          id: item?.id ?? '',
          x: body.position.x + ox,
          y: body.position.y + oy,
          angle: body.angle,
          width: finalSize,
          height: finalSize,
          imageUrl: item?.imageUrl ?? '',
          scale: item?.scale ?? 1,
          opacity: syncSpawnOpacity * syncCloseOpacity * syncReturnOpacity,
          link: item?.link,
          label: item?.label,
          story: item?.story,
        };
      }).filter(b => b.id);
      onFrameSyncRef.current(syncBodies, {});
    }

    } catch (err) {
      console.warn('[TreasureBox] Render loop error:', err);
    }

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
    soundEngine.playDrawerOpen();

    managedTimeout(() => {
      initPhysics();
      managedTimeout(() => {
        spawnItems();
        renderLoop();
      }, 200);
    }, 600);

    if (onItemsEscaped) {
      managedTimeout(() => {
        onItemsEscaped(items.map(item => ({
          id: item.id,
          imageUrl: item.imageUrl,
          label: item.label,
        })));
        itemsHandedOffRef.current = true;
      }, 800);
    }
  }, [isOpen, initPhysics, spawnItems, renderLoop, clearPhysics, clearAllTimeouts, managedTimeout, onItemsEscaped, items]);

  const closeDrawer = useCallback(() => {
    console.log('[TB] closeDrawer called', { isOpen, bodies: bodiesRef.current.length, returning: bodiesRef.current.filter(b => (b as PhysicsBody).returningToDrawer).length });
    // Guard: only close from open states
    if (!isOpen) return;

    // Guard: don't close while any item is in a return-to-drawer animation
    if (bodiesRef.current.some(b => (b as PhysicsBody).returningToDrawer)) {
      console.log('[TB] closeDrawer BLOCKED — return animation in progress');
      return;
    }

    // Reset any in-progress gulp animation from single-item returns
    setGulpState(null);

    // Cancel all pending open timeouts + spawn interval
    clearAllTimeouts();
    if (spawnIntervalRef.current) { clearInterval(spawnIntervalRef.current); spawnIntervalRef.current = null; }

    // Reset handoff so items render locally during close animation
    itemsHandedOffRef.current = false;

    if (onItemsReturned) {
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
        (body as PhysicsBody).closeT = eased;

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
  }, [isOpen, clearPhysics, clearAllTimeouts, managedTimeout, onItemsReturned]);

  // === Return a single dragged item back into the drawer ===
  const returnItemToDrawer = useCallback((body: PhysicsBody) => {
    const engine = engineRef.current;
    const scene = sceneRef.current;
    const drawerEl = drawerElRef.current;
    if (!engine || !body.itemData) return;
    console.log('[TB] returnItemToDrawer', body.itemData.id, 'bodies:', bodiesRef.current.length, 'returning:', bodiesRef.current.filter(b => b.returningToDrawer).length);
    // Guard: only when drawer is open and not already closing
    if (closingAnimRef.current) return;
    if (body.returningToDrawer) return;

    // Calculate drawer center in scene coords
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

    // Make body static so it stops interacting with other items
    Matter.Body.setStatic(body, true);
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
    body.returningToDrawer = true;
    body.returnT = 0;

    // Bezier arc: start → control point (arc above) → drawer center
    const start = { x: body.position.x, y: body.position.y };
    const midX = (start.x + drawerCenterX) / 2;
    const highestY = Math.min(start.y, drawerY);
    const arcHeight = 100 + Math.random() * 80;
    const xJitter = (Math.random() - 0.5) * 60;
    const cp = { x: midX + xJitter, y: highestY - arcHeight };

    const duration = 400;
    const startTime = performance.now();
    const itemId = body.itemData.id;

    const returnInterval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;

      // Quadratic Bezier
      const oneMinusT = 1 - eased;
      const x = oneMinusT * oneMinusT * start.x + 2 * oneMinusT * eased * cp.x + eased * eased * drawerCenterX;
      const y = oneMinusT * oneMinusT * start.y + 2 * oneMinusT * eased * cp.y + eased * eased * drawerY;

      Matter.Body.setPosition(body, { x, y });
      body.returnT = eased;

      // Gentle spin
      if (t < 0.9) {
        Matter.Body.setAngularVelocity(body, (Math.random() > 0.5 ? 1 : -1) * 0.02);
      }

      if (t >= 1) {
        clearInterval(returnInterval);
        returnAnimIntervalsRef.current = returnAnimIntervalsRef.current.filter(id => id !== returnInterval);

        // Remove body from physics world and tracking array
        if (engineRef.current) {
          Matter.Composite.remove(engineRef.current.world, body);
        }
        bodiesRef.current = bodiesRef.current.filter(b => b !== body);
        console.log('[TB] returnItemToDrawer complete', itemId, 'remaining:', bodiesRef.current.length, 'returning:', bodiesRef.current.filter(b => b.returningToDrawer).length);

        // Notify overlay mode
        if (window.parent !== window) {
          window.parent.postMessage({ type: 'treasure-box', action: 'item-returned-single', itemId }, '*');
        }

        // Check if this was the last item
        if (bodiesRef.current.filter(b => !b.returningToDrawer).length === 0 && bodiesRef.current.length === 0) {
          // Last item: finish gulp at closed, transition to IDLE
          gulpTimeoutsRef.current.forEach(tid => clearTimeout(tid));
          gulpTimeoutsRef.current = [];
          const t1 = setTimeout(() => {
            setGulpState(null);
            setBoxState('IDLE');
            clearPhysics();
            if (onItemsReturned) onItemsReturned();
          }, 200);
          gulpTimeoutsRef.current.push(t1);
        }
      }
    }, 16);
    returnAnimIntervalsRef.current.push(returnInterval);

    // --- Drawer gulp animation ---
    // Clear any previous gulp chain
    gulpTimeoutsRef.current.forEach(tid => clearTimeout(tid));
    gulpTimeoutsRef.current = [];

    soundEngine.playDrawerClose();

    // Determine if this will be the last item (excluding already-returning bodies)
    const remainingAfter = bodiesRef.current.filter(b => b !== body && !b.returningToDrawer).length;

    // Gulp frames: close down then reopen (unless last item)
    setGulpState('HOVER_CLOSE');
    const g1 = setTimeout(() => setGulpState('CLOSING'), 80);
    const g2 = setTimeout(() => setGulpState('SLAMMING'), 160);
    gulpTimeoutsRef.current.push(g1, g2);

    if (remainingAfter > 0) {
      // Reopen after gulp
      const g3 = setTimeout(() => setGulpState('HOVER_PEEK'), 280);
      const g4 = setTimeout(() => {
        setGulpState(null); // back to normal OPEN frame
      }, 380);
      gulpTimeoutsRef.current.push(g3, g4);
    }
    // If last item, gulp stays at SLAMMING — the interval completion handler above transitions to IDLE
  }, [clearPhysics, onItemsReturned]);

  const returnItemToDrawerRef = useRef(returnItemToDrawer);
  useEffect(() => { returnItemToDrawerRef.current = returnItemToDrawer; }, [returnItemToDrawer]);

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

  // Keep refs in sync for postMessage handler (avoids stale closures)
  handleDrawerClickRef.current = handleDrawerClick;
  handleDrawerMouseEnterRef.current = handleDrawerMouseEnter;
  handleDrawerMouseLeaveRef.current = handleDrawerMouseLeave;

  // Click on canvas — open pending link or close drawer
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (pendingLinkRef.current) {
      window.open(pendingLinkRef.current, '_blank', 'noopener,noreferrer');
      pendingLinkRef.current = null;
      return;
    }
    // After a drag, the click event is a side effect of mouseup — don't close the drawer.
    // The drag-to-return logic in the mouseConstraint mouseup handler already handled it.
    if (didDragRef.current) return;
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
      // Only close if click is on/near the drawer itself, not random whitespace
      const drawerEl = drawerElRef.current;
      if (drawerEl) {
        // drawerRect is already the visual (scaled) size — no inset needed
        const drawerRect = drawerEl.getBoundingClientRect();
        const margin = 5;
        const insideDrawer = (
          e.clientX >= drawerRect.left - margin &&
          e.clientX <= drawerRect.right + margin &&
          e.clientY >= drawerRect.top - margin &&
          e.clientY <= drawerRect.bottom + margin
        );
        if (!insideDrawer) return;
      }
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

  // --- postMessage: notify parent of drawer state changes (overlay embed) ---
  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return;
    window.parent.postMessage({
      type: 'treasure-box',
      action: 'drawer-state',
      state: boxState,
    }, '*');
  }, [boxState]);

  // --- postMessage: delegate story overlay to parent for full-screen display (overlay embed) ---
  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return;
    if (activeStory) {
      window.parent.postMessage({
        type: 'treasure-box',
        action: 'show-story',
        item: { label: activeStory.label, story: activeStory.story, imageUrl: activeStory.imageUrl, link: activeStory.link, scale: activeStory.scale },
      }, '*');
    } else {
      window.parent.postMessage({ type: 'treasure-box', action: 'dismiss-story' }, '*');
    }
  }, [activeStory]);

  // --- postMessage: send drawer bounding rect to parent (overlay embed) ---
  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return;
    const el = drawerElRef.current;
    if (!el) return;
    const sendRect = () => {
      const r = el.getBoundingClientRect();
      // drawerElRef has explicit scaled dimensions → rect = visual size directly
      console.log('[TB] drawer-rect', { x: r.left, y: r.top, w: r.width, h: r.height, scale: boxScaleRef.current });
      window.parent.postMessage({
        type: 'treasure-box',
        action: 'drawer-rect',
        rect: { x: r.left, y: r.top, width: r.width, height: r.height },
      }, '*');
    };
    sendRect();
    const ro = new ResizeObserver(sendRect);
    ro.observe(el);
    window.addEventListener('resize', sendRect);
    return () => { ro.disconnect(); window.removeEventListener('resize', sendRect); };
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
      className={`relative w-full h-full select-none ${embedded || overlayPreview ? '' : 'min-h-[400px]'} overflow-hidden`}
      style={{ background: isTransparent ? 'transparent' : bg }}
    >
      {/* Drawer area — below canvas when open so items render on top */}
      <div
        ref={drawerElRef}
        className="absolute cursor-pointer touch-none"
        style={{
          ...(effectiveOverlay?.drawerStyle || {}),
          // Explicit scaled dimensions so layout matches visual size.
          // This prevents the 420×420 layout box from overflowing the iframe.
          width: scaledDrawerW,
          height: scaledDrawerH,
          overflow: 'hidden',
          zIndex: isOpen ? 10 : 20,
          cursor: effectiveOverlay?.onDrag ? (isDraggingDrawer.current ? 'grabbing' : 'grab') : 'pointer',
        }}
        onMouseEnter={effectiveOverlay?.onDrag ? undefined : handleDrawerMouseEnter}
        onMouseLeave={effectiveOverlay?.onDrag ? undefined : handleDrawerMouseLeave}
        onClick={effectiveOverlay?.onDrag ? undefined : handleDrawerClick}
        onPointerDown={effectiveOverlay?.onDrag ? handleDrawerPointerDown : undefined}
        onPointerMove={effectiveOverlay?.onDrag ? handleDrawerPointerMove : undefined}
        onPointerUp={effectiveOverlay?.onDrag ? handleDrawerPointerUp : undefined}
      >
        <div style={{ width: drawerBaseW, height: drawerBaseH, transform: `scale(${boxScale})`, transformOrigin: 'top left' }}>
          <div style={config.drawerFlipped ? { transform: 'scaleX(-1)' } : undefined}>
            {hasGeneratedImages ? (
              // === AI-Generated Image Drawer ===
              <DrawerImage
                images={config.drawerImages!}
                currentState={gulpState ?? boxState}
                isLight={isLightBg}
                displaySize={config.drawerDisplaySize}
                flipped={!!config.drawerFlipped}
              />
            ) : (
              // === ASCII Art Fallback (dimension-aware) ===
              <DynamicASCIIBox
                dimensions={normalizeDimensions(config.boxDimensions || DEFAULT_BOX_DIMENSIONS)}
                label={config.drawerLabel || 'TREASURE BOX'}
                state={gulpState ?? boxState}
                isOpen={isOpen}
                isLight={isLightBg}
              />
            )}
          </div>
        </div>
      </div>

      {/* Physics canvas — above drawer when open so items are visible */}
      <canvas
        ref={canvasRef}
        onClick={physicsActive ? handleCanvasClick : undefined}
        onMouseMove={physicsActive ? handleCanvasMouseMove : undefined}
        onMouseLeave={physicsActive ? handleCanvasMouseLeave : undefined}
        className={`absolute inset-0 ${physicsActive ? 'pointer-events-auto' : 'pointer-events-none'}`}
        style={{ zIndex: isOpen ? 15 : 5, touchAction: physicsActive ? 'manipulation' : 'auto' }}
      />

      {/* Story overlay */}
      {activeStory && (typeof window === 'undefined' || window.parent === window) && (
        <StoryCard item={activeStory} onClose={() => setActiveStory(null)} />
      )}

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
  flipped,
}: {
  images: DrawerImages;
  currentState: BoxState;
  isLight: boolean;
  displaySize?: { width: number; height: number };
  flipped?: boolean;
}) {
  const dropShadow = isLight ? 'none' : 'drop-shadow(0 2px 6px rgba(0,0,0,0.15))';
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

      {/* Hint text for IDLE state — counter-flip if drawer is mirrored */}
      {currentState === 'IDLE' && (
        <div
          className="absolute -bottom-6 left-0 right-0 text-center text-[10px]"
          style={{
            fontFamily: "'Inconsolata', monospace",
            letterSpacing: '0.06em',
            color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)',
            ...(flipped ? { transform: 'scaleX(-1)' } : {}),
          }}
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
      case 'round-knob': {
        const pad = Math.floor((available - 3) / 2);
        return { before: ' '.repeat(pad), handle: '(O)', after: ' '.repeat(available - pad - 3) };
      }
      case 'pull-bar': {
        const barW = Math.min(16, available - 4);
        const pad = Math.floor((available - barW) / 2);
        const bar = `[ ${'═'.repeat(Math.max(0, barW - 4))} ]`;
        return { before: ' '.repeat(pad), handle: bar, after: ' '.repeat(Math.max(0, available - pad - barW)) };
      }
      case 'ring-pull': {
        const pad = Math.floor((available - 5) / 2);
        return { before: ' '.repeat(pad), handle: '(( ))', after: ' '.repeat(available - pad - 5) };
      }
      case 'half-moon': {
        const pad = Math.floor((available - 5) / 2);
        return { before: ' '.repeat(pad), handle: '(   )', after: ' '.repeat(available - pad - 5) };
      }
      case 'slot-pull': {
        const pad = Math.floor((available - 7) / 2);
        return { before: ' '.repeat(pad), handle: '[_____]', after: ' '.repeat(available - pad - 7) };
      }
      case 'none': {
        return { before: ' '.repeat(available), handle: '', after: '' };
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
          className="text-center text-[10px] mt-4"
          style={{
            fontFamily: "'Inconsolata', monospace",
            letterSpacing: '0.06em',
            color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)',
          }}
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
