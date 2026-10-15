/**
 * Sample-based provider — a STUB kept for later; not wired by default (the procedural synth is active).
 *
 * To add recorded samples later:
 *   1. Put files in `public/audio/` and add them to SAMPLE_URLS, e.g. `'key-clack': '/audio/key-clack.mp3'`,
 *      or embed them as data URIs: `'ding': 'data:audio/mpeg;base64,SUQzBAAAAAAA...'` (base64-encode the
 *      file, e.g. `base64 -i ding.mp3`). Data URIs go through the same fetch + decodeAudioData path.
 *   2. Call `await provider.preload()` once the AudioContext exists (after `bus.unlock()`).
 *   3. `bus.setProvider(new SampleProvider())`. Names without a sample are silent no-ops, so you can mix by
 *      wrapping both providers if you only replace some sounds.
 */
import {
  NOOP_LOOP,
  type AudioProvider, type LoopHandle, type PlayOpts, type SoundName, type VoiceHandle,
} from './types';

export const SAMPLE_URLS: Partial<Record<SoundName, string>> = {};

export class SampleProvider implements AudioProvider {
  private ctx: AudioContext | null = null;
  private out: AudioNode | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();

  constructor(private readonly urls: Partial<Record<SoundName, string>> = SAMPLE_URLS) {}

  init(ctx: AudioContext, out: AudioNode): void {
    this.ctx = ctx;
    this.out = out;
  }

  /** Fetch and decode every configured sample. Failures leave that name silent. */
  async preload(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all((Object.entries(this.urls) as [SoundName, string][]).map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        this.buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
      } catch { /* leave silent */ }
    }));
  }

  play(name: SoundName, opts: PlayOpts): VoiceHandle | void {
    const h = this.start(name, opts, false);
    return h ? { stop: h.stop, duration: this.buffers.get(name)?.duration ?? 0 } : undefined;
  }

  loop(name: SoundName, opts: PlayOpts): LoopHandle {
    return this.start(name, opts, true) ?? NOOP_LOOP;
  }

  private start(name: SoundName, opts: PlayOpts, loop: boolean): LoopHandle | null {
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!ctx || !this.out || !buffer) return null;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    src.playbackRate.value = opts.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = opts.gain ?? 1;
    const pan = ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? 0;
    src.connect(g);
    g.connect(pan);
    pan.connect(this.out);
    src.onended = () => { g.disconnect(); pan.disconnect(); };
    src.start();
    return {
      setGain(v, rampMs = 60) {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(Math.max(0, v), t + rampMs / 1000);
      },
      stop() { try { src.stop(); } catch { /* ended */ } },
    };
  }
}
