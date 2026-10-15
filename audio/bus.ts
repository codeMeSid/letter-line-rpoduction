import { SynthProvider } from './synth';
import type { AudioProvider, LoopHandle, PlayOpts, SoundName, VoiceHandle } from './types';

export const MAX_VOICES = 24;
export const DEFAULT_THROTTLE_MS = 40;
/** Per-name minimum gap (ms) between plays; anything not listed uses DEFAULT_THROTTLE_MS. */
export const THROTTLE_MS: Partial<Record<SoundName, number>> = { 'key-clack': 15 };

/** Options accepted by the bus: world `x` is converted to a pan using the listener; explicit `pan` wins. */
export interface BusPlayOpts extends PlayOpts {
  x?: number;
}

export interface AudioBusOptions {
  provider?: AudioProvider;
  /** injected in tests; default builds a real AudioContext lazily on unlock() */
  createContext?: () => AudioContext;
  /** ms clock used for throttling and voice expiry */
  now?: () => number;
  volume?: number;
  enabled?: boolean;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Perceptual taper: volume 0..1 → linear master gain (squared); 0 when sound is off. */
export function volumeToGain(volume: number, enabled: boolean): number {
  if (!enabled) return 0;
  const v = clamp(Number.isFinite(volume) ? volume : 0, 0, 1);
  return v * v;
}

function defaultContext(): AudioContext {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio not supported');
  return new Ctor();
}

interface LoopEntry {
  name: SoundName;
  opts: PlayOpts;
  gain: number;
  stopped: boolean;
  inner: LoopHandle | null;
}

interface ActiveVoice { handle: VoiceHandle; endsAt: number }

/**
 * Single entry point for sound. Decoupled from settings: the owner calls `setVolume` / `setEnabled`.
 * Structurally compatible with `{ play(name: string, opts?: unknown): void }` (the old station placeholder).
 */
export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiterIn: AudioNode | null = null;
  private failed = false;
  private provider: AudioProvider;
  private readonly createContext: () => AudioContext;
  private readonly now: () => number;
  private volume: number;
  private enabled: boolean;
  private listener = { x: 0, half: 1 };
  private readonly lastPlayed = new Map<SoundName, number>();
  private voices: ActiveVoice[] = [];
  private readonly loops = new Set<LoopEntry>();

  constructor(o: AudioBusOptions = {}) {
    this.provider = o.provider ?? new SynthProvider();
    this.createContext = o.createContext ?? defaultContext;
    this.now = o.now ?? (() => performance.now());
    this.volume = o.volume ?? 0.6;
    this.enabled = o.enabled ?? true;
  }

  get unlocked(): boolean { return this.ctx !== null; }
  /** current master gain (after taper / mute) */
  get masterGain(): number { return volumeToGain(this.volume, this.enabled); }

  /** Create/resume the AudioContext. Call from a user gesture (keydown/pointerdown); safe to repeat. */
  unlock(): void {
    if (this.failed) return;
    if (!this.ctx) {
      let ctx: AudioContext;
      try { ctx = this.createContext(); } catch { this.failed = true; return; }
      const master = ctx.createGain();
      master.gain.value = this.masterGain;
      const limiter = ctx.createDynamicsCompressor(); // keeps 24 stacked voices from clipping
      limiter.threshold.value = -10;
      limiter.knee.value = 12;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.2;
      limiter.connect(master);
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.limiterIn = limiter;
      this.provider.init(ctx, limiter);
      for (const e of this.loops) this.startLoop(e);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  /** Swap the active provider. Running loops restart on the new provider. */
  setProvider(p: AudioProvider): void {
    for (const e of this.loops) { e.inner?.stop(); e.inner = null; }
    this.stopVoices();
    this.provider = p;
    if (this.ctx && this.limiterIn) {
      p.init(this.ctx, this.limiterIn);
      for (const e of this.loops) this.startLoop(e);
    }
  }

  setVolume(v: number): void { this.volume = v; this.applyMaster(); }
  setEnabled(on: boolean): void { this.enabled = on; this.applyMaster(); }

  /** Camera centre and half-width in world x; used to turn a sound's world x into a stereo pan. */
  setListener(xCenter: number, halfWidth: number): void {
    this.listener = { x: xCenter, half: Math.max(1e-6, halfWidth) };
  }

  play(name: SoundName, opts: BusPlayOpts = {}): void {
    if (!this.ctx || !this.enabled || this.masterGain === 0) return;
    const t = this.now();
    const gap = THROTTLE_MS[name] ?? DEFAULT_THROTTLE_MS;
    const prev = this.lastPlayed.get(name);
    if (prev !== undefined && t - prev < gap) return;
    this.lastPlayed.set(name, t);

    this.voices = this.voices.filter((v) => v.endsAt > t);
    while (this.voices.length >= MAX_VOICES) this.voices.shift()?.handle.stop(); // drop oldest

    try {
      const handle = this.provider.play(name, this.resolve(opts));
      if (handle) this.voices.push({ handle, endsAt: t + handle.duration * 1000 });
    } catch { /* audio must never break the scene */ }
  }

  /**
   * Start a loop. Before unlock it is remembered and starts on unlock. Loops do not count toward the voice
   * cap and keep running while muted (master gain is 0), so un-muting is instant.
   */
  loop(name: SoundName, opts: BusPlayOpts = {}): LoopHandle {
    const entry: LoopEntry = {
      name, opts: this.resolve(opts), gain: opts.gain ?? 1, stopped: false, inner: null,
    };
    this.loops.add(entry);
    this.startLoop(entry);
    return {
      setGain: (g, rampMs) => {
        entry.gain = g;
        entry.inner?.setGain(g, rampMs);
      },
      stop: () => {
        if (entry.stopped) return;
        entry.stopped = true;
        entry.inner?.stop();
        entry.inner = null;
        this.loops.delete(entry);
      },
    };
  }

  /** Stop all loops and voices and close the context. */
  dispose(): void {
    for (const e of this.loops) { e.stopped = true; e.inner?.stop(); }
    this.loops.clear();
    this.stopVoices();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
    this.limiterIn = null;
  }

  private startLoop(e: LoopEntry): void {
    if (!this.ctx || e.stopped || e.inner) return;
    try { e.inner = this.provider.loop(e.name, { ...e.opts, gain: e.gain }); } catch { /* ignore */ }
  }

  private stopVoices(): void {
    for (const v of this.voices) v.handle.stop();
    this.voices = [];
  }

  private applyMaster(): void {
    if (!this.master || !this.ctx) return;
    const p = this.master.gain;
    p.cancelScheduledValues(this.ctx.currentTime);
    p.setTargetAtTime(this.masterGain, this.ctx.currentTime, 0.02); // smoothed: no zipper noise
  }

  private resolve(o: BusPlayOpts): PlayOpts {
    let pan = 0;
    if (o.pan !== undefined) pan = o.pan;
    else if (o.x !== undefined) pan = (o.x - this.listener.x) / this.listener.half;
    return { pan: clamp(pan, -1, 1), gain: o.gain, rate: o.rate };
  }
}
