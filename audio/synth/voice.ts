import { crackleBuffer, noiseBuffer, type NoiseKind } from './noise';

/** Floor for exponential ramps (they cannot reach 0). */
export const FLOOR = 1e-4;

export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/** Extra [seconds-from-start, value] waypoints between a sweep's start and end values. */
export type Via = ReadonlyArray<readonly [number, number]>;

export interface FilterSpec {
  type: BiquadFilterType;
  f0: number;
  /** end frequency (exponential sweep over the sound's duration) */
  f1?: number;
  via?: Via;
  q?: number;
}

/** Fields shared by tone() and burst(). All times are seconds, pre rate-scaling. */
export interface Shape {
  at?: number;
  dur: number;
  peak?: number;
  attack?: number;
  /** time held at `peak` after the attack, before the exponential decay to dur */
  hold?: number;
  filter?: FilterSpec;
  filter2?: FilterSpec;
  /** amplitude modulation: gain swings between 1 - 2*depth and 1 (depth 0..0.5) */
  am?: { rate: number; depth: number };
  /** random stepped amplitude flutter (granular sounds: sand, bristles, rain) */
  grain?: { depth: number; hz: number };
  to?: AudioNode;
}

export interface ToneSpec extends Shape {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  via?: Via;
  vibrato?: { rate: number; depth: number };
}

export interface NoiseSpec extends Shape {
  kind?: NoiseKind;
}

export type Builder = (v: Voice) => void;

/**
 * One playing sound: a gain node (`out`) every source feeds, plus helpers that schedule
 * oscillators / noise with envelopes. `rate` scales pitch up and time down, like playbackRate.
 */
export class Voice {
  readonly out: GainNode;
  readonly t0: number;
  private readonly srcs: AudioScheduledSourceNode[] = [];
  private readonly owned: AudioNode[] = [];
  private end = 0;
  private last: AudioScheduledSourceNode | null = null;

  constructor(readonly ctx: AudioContext, dest: AudioNode, gain: number, readonly rate: number) {
    this.t0 = ctx.currentTime + 0.005;
    this.out = ctx.createGain();
    this.out.gain.value = gain;
    this.out.connect(dest);
  }

  get duration(): number { return Math.max(0, this.end - this.t0); }

  /** absolute context time for an offset (seconds) from the voice start */
  at(s: number): number { return this.t0 + s / this.rate; }

  /** nodes the voice should disconnect when it ends (e.g. a panner) */
  own(n: AudioNode): void { this.owned.push(n); }

  // ---- raw building blocks -------------------------------------------------

  osc(type: OscillatorType, hz: number, start = this.t0, stop?: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz * this.rate;
    this.run(o, start, stop);
    return o;
  }

  /** Looping noise starting at a random offset; runs until `stop` (or until the voice is stopped). */
  noiseSrc(kind: NoiseKind, start = this.t0, stop?: number): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = noiseBuffer(this.ctx, kind);
    s.loop = true;
    this.run(s, start, stop, Math.random() * 1.5);
    return s;
  }

  crackleSrc(start = this.t0, stop?: number): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = crackleBuffer(this.ctx);
    s.loop = true;
    this.run(s, start, stop, Math.random() * 2);
    return s;
  }

  gain(value = 1): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    return g;
  }

  biquad(type: BiquadFilterType, hz: number, q = 0.7): BiquadFilterNode {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = hz * this.rate;
    b.Q.value = q;
    return b;
  }

  /** Connect nodes in series; returns the last. */
  chain(...nodes: AudioNode[]): AudioNode {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
  }

  /** Sine LFO feeding `depth` units into an AudioParam. */
  lfo(hz: number, depth: number, target: AudioParam, start = this.t0, stop?: number): OscillatorNode {
    const o = this.osc('sine', hz, start, stop);
    const g = this.gain(depth);
    o.connect(g);
    g.connect(target);
    return o;
  }

  // ---- enveloped one-shot parts -------------------------------------------

  tone(s: ToneSpec): void {
    const at = this.at(s.at ?? 0);
    const dur = s.dur / this.rate;
    const stop = at + dur + 0.03;
    const o = this.osc(s.type ?? 'sine', 1, at, stop);
    this.sweep(o.frequency, at, dur, s.f0, s.f1, s.via);
    if (s.vibrato) this.lfo(s.vibrato.rate, s.vibrato.depth * this.rate, o.frequency, at, stop);
    this.route(o, s, at, dur, stop);
  }

  burst(s: NoiseSpec): void {
    const at = this.at(s.at ?? 0);
    const dur = s.dur / this.rate;
    const stop = at + dur + 0.03;
    this.route(this.noiseSrc(s.kind ?? 'white', at, stop), s, at, dur, stop);
  }

  /** Stop everything with a short fade. `when` defaults to now. */
  stop(fade = 0.04, when = this.ctx.currentTime): void {
    this.out.gain.setTargetAtTime(0, when, fade / 3);
    for (const s of this.srcs) {
      try { s.stop(when + fade); } catch { /* already ended */ }
    }
    this.end = Math.max(this.end, when + fade);
    this.finish();
  }

  /** Disconnect the voice's graph once its last source has ended. */
  finish(): void {
    const last = this.last ?? this.srcs[0];
    if (!last) return;
    last.onended = () => {
      this.out.disconnect();
      for (const n of this.owned) n.disconnect();
    };
  }

  // ---- internals -----------------------------------------------------------

  private run(src: AudioScheduledSourceNode, start: number, stop?: number, offset?: number): void {
    if (offset === undefined) src.start(start); else (src as AudioBufferSourceNode).start(start, offset);
    if (stop !== undefined) {
      src.stop(stop);
      if (stop > this.end) { this.end = stop; this.last = src; }
    }
    this.srcs.push(src);
  }

  private sweep(p: AudioParam, at: number, dur: number, f0: number, f1?: number, via?: Via): void {
    p.setValueAtTime(f0 * this.rate, at);
    if (via) for (const [t, f] of via) p.exponentialRampToValueAtTime(f * this.rate, at + t / this.rate);
    if (f1 !== undefined) p.exponentialRampToValueAtTime(f1 * this.rate, at + dur);
  }

  private filter(s: FilterSpec, at: number, dur: number): BiquadFilterNode {
    const b = this.ctx.createBiquadFilter();
    b.type = s.type;
    b.Q.value = s.q ?? 0.7;
    this.sweep(b.frequency, at, dur, s.f0, s.f1, s.via);
    return b;
  }

  private route(src: AudioNode, s: Shape, at: number, dur: number, stop: number): void {
    let node: AudioNode = src;
    for (const f of [s.filter, s.filter2]) {
      if (!f) continue;
      const b = this.filter(f, at, dur);
      node.connect(b);
      node = b;
    }
    if (s.am) {
      const a = this.gain(1 - s.am.depth);
      this.lfo(s.am.rate, s.am.depth, a.gain, at, stop);
      node.connect(a);
      node = a;
    }
    if (s.grain) {
      const a = this.gain(1);
      const n = Math.max(2, Math.round(dur * s.grain.hz));
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) curve[i] = 1 - s.grain.depth * Math.random();
      a.gain.setValueCurveAtTime(curve, at, dur);
      node.connect(a);
      node = a;
    }
    const g = this.ctx.createGain();
    const p = g.gain;
    const peak = s.peak ?? 0.5;
    const atk = Math.min(s.attack ?? 0.002, s.dur * 0.8) / this.rate;
    const holdEnd = Math.min(at + atk + (s.hold ?? 0) / this.rate, at + dur * 0.95);
    p.setValueAtTime(FLOOR, at);
    p.linearRampToValueAtTime(peak, at + atk);
    if (holdEnd > at + atk) p.setValueAtTime(peak, holdEnd);
    p.exponentialRampToValueAtTime(FLOOR, at + dur);
    node.connect(g);
    g.connect(s.to ?? this.out);
  }
}
