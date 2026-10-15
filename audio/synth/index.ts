import {
  NOOP_LOOP, isLoopName,
  type AudioProvider, type LoopHandle, type OneShotName, type PlayOpts, type SoundName, type VoiceHandle,
} from '../types';
import { destruction } from './destruction';
import { loops } from './loops';
import { machines } from './machines';
import { process } from './process';
import { typewriter } from './typewriter';
import { Voice, type Builder } from './voice';
import { weapons } from './weapons';
import { yard } from './yard';

const ONE_SHOTS: Record<OneShotName, Builder> = {
  ...typewriter, ...machines, ...process, ...weapons, ...destruction, ...yard,
};

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/**
 * Procedural Web Audio provider: every SoundName is built from oscillators, noise buffers, filters and
 * envelopes at play time (no assets). Each voice owns a gain node (+ optional panner) and disconnects itself
 * when its last source ends.
 */
export class SynthProvider implements AudioProvider {
  private ctx: AudioContext | null = null;
  private out: AudioNode | null = null;

  init(ctx: AudioContext, out: AudioNode): void {
    this.ctx = ctx;
    this.out = out;
  }

  play(name: SoundName, opts: PlayOpts): VoiceHandle | void {
    if (!this.ctx) return;
    const v = this.voice(opts);
    if (isLoopName(name)) { // auditioning a loop as a one-shot: run it for ~1 s
      loops[name](v);
      v.stop(0.12, v.t0 + 0.9 / v.rate);
    } else {
      ONE_SHOTS[name](v);
      v.finish();
    }
    return { stop: () => v.stop(), duration: v.duration };
  }

  loop(name: SoundName, opts: PlayOpts): LoopHandle {
    const ctx = this.ctx;
    if (!ctx || !isLoopName(name)) return NOOP_LOOP;
    const v = this.voice(opts);
    const target = opts.gain ?? 1;
    v.out.gain.setValueAtTime(0, ctx.currentTime);
    v.out.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.05); // fade in: no click
    loops[name](v);
    let stopped = false;
    return {
      setGain(g, rampMs = 60) {
        if (stopped) return;
        const p = v.out.gain;
        const t = ctx.currentTime;
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
        p.linearRampToValueAtTime(Math.max(0, g), t + Math.max(0, rampMs) / 1000);
      },
      stop() {
        if (stopped) return;
        stopped = true;
        v.stop(0.1);
      },
    };
  }

  private voice(opts: PlayOpts): Voice {
    const ctx = this.ctx as AudioContext;
    let dest = this.out as AudioNode;
    let panner: StereoPannerNode | null = null;
    const pan = clamp(opts.pan ?? 0, -1, 1);
    if (pan !== 0) {
      panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(dest);
      dest = panner;
    }
    const v = new Voice(ctx, dest, Math.max(0, opts.gain ?? 1), clamp(opts.rate ?? 1, 0.25, 4));
    if (panner) v.own(panner);
    return v;
  }
}
