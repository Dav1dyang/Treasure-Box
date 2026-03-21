import type { SoundPreset } from './types';

class SoundEngine {
  private audioCtx: AudioContext | null = null;
  private enabled = true;
  private volume = 0.3;
  private preset: SoundPreset = 'metallic';
  private lastPlayTime = 0;
  private minInterval = 50; // ms between sounds to avoid spam

  init() {
    if (typeof window === 'undefined') return;
    this.audioCtx = new AudioContext();
  }

  setEnabled(enabled: boolean) { this.enabled = enabled; }
  setVolume(vol: number) { this.volume = Math.max(0, Math.min(1, vol)); }
  setPreset(preset: SoundPreset) { this.preset = preset; }

  playCollision(velocity: number) {
    if (!this.enabled || this.preset === 'silent' || !this.audioCtx) return;

    const now = performance.now();
    if (now - this.lastPlayTime < this.minInterval) return;
    this.lastPlayTime = now;

    const speed = Math.min(velocity, 10);
    if (speed < 0.5) return;

    const vol = this.volume * (speed / 10) * 0.4;
    const ctx = this.audioCtx;

    switch (this.preset) {
      case 'metallic': this.playMetallicCollision(ctx, vol); break;
      case 'wooden':   this.playWoodenCollision(ctx, vol); break;
      case 'glass':    this.playGlassCollision(ctx, vol); break;
      case 'paper':    this.playPaperCollision(ctx, vol); break;
      case 'pixel':    this.playPixelCollision(ctx, vol); break;
      case 'clay':     this.playClayCollision(ctx, vol); break;
    }
  }

  playDrawerOpen() {
    if (!this.enabled || this.preset === 'silent' || !this.audioCtx) return;
    const ctx = this.audioCtx;
    const vol = this.volume * 0.5;

    switch (this.preset) {
      case 'metallic': this.playMetallicOpen(ctx, vol); break;
      case 'wooden':   this.playWoodenOpen(ctx, vol); break;
      case 'glass':    this.playGlassOpen(ctx, vol); break;
      case 'paper':    this.playPaperOpen(ctx, vol); break;
      case 'pixel':    this.playPixelOpen(ctx, vol); break;
      case 'clay':     this.playClayOpen(ctx, vol); break;
    }
  }

  playDrawerClose() {
    if (!this.enabled || this.preset === 'silent' || !this.audioCtx) return;
    const ctx = this.audioCtx;
    const vol = this.volume * 0.6;

    switch (this.preset) {
      case 'metallic': this.playMetallicClose(ctx, vol); break;
      case 'wooden':   this.playWoodenClose(ctx, vol); break;
      case 'glass':    this.playGlassClose(ctx, vol); break;
      case 'paper':    this.playPaperClose(ctx, vol); break;
      case 'pixel':    this.playPixelClose(ctx, vol); break;
      case 'clay':     this.playClayClose(ctx, vol); break;
    }
  }

  // ─── Collision presets ──────────────────────────────────────────

  private playMetallicCollision(ctx: AudioContext, vol: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.value = 800 + Math.random() * 2000;

    filter.type = 'bandpass';
    filter.frequency.value = 2000 + Math.random() * 3000;
    filter.Q.value = 10;

    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }

  private playWoodenCollision(ctx: AudioContext, vol: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 200 + Math.random() * 300;

    gain.gain.setValueAtTime(vol * 0.8, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  }

  private playGlassCollision(ctx: AudioContext, vol: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 2000 + Math.random() * 4000;

    gain.gain.setValueAtTime(vol * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  }

  private playPaperCollision(ctx: AudioContext, vol: number) {
    const bufferSize = ctx.sampleRate * 0.03;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 4000;

    gain.gain.setValueAtTime(vol * 0.5, ctx.currentTime);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start();
  }

  private playPixelCollision(ctx: AudioContext, vol: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;

    osc.type = 'square';
    // Rapid pitch sweep down 400-1200Hz — classic 8-bit bleep
    const startFreq = 400 + Math.random() * 800;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 0.4, t + 0.04);

    gain.gain.setValueAtTime(vol * 0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.04);
  }

  private playClayCollision(ctx: AudioContext, vol: number) {
    const t = ctx.currentTime;

    // Low sine thud
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 80 + Math.random() * 70;
    oscGain.gain.setValueAtTime(vol * 0.6, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.05);

    // Filtered noise for soft texture
    const bufLen = ctx.sampleRate * 0.05;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.2));
    }
    const src = ctx.createBufferSource();
    const nGain = ctx.createGain();
    const lpf = ctx.createBiquadFilter();
    src.buffer = buf;
    lpf.type = 'lowpass';
    lpf.frequency.value = 500;
    nGain.gain.setValueAtTime(vol * 0.3, t);
    src.connect(lpf);
    lpf.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(t);
  }

  // ─── Drawer open presets ────────────────────────────────────────

  private playMetallicOpen(ctx: AudioContext, vol: number) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(1500, t + 0.4);

    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 3;

    gain.gain.setValueAtTime(vol * 0.4, t);
    gain.gain.linearRampToValueAtTime(vol * 0.6, t + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  private playWoodenOpen(ctx: AudioContext, vol: number) {
    const t = ctx.currentTime;

    // Sine sweep for wooden slide
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.35);
    oscGain.gain.setValueAtTime(vol * 0.5, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);

    // Bandpass noise for friction
    const bufLen = ctx.sampleRate * 0.35;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      const env = Math.sin((i / bufLen) * Math.PI); // fade in/out
      ch[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    const nGain = ctx.createGain();
    const bpf = ctx.createBiquadFilter();
    src.buffer = buf;
    bpf.type = 'bandpass';
    bpf.frequency.value = 800;
    bpf.Q.value = 2;
    nGain.gain.setValueAtTime(vol * 0.15, t);
    src.connect(bpf);
    bpf.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(t);
  }

  private playGlassOpen(ctx: AudioContext, vol: number) {
    const t = ctx.currentTime;

    // Rising sine sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.exponentialRampToValueAtTime(3000, t + 0.25);
    gain.gain.setValueAtTime(vol * 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);

    // High chime at end
    const chime = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chime.type = 'sine';
    chime.frequency.value = 4000;
    chimeGain.gain.setValueAtTime(0.001, t);
    chimeGain.gain.setValueAtTime(vol * 0.15, t + 0.2);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    chime.connect(chimeGain);
    chimeGain.connect(ctx.destination);
    chime.start(t + 0.2);
    chime.stop(t + 0.3);
  }

  private playPaperOpen(ctx: AudioContext, vol: number) {
    const t = ctx.currentTime;
    const bufLen = ctx.sampleRate * 0.3;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      const env = Math.sin((i / bufLen) * Math.PI); // smooth fade in/out
      ch[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    const bpf = ctx.createBiquadFilter();
    src.buffer = buf;
    bpf.type = 'bandpass';
    bpf.frequency.value = 4000;
    bpf.Q.value = 1;
    gain.gain.setValueAtTime(vol * 0.3, t);
    src.connect(bpf);
    bpf.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
  }

  private playPixelOpen(ctx: AudioContext, vol: number) {
    const t = ctx.currentTime;
    // Ascending arpeggio: 400 → 600 → 800 → 1000 Hz
    const notes = [400, 600, 800, 1000];
    const noteDur = 0.075;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      const start = t + i * noteDur;
      gain.gain.setValueAtTime(vol * 0.2, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + noteDur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + noteDur);
    });
  }

  private playClayOpen(ctx: AudioContext, vol: number) {
    const t = ctx.currentTime;

    // Low sine sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.3);
    gain.gain.setValueAtTime(vol * 0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);

    // Muted noise
    const bufLen = ctx.sampleRate * 0.25;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.3));
    }
    const src = ctx.createBufferSource();
    const nGain = ctx.createGain();
    const lpf = ctx.createBiquadFilter();
    src.buffer = buf;
    lpf.type = 'lowpass';
    lpf.frequency.value = 400;
    nGain.gain.setValueAtTime(vol * 0.15, t);
    src.connect(lpf);
    lpf.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(t);
  }

  // ─── Drawer close presets ───────────────────────────────────────

  private playMetallicClose(ctx: AudioContext, vol: number) {
    const t = ctx.currentTime;

    // Sharp triangle burst
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 400;
    gain.gain.setValueAtTime(vol * 0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);

    // Ring overtone
    const ring = ctx.createOscillator();
    const ringGain = ctx.createGain();
    ring.type = 'sine';
    ring.frequency.value = 2000;
    ringGain.gain.setValueAtTime(vol * 0.15, t);
    ringGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    ring.connect(ringGain);
    ringGain.connect(ctx.destination);
    ring.start(t);
    ring.stop(t + 0.12);
  }

  private playWoodenClose(ctx: AudioContext, vol: number) {
    const t = ctx.currentTime;

    // Sharp sine thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 150;
    gain.gain.setValueAtTime(vol * 0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);

    // Brief noise rattle
    const bufLen = ctx.sampleRate * 0.06;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.15));
    }
    const src = ctx.createBufferSource();
    const nGain = ctx.createGain();
    src.buffer = buf;
    nGain.gain.setValueAtTime(vol * 0.25, t);
    src.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(t);
  }

  private playGlassClose(ctx: AudioContext, vol: number) {
    const t = ctx.currentTime;

    // Short sine burst
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 3000;
    gain.gain.setValueAtTime(vol * 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);

    // Brief ring
    const ring = ctx.createOscillator();
    const ringGain = ctx.createGain();
    ring.type = 'sine';
    ring.frequency.value = 5000;
    ringGain.gain.setValueAtTime(vol * 0.1, t);
    ringGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    ring.connect(ringGain);
    ringGain.connect(ctx.destination);
    ring.start(t);
    ring.stop(t + 0.1);
  }

  private playPaperClose(ctx: AudioContext, vol: number) {
    const t = ctx.currentTime;
    const bufLen = ctx.sampleRate * 0.04;
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.15));
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    const hpf = ctx.createBiquadFilter();
    src.buffer = buf;
    hpf.type = 'highpass';
    hpf.frequency.value = 3000;
    gain.gain.setValueAtTime(vol * 0.4, t);
    src.connect(hpf);
    hpf.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
  }

  private playPixelClose(ctx: AudioContext, vol: number) {
    const t = ctx.currentTime;
    // Descending sweep 800 → 200 Hz
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);
    gain.gain.setValueAtTime(vol * 0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  private playClayClose(ctx: AudioContext, vol: number) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 80;
    gain.gain.setValueAtTime(vol * 0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  }
}

export const soundEngine = new SoundEngine();
