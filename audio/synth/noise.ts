export type NoiseKind = 'white' | 'pink' | 'brown';

const SECONDS = 2;
const CROSSFADE_S = 0.12;
const cache = new WeakMap<object, Map<string, AudioBuffer>>();

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bufferFor(ctx: BaseAudioContext, key: string, make: () => AudioBuffer): AudioBuffer {
  let m = cache.get(ctx);
  if (!m) { m = new Map(); cache.set(ctx, m); }
  let b = m.get(key);
  if (!b) { b = make(); m.set(key, b); }
  return b;
}

/**
 * Seamlessly loopable noise: generate N + F samples and equal-power crossfade the tail F samples into
 * the head, so the wrap point is continuous. Used for both one-shots and loops.
 */
export function noiseBuffer(ctx: BaseAudioContext, kind: NoiseKind): AudioBuffer {
  return bufferFor(ctx, kind, () => {
    const n = Math.round(ctx.sampleRate * SECONDS);
    const f = Math.round(ctx.sampleRate * CROSSFADE_S);
    const rnd = mulberry32(kind === 'white' ? 1 : kind === 'pink' ? 2 : 3);
    const raw = new Float32Array(n + f);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, brown = 0;
    for (let i = 0; i < raw.length; i++) {
      const w = rnd() * 2 - 1;
      if (kind === 'white') raw[i] = w;
      else if (kind === 'pink') { // Paul Kellet's economy filter
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else { brown = (brown + 0.02 * w) / 1.02; raw[i] = brown * 3.5; }
    }
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const out = buf.getChannelData(0);
    for (let i = 0; i < n; i++) out[i] = raw[i];
    for (let i = 0; i < f; i++) {
      const a = (i / f) * Math.PI * 0.5;
      out[i] = raw[i] * Math.sin(a) + raw[n + i] * Math.cos(a);
    }
    return buf;
  });
}

/** Sparse random pops (embers/sparks), loop-safe: no impulses near the ends. */
export function crackleBuffer(ctx: BaseAudioContext): AudioBuffer {
  return bufferFor(ctx, 'crackle', () => {
    const sr = ctx.sampleRate;
    const n = Math.round(sr * 3);
    const buf = ctx.createBuffer(1, n, sr);
    const out = buf.getChannelData(0);
    const rnd = mulberry32(7);
    const pops = 110;
    for (let p = 0; p < pops; p++) {
      const start = Math.floor((0.05 + rnd() * 2.8) * sr);
      const amp = 0.25 + rnd() * rnd() * 0.75;
      const len = Math.max(2, Math.floor((0.0005 + rnd() * 0.003) * sr));
      for (let i = 0; i < len && start + i < n; i++) {
        out[start + i] += (rnd() * 2 - 1) * amp * (1 - i / len);
      }
    }
    return buf;
  });
}
