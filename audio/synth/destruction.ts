import { rnd, type Builder, type Voice } from './voice';

/** A cloud of short, high-Q band-passed noise pings; `skew` > 1 front-loads them. */
function pings(v: Voice, n: number, span: number, f: [number, number], q: [number, number],
  len: [number, number], peak: [number, number], skew = 2, at0 = 0): void {
  for (let i = 0; i < n; i++) {
    const t = Math.pow(Math.random(), skew) * span;
    v.burst({ at: at0 + t, dur: rnd(len[0], len[1]), peak: rnd(peak[0], peak[1]) * (1 - 0.6 * (t / span)),
      attack: 0.0006, filter: { type: 'bandpass', f0: rnd(f[0], f[1]), q: rnd(q[0], q[1]) } });
  }
}

const glassShatter: Builder = (v) => {
  v.burst({ dur: 0.012, peak: 0.9, attack: 0.0004, filter: { type: 'highpass', f0: 2800 } }); // first crack
  v.tone({ f0: 4300, f1: 3800, dur: 0.05, peak: 0.1 });
  pings(v, 48, 0.75, [2500, 9500], [15, 40], [0.006, 0.026], [0.12, 0.38], 2, 0.005); // shards
  for (let i = 0; i < 7; i++) { // tinkling sustained shards
    v.tone({ at: rnd(0.02, 0.9), f0: rnd(3200, 6500), dur: rnd(0.08, 0.16), peak: rnd(0.04, 0.09), attack: 0.001 });
  }
  pings(v, 10, 0.4, [3000, 8000], [20, 40], [0.005, 0.015], [0.06, 0.14], 1, 0.8); // settling
};

const ceramicShatter: Builder = (v) => {
  v.burst({ dur: 0.02, peak: 0.85, attack: 0.0005, filter: { type: 'bandpass', f0: 3500, q: 1.5 } });
  v.tone({ at: 0.002, f0: 250, f1: 110, dur: 0.07, peak: 0.45 });
  pings(v, 26, 0.45, [1200, 4500], [8, 18], [0.015, 0.05], [0.14, 0.34], 1.8, 0.005); // chips
  pings(v, 14, 0.5, [800, 1800], [4, 6], [0.02, 0.05], [0.1, 0.25], 1.2, 0.08); // chunks clattering
};

const crunch: Builder = (v) => {
  for (let i = 0; i < 9; i++) { // biscuit fracturing
    const t = i * 0.02 + rnd(0, 0.012);
    v.burst({ at: t, kind: 'pink', dur: rnd(0.015, 0.035), peak: rnd(0.25, 0.5),
      filter: { type: 'bandpass', f0: rnd(1200, 3500), q: 2 }, filter2: { type: 'highpass', f0: 600 } });
  }
  v.tone({ at: 0.005, type: 'triangle', f0: 140, f1: 70, dur: 0.08, peak: 0.3 });
  pings(v, 12, 0.15, [2500, 6000], [3, 6], [0.004, 0.012], [0.08, 0.18], 1, 0.03); // crumbs
};

const metalCrumple: Builder = (v) => {
  v.tone({ f0: 110, f1: 45, dur: 0.22, peak: 0.6, attack: 0.002 });
  for (let i = 0; i < 11; i++) { // thin metal buckling: quick falling squeals + clanks
    const t = i * 0.045 + rnd(0, 0.025);
    const f = rnd(500, 1300);
    v.tone({ at: t, type: 'sawtooth', f0: f, f1: f * rnd(0.4, 0.7), dur: rnd(0.04, 0.09), peak: rnd(0.06, 0.12),
      filter: { type: 'bandpass', f0: rnd(800, 2200), q: 8 } });
    v.burst({ at: t, dur: rnd(0.02, 0.05), peak: rnd(0.15, 0.3), filter: { type: 'bandpass', f0: rnd(600, 2500), q: 7 } });
  }
};

const plasticCrack: Builder = (v) => {
  for (let i = 0; i < 3; i++) {
    v.burst({ at: i * 0.02, dur: rnd(0.005, 0.012), peak: 0.7 - i * 0.15, attack: 0.0003, filter: { type: 'highpass', f0: 2500 } });
  }
  v.tone({ f0: 1500, f1: 1100, dur: 0.04, peak: 0.12, type: 'triangle' });
  v.tone({ at: 0.004, f0: 2300, f1: 1700, dur: 0.035, peak: 0.1, type: 'triangle' });
  for (let i = 0; i < 5; i++) { // pieces tapping on the floor
    v.tone({ at: rnd(0.08, 0.28), type: 'square', f0: rnd(1800, 3000), dur: 0.005, peak: rnd(0.05, 0.1),
      filter: { type: 'bandpass', f0: 2400, q: 3 } });
  }
};

const liquidSplash: Builder = (v) => {
  v.burst({ kind: 'pink', dur: 0.55, peak: 0.5, attack: 0.012, filter: { type: 'bandpass', f0: 1600, f1: 650, q: 1 } });
  v.tone({ f0: 210, f1: 80, dur: 0.12, peak: 0.45 });
  for (let i = 0; i < 9; i++) { // bubbles
    const f = rnd(350, 1000);
    v.tone({ at: rnd(0.03, 0.5), f0: f, f1: f * 2.2, dur: rnd(0.03, 0.06), peak: rnd(0.06, 0.14), attack: 0.003 });
  }
  for (let i = 0; i < 8; i++) { // droplets
    const f = rnd(1500, 3200);
    v.tone({ at: rnd(0.1, 0.7), f0: f, f1: f * 1.8, dur: 0.02, peak: rnd(0.04, 0.09), attack: 0.002 });
  }
};

export const destruction = {
  'glass-shatter': glassShatter, 'ceramic-shatter': ceramicShatter, crunch, 'metal-crumple': metalCrumple,
  'plastic-crack': plasticCrack, 'liquid-splash': liquidSplash,
} satisfies Record<string, Builder>;
