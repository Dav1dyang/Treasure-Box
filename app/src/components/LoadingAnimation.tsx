'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import Matter from 'matter-js';
import chroma from 'chroma-js';

// --- Tunable animation constants ---
const SPAWN_INTERVAL = 250;   // ms between each new drawer spawn
const MAX_BOXES = 80;         // safety cap before forcing a drain cycle
const DRAIN_DURATION = 2000;  // ms for boxes to fall off-screen during drain
const RESET_PAUSE = 400;      // ms pause between drain finish and next spawn cycle
const BOX_SIZES = [120,135,150]; // random drawer width in px (height = width × 0.7)

type CycleState = 'SPAWNING' | 'DRAINING' | 'RESETTING' | 'FINISHED';

/** Interpolate between two colors in Oklab space and return a CSS hex string. */
function lerpOklab(a: string, b: string, t: number): string {
  return chroma.mix(a, b, t, 'oklab').hex();
}

/** Interpolate then adjust for a contrasting stroke — darken light fills, lighten dark fills. */
function lerpOklabStroke(a: string, b: string, t: number): string {
  const mixed = chroma.mix(a, b, t, 'oklab');
  return mixed.luminance() > 0.15 ? mixed.darken(1.5).hex() : mixed.brighten(1.5).hex();
}

// Number of boxes in one full gradient cycle (start → end color)
const GRADIENT_CYCLE = 40;

interface BoxBody extends Matter.Body {
  fillColor?: string;
  strokeColor?: string;
  boxW?: number;
  boxH?: number;
}

interface LoadingAnimationProps {
  className?: string;
  /** When true, immediately drains all boxes and stops the animation gracefully */
  finishing?: boolean;
  /** Called after the finishing drain completes and canvas is clear */
  onFinished?: () => void;
  /** Start color for the gradient (hex). Defaults to '#8B4513'. */
  startColor?: string;
  /** End color for the gradient (hex). Defaults to '#B08D57'. */
  endColor?: string;
}

export default function LoadingAnimation({ className, finishing, onFinished, startColor, endColor }: LoadingAnimationProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const animFrameRef = useRef<number>(0);
  const floorRef = useRef<Matter.Body | null>(null);
  const leftWallRef = useRef<Matter.Body | null>(null);
  const rightWallRef = useRef<Matter.Body | null>(null);
  const boxBodiesRef = useRef<BoxBody[]>([]);
  const cycleStateRef = useRef<CycleState>('SPAWNING');
  const spawnIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const finishingRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  const startColorRef = useRef(startColor);
  const endColorRef = useRef(endColor);
  const [opacity, setOpacity] = useState(1);

  // Keep refs in sync with props
  onFinishedRef.current = onFinished;
  startColorRef.current = startColor;
  endColorRef.current = endColor;

  const scheduleTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

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

  const spawnCountRef = useRef(0);

  const spawnBox = useCallback(() => {
    const engine = engineRef.current;
    const scene = sceneRef.current;
    if (!engine || !scene) return;

    spawnCountRef.current++;

    const w = scene.offsetWidth;
    const size = BOX_SIZES[Math.floor(Math.random() * BOX_SIZES.length)];
    const boxW = size;
    const boxH = size * 0.7; // aspect ratio — adjust multiplier to change drawer height
    const x = 40 + Math.random() * (w - 80); // horizontal spawn range (40px margin each side)

    const body = Matter.Bodies.rectangle(x, -60, boxW, boxH, {
      restitution: 0.05,
      friction: 0.8,
      density: 0.008,
      chamfer: { radius: 3 },
    }) as BoxBody;

    const colA = startColorRef.current || '#8B4513';
    const colB = endColorRef.current || '#B08D57';
    // Ping-pong: go start→end then end→start for seamless cycling
    const raw = (spawnCountRef.current % (GRADIENT_CYCLE * 2)) / GRADIENT_CYCLE;
    const t = raw <= 1 ? raw : 2 - raw;
    body.fillColor = lerpOklab(colA, colB, t);
    body.strokeColor = lerpOklabStroke(colA, colB, t);
    body.boxW = boxW;
    body.boxH = boxH;

    // Slight random spin
    Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.08);

    Matter.Composite.add(engine.world, body);
    boxBodiesRef.current.push(body);
  }, []);

  const stopSpawning = useCallback(() => {
    if (spawnIntervalRef.current) {
      clearInterval(spawnIntervalRef.current);
      spawnIntervalRef.current = null;
    }
  }, []);

  const startSpawning = useCallback(() => {
    stopSpawning();
    cycleStateRef.current = 'SPAWNING';
    spawnIntervalRef.current = setInterval(() => {
      if (cycleStateRef.current !== 'SPAWNING') return;
      spawnBox();
    }, SPAWN_INTERVAL);
  }, [spawnBox, stopSpawning]);

  const startDraining = useCallback((isFinalDrain: boolean) => {
    if (cycleStateRef.current === 'DRAINING' || cycleStateRef.current === 'FINISHED') return;
    cycleStateRef.current = 'DRAINING';
    stopSpawning();

    const scene = sceneRef.current;
    const floor = floorRef.current;
    if (!scene || !floor) return;

    const h = scene.offsetHeight;
    // Move floor way below so boxes fall out
    Matter.Body.setPosition(floor, { x: floor.position.x, y: h + 500 });

    // Remove side walls so boxes don't jam against them
    const engine = engineRef.current;
    if (engine) {
      if (leftWallRef.current) {
        Matter.Composite.remove(engine.world, leftWallRef.current);
        leftWallRef.current = null;
      }
      if (rightWallRef.current) {
        Matter.Composite.remove(engine.world, rightWallRef.current);
        rightWallRef.current = null;
      }
      // Boost gravity to pull boxes out faster
      engine.gravity.y = 4;
    }

    // Reduce friction on all boxes so they slide freely
    boxBodiesRef.current.forEach((b: BoxBody) => {
      b.friction = 0.05;
      b.frictionAir = 0.001;
    });

    scheduleTimeout(() => {
      if (isFinalDrain) {
        // Final drain: clean up and signal done
        cycleStateRef.current = 'FINISHED';
        const engine = engineRef.current;
        if (engine) {
          boxBodiesRef.current.forEach((b: BoxBody) => Matter.Composite.remove(engine.world, b));
          boxBodiesRef.current = [];
        }
        // Fade out
        setOpacity(0);
        scheduleTimeout(() => {
          onFinishedRef.current?.();
        }, 400);
      } else {
        startResetting();
      }
    }, DRAIN_DURATION);
  }, [stopSpawning, scheduleTimeout]);

  const startResetting = useCallback(() => {
    cycleStateRef.current = 'RESETTING';
    const engine = engineRef.current;
    const scene = sceneRef.current;
    const floor = floorRef.current;
    if (!engine || !scene || !floor) return;

    // Remove all dynamic box bodies
    boxBodiesRef.current.forEach((b: BoxBody) => Matter.Composite.remove(engine.world, b));
    boxBodiesRef.current = [];

    const w = scene.offsetWidth;
    const h = scene.offsetHeight;
    // Move floor back
    Matter.Body.setPosition(floor, { x: w / 2, y: h + 10 });

    // Restore gravity
    engine.gravity.y = 1.5;

    // Re-add side walls
    const wallOpts = { isStatic: true, friction: 0.8, restitution: 0.1 };
    const leftWall = Matter.Bodies.rectangle(-10, h / 2, 20, h, wallOpts);
    const rightWall = Matter.Bodies.rectangle(w + 10, h / 2, 20, h, wallOpts);
    Matter.Composite.add(engine.world, [leftWall, rightWall]);
    leftWallRef.current = leftWall;
    rightWallRef.current = rightWall;

    scheduleTimeout(() => {
      // If finishing was requested during drain/reset, stop instead of restarting
      if (finishingRef.current) {
        cycleStateRef.current = 'FINISHED';
        setOpacity(0);
        scheduleTimeout(() => {
          onFinishedRef.current?.();
        }, 400);
        return;
      }
      startSpawning();
    }, RESET_PAUSE);
  }, [scheduleTimeout, startSpawning]);

  // Check if pile is full — only drain when boxes reach the top
  const checkFullness = useCallback(() => {
    if (cycleStateRef.current !== 'SPAWNING') return;
    const scene = sceneRef.current;
    if (!scene) return;

    const h = scene.offsetHeight;
    const bodies = boxBodiesRef.current;

    // Safety cap
    if (bodies.length >= MAX_BOXES) {
      startDraining(false);
      return;
    }

    // Find the topmost settled body (only count on-screen boxes, y > 0)
    let topmostY = h;
    for (const b of bodies) {
      if (b.position.y < 0) continue; // ignore boxes still above the viewport
      const speed = Math.sqrt(b.velocity.x ** 2 + b.velocity.y ** 2);
      if (speed < 3.0 && b.position.y < topmostY) {
        topmostY = b.position.y;
      }
    }

    // Drain when settled pile reaches near the top (within ~5% of canvas height)
    if (bodies.length > 5 && topmostY < h * 0.05) {
      startDraining(false);
    }
  }, [startDraining]);

  // Handle finishing prop change — immediately drain
  useEffect(() => {
    if (finishing && !finishingRef.current) {
      finishingRef.current = true;

      if (cycleStateRef.current === 'SPAWNING') {
        // Currently spawning: drain immediately as final drain
        startDraining(true);
      } else if (cycleStateRef.current === 'DRAINING') {
        // Already draining: finishingRef is set, startResetting will check it
      } else if (cycleStateRef.current === 'RESETTING') {
        // Resetting: finishingRef is set, startResetting will check it
      }
      // FINISHED: already done, nothing to do
    }
  }, [finishing, startDraining]);

  // Main render loop
  const renderLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) {
      animFrameRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    boxBodiesRef.current.forEach((body: BoxBody) => {
      const { x, y } = body.position;
      const angle = body.angle;
      const bw = body.boxW || 70;
      const bh = body.boxH || 49;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      // --- Drawer styling (adjust these to change appearance) ---
      ctx.fillStyle = body.fillColor || 'rgb(139,69,19)';
      ctx.strokeStyle = body.strokeColor || 'rgb(90,45,12)';
      ctx.lineWidth = 2;                     // outline thickness in px
      ctx.lineJoin = 'round';

      // Drawer body — rounded rectangle
      const r = 6; // corner radius
      const hw = bw / 2;
      const hh = bh / 2;
      ctx.beginPath();
      ctx.moveTo(-hw + r, -hh);
      ctx.lineTo(hw - r, -hh);
      ctx.arcTo(hw, -hh, hw, -hh + r, r);
      ctx.lineTo(hw, hh - r);
      ctx.arcTo(hw, hh, hw - r, hh, r);
      ctx.lineTo(-hw + r, hh);
      ctx.arcTo(-hw, hh, -hw, hh - r, r);
      ctx.lineTo(-hw, -hh + r);
      ctx.arcTo(-hw, -hh, -hw + r, -hh, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Rim line near the top edge (drawer front lip)
      const rimY = -hh + bh * 0.18;
      ctx.beginPath();
      ctx.moveTo(-hw, rimY);
      ctx.lineTo(hw, rimY);
      ctx.stroke();

      // Centered handle — small rounded rectangle
      const handleW = bw * 0.28;
      const handleH = bh * 0.1;
      const handleR = handleH / 2;
      const handleY = (rimY + hh) / 2; // centered between rim and bottom
      ctx.beginPath();
      ctx.moveTo(-handleW / 2 + handleR, handleY - handleH / 2);
      ctx.lineTo(handleW / 2 - handleR, handleY - handleH / 2);
      ctx.arcTo(handleW / 2, handleY - handleH / 2, handleW / 2, handleY - handleH / 2 + handleR, handleR);
      ctx.lineTo(handleW / 2, handleY + handleH / 2 - handleR);
      ctx.arcTo(handleW / 2, handleY + handleH / 2, handleW / 2 - handleR, handleY + handleH / 2, handleR);
      ctx.lineTo(-handleW / 2 + handleR, handleY + handleH / 2);
      ctx.arcTo(-handleW / 2, handleY + handleH / 2, -handleW / 2, handleY + handleH / 2 - handleR, handleR);
      ctx.lineTo(-handleW / 2, handleY - handleH / 2 + handleR);
      ctx.arcTo(-handleW / 2, handleY - handleH / 2, -handleW / 2 + handleR, handleY - handleH / 2, handleR);
      ctx.closePath();
      ctx.stroke();

      ctx.restore();
    });

    animFrameRef.current = requestAnimationFrame(renderLoop);
  }, []);

  // Store callbacks in refs so the init effect doesn't depend on them
  const startSpawningRef = useRef(startSpawning);
  const checkFullnessRef = useRef(checkFullness);
  const resizeCanvasRef = useRef(resizeCanvas);
  const renderLoopRef = useRef(renderLoop);
  useEffect(() => {
    startSpawningRef.current = startSpawning;
    checkFullnessRef.current = checkFullness;
    resizeCanvasRef.current = resizeCanvas;
    renderLoopRef.current = renderLoop;
  });

  // Initialize engine — runs once on mount
  useEffect(() => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas) return;

    // Canvas setup
    resizeCanvasRef.current();

    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1.5 } });
    engineRef.current = engine;

    const w = scene.offsetWidth;
    const h = scene.offsetHeight;
    const wallOpts = { isStatic: true, friction: 0.8, restitution: 0.1 };

    const floor = Matter.Bodies.rectangle(w / 2, h + 10, w + 20, 20, wallOpts);
    const leftWall = Matter.Bodies.rectangle(-10, h / 2, 20, h, wallOpts);
    const rightWall = Matter.Bodies.rectangle(w + 10, h / 2, 20, h, wallOpts);
    Matter.Composite.add(engine.world, [floor, leftWall, rightWall]);
    floorRef.current = floor;
    leftWallRef.current = leftWall;
    rightWallRef.current = rightWall;

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);
    runnerRef.current = runner;

    // Start render loop
    animFrameRef.current = requestAnimationFrame(renderLoopRef.current);

    // Delay spawning so the canvas is visibly empty before boxes start dropping
    const spawnDelay = setTimeout(() => {
      startSpawningRef.current();
    }, 1000);

    // Fullness check interval
    const fullnessCheck = setInterval(() => checkFullnessRef.current(), 500);

    // Resize handler
    const handleResize = () => {
      resizeCanvasRef.current();
      const nw = scene.offsetWidth;
      const nh = scene.offsetHeight;
      if (floorRef.current && cycleStateRef.current !== 'DRAINING') {
        Matter.Body.setPosition(floorRef.current, { x: nw / 2, y: nh + 10 });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(spawnDelay);
      clearInterval(fullnessCheck);
      if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
      timersRef.current.forEach((id: ReturnType<typeof setTimeout>) => clearTimeout(id));
      timersRef.current.clear();
      if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
      if (engineRef.current) Matter.Engine.clear(engineRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      // Reset mutable refs so Strict Mode remount starts clean
      boxBodiesRef.current = [];
      cycleStateRef.current = 'SPAWNING';
      finishingRef.current = false;
      engineRef.current = null;
      runnerRef.current = null;
      floorRef.current = null;
      leftWallRef.current = null;
      rightWallRef.current = null;
      spawnCountRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={sceneRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        opacity,
        transition: 'opacity 0.4s ease-out',
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
    </div>
  );
}
