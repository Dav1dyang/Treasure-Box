'use client';

import { useEffect, useRef, useCallback } from 'react';
import Matter from 'matter-js';

const PASTEL_PALETTE = [
  '#FFB3BA', // pink
  '#FFDFBA', // peach
  '#FFFFBA', // yellow
  '#BAFFC9', // mint
  '#BAE1FF', // sky blue
  '#D4BAFF', // lavender
  '#FFB3E6', // rose
  '#B3FFE6', // seafoam
];

const SPAWN_INTERVAL = 300;
const MAX_BOXES = 25;
const DRAIN_DURATION = 1200;
const RESET_PAUSE = 300;
const BOX_SIZES = [28, 36, 44];

type CycleState = 'SPAWNING' | 'DRAINING' | 'RESETTING';

interface BoxBody extends Matter.Body {
  color?: string;
  boxW?: number;
  boxH?: number;
}

interface LoadingAnimationProps {
  className?: string;
}

export default function LoadingAnimation({ className }: LoadingAnimationProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const animFrameRef = useRef<number>(0);
  const floorRef = useRef<Matter.Body | null>(null);
  const boxBodiesRef = useRef<BoxBody[]>([]);
  const cycleStateRef = useRef<CycleState>('SPAWNING');
  const spawnIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

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

  const spawnBox = useCallback(() => {
    const engine = engineRef.current;
    const scene = sceneRef.current;
    if (!engine || !scene) return;

    const w = scene.offsetWidth;
    const size = BOX_SIZES[Math.floor(Math.random() * BOX_SIZES.length)];
    const boxW = size;
    const boxH = size * 0.7;
    const x = 30 + Math.random() * (w - 60);

    const body = Matter.Bodies.rectangle(x, -50, boxW, boxH, {
      restitution: 0.2,
      friction: 0.6,
      density: 0.002,
      chamfer: { radius: 2 },
    }) as BoxBody;

    body.color = PASTEL_PALETTE[Math.floor(Math.random() * PASTEL_PALETTE.length)];
    body.boxW = boxW;
    body.boxH = boxH;

    // Slight random spin
    Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.1);

    Matter.Composite.add(engine.world, body);
    boxBodiesRef.current.push(body);
  }, []);

  const startSpawning = useCallback(() => {
    if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
    cycleStateRef.current = 'SPAWNING';
    spawnIntervalRef.current = setInterval(() => {
      if (cycleStateRef.current !== 'SPAWNING') return;
      spawnBox();
    }, SPAWN_INTERVAL);
  }, [spawnBox]);

  const startDraining = useCallback(() => {
    cycleStateRef.current = 'DRAINING';
    if (spawnIntervalRef.current) {
      clearInterval(spawnIntervalRef.current);
      spawnIntervalRef.current = null;
    }

    const scene = sceneRef.current;
    const floor = floorRef.current;
    if (!scene || !floor) return;

    const h = scene.offsetHeight;
    // Move floor way below so boxes fall out
    Matter.Body.setPosition(floor, { x: floor.position.x, y: h + 500 });

    scheduleTimeout(() => {
      startResetting();
    }, DRAIN_DURATION);
  }, [scheduleTimeout]);

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

    scheduleTimeout(() => {
      startSpawning();
    }, RESET_PAUSE);
  }, [scheduleTimeout, startSpawning]);

  // Check if pile is full enough to drain
  const checkFullness = useCallback(() => {
    if (cycleStateRef.current !== 'SPAWNING') return;
    const scene = sceneRef.current;
    if (!scene) return;

    const h = scene.offsetHeight;
    const bodies = boxBodiesRef.current;

    if (bodies.length >= MAX_BOXES) {
      startDraining();
      return;
    }

    // Count settled boxes near the top
    const settled = bodies.filter((b: BoxBody) => {
      const speed = Math.sqrt(b.velocity.x ** 2 + b.velocity.y ** 2);
      return b.position.y < h * 0.3 && speed < 0.5;
    });

    if (settled.length >= 3) {
      startDraining();
    }
  }, [startDraining]);

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
      const color = body.color || '#BAE1FF';
      const bw = body.boxW || 36;
      const bh = body.boxH || 25;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';

      // Outer box outline
      ctx.beginPath();
      const r = 3;
      const hw = bw / 2;
      const hh = bh / 2;
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
      ctx.stroke();

      // Lid line at 1/4 from top (3/4 of box height)
      const lidY = -hh + bh * 0.25;
      ctx.beginPath();
      ctx.moveTo(-hw, lidY);
      ctx.lineTo(hw, lidY);
      ctx.stroke();

      ctx.restore();
    });

    animFrameRef.current = requestAnimationFrame(renderLoop);
  }, []);

  // Initialize engine
  useEffect(() => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas) return;

    // Canvas setup
    resizeCanvas();

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

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);
    runnerRef.current = runner;

    // Start render loop
    animFrameRef.current = requestAnimationFrame(renderLoop);

    // Start spawning
    startSpawning();

    // Fullness check interval
    const fullnessCheck = setInterval(checkFullness, 500);

    // Resize handler
    const handleResize = () => {
      resizeCanvas();
      const nw = scene.offsetWidth;
      const nh = scene.offsetHeight;
      if (floorRef.current && cycleStateRef.current !== 'DRAINING') {
        Matter.Body.setPosition(floorRef.current, { x: nw / 2, y: nh + 10 });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearInterval(fullnessCheck);
      if (spawnIntervalRef.current) clearInterval(spawnIntervalRef.current);
      timersRef.current.forEach((id: ReturnType<typeof setTimeout>) => clearTimeout(id));
      timersRef.current.clear();
      if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
      if (engineRef.current) Matter.Engine.clear(engineRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [resizeCanvas, renderLoop, startSpawning, checkFullness]);

  return (
    <div ref={sceneRef} className={className} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
    </div>
  );
}
