import type { SoundPreset, GeneratedSounds } from './types';

class SoundEngine {
  private audioCtx: AudioContext | null = null;
  private enabled = true;
  private volume = 0.3;
  private preset: SoundPreset = 'metallic';
  private lastPlayTime = 0;
  private minInterval = 50; // ms between sounds to avoid spam

  // AI-generated sound buffers
  private collisionBuffer: AudioBuffer | null = null;
  private drawerOpenBuffer: AudioBuffer | null = null;
  private drawerCloseBuffer: AudioBuffer | null = null;
  private aiSoundsLoaded = false;

  init() {
    if (typeof window === 'undefined') return;
    this.audioCtx = new AudioContext();
  }

  setEnabled(enabled: boolean) { this.enabled = enabled; }
  setVolume(vol: number) { this.volume = Math.max(0, Math.min(1, vol)); }
  setPreset(preset: SoundPreset) { this.preset = preset; }

  /** Load AI-generated sounds from Firebase Storage URLs */
  async loadAISounds(sounds: GeneratedSounds): Promise<void> {
    if (!this.audioCtx) return;

    try {
      const ctx = this.audioCtx;
      const [collision, drawerOpen, drawerClose] = await Promise.all([
        this.fetchAndDecode(ctx, sounds.collisionUrl),
        this.fetchAndDecode(ctx, sounds.drawerOpenUrl),
        this.fetchAndDecode(ctx, sounds.drawerCloseUrl),
      ]);

      this.collisionBuffer = collision;
      this.drawerOpenBuffer = drawerOpen;
      this.drawerCloseBuffer = drawerClose;
      this.aiSoundsLoaded = true;
    } catch (err) {
      console.warn('Failed to load AI sounds, falling back to synthesis:', err);
      this.aiSoundsLoaded = false;
    }
  }

  clearAISounds() {
    this.collisionBuffer = null;
    this.drawerOpenBuffer = null;
    this.drawerCloseBuffer = null;
    this.aiSoundsLoaded = false;
  }

  private async fetchAndDecode(ctx: AudioContext, url: string): Promise<AudioBuffer> {
    const res = await fetch(url);
    const arrayBuf = await res.arrayBuffer();
    return ctx.decodeAudioData(arrayBuf);
  }

  playCollision(velocity: number) {
    if (!this.enabled || this.preset === 'silent' || !this.audioCtx) return;

    const now = performance.now();
    if (now - this.lastPlayTime < this.minInterval) return;
    this.lastPlayTime = now;

    // Only play for meaningful collisions
    const speed = Math.min(velocity, 10);
    if (speed < 0.5) return;

    const vol = this.volume * (speed / 10) * 0.4;
    const ctx = this.audioCtx;

    // AI-generated collision sound
    if (this.preset === 'ai-generated' && this.aiSoundsLoaded && this.collisionBuffer) {
      this.playBuffer(ctx, this.collisionBuffer, vol, 0.9 + Math.random() * 0.2);
      return;
    }

    switch (this.preset) {
      case 'metallic':
        this.playMetallic(ctx, vol);
        break;
      case 'wooden':
        this.playWooden(ctx, vol);
        break;
      case 'glass':
        this.playGlass(ctx, vol);
        break;
      case 'paper':
        this.playPaper(ctx, vol);
        break;
    }
  }

  /** Play drawer open sound (AI-generated only) */
  playDrawerOpen() {
    if (!this.enabled || this.preset === 'silent' || !this.audioCtx) return;
    if (this.preset === 'ai-generated' && this.aiSoundsLoaded && this.drawerOpenBuffer) {
      this.playBuffer(this.audioCtx, this.drawerOpenBuffer, this.volume * 0.5);
    }
  }

  /** Play drawer close/slam sound (AI-generated only) */
  playDrawerClose() {
    if (!this.enabled || this.preset === 'silent' || !this.audioCtx) return;
    if (this.preset === 'ai-generated' && this.aiSoundsLoaded && this.drawerCloseBuffer) {
      this.playBuffer(this.audioCtx, this.drawerCloseBuffer, this.volume * 0.6);
    }
  }

  /** Play an AudioBuffer with optional volume and playback rate */
  private playBuffer(ctx: AudioContext, buffer: AudioBuffer, vol: number, rate = 1.0) {
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();

    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = vol;

    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }

  private playMetallic(ctx: AudioContext, vol: number) {
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

  private playWooden(ctx: AudioContext, vol: number) {
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

  private playGlass(ctx: AudioContext, vol: number) {
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

  private playPaper(ctx: AudioContext, vol: number) {
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
}

export const soundEngine = new SoundEngine();
