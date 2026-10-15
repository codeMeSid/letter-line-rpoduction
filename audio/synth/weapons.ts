import { rnd, type Builder } from './voice';

/** Soft-clip curve so the blast has body instead of just being loud noise. */
function saturationCurve(): Float32Array<ArrayBuffer> {
  const n = 512;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * 2.4);
  return c;
}

/** Pump-action rack: slide rattle, then two distinct metal clicks (back, forward). */
const shotgunRack: Builder = (v) => {
  const click = (at: number, big: number) => {
    v.burst({ at, dur: 0.03 * big, peak: 0.4, filter: { type: 'bandpass', f0: 2200 / big, q: 5 } });
    v.tone({ at, type: 'square', f0: 900, f1: 380, dur: 0.02, peak: 0.07, filter: { type: 'lowpass', f0: 2500 } });
    v.tone({ at, f0: 190 / big, f1: 95 / big, dur: 0.05, peak: 0.4 * big, attack: 0.001 });
  };
  click(0, 1);
  v.burst({ at: 0.035, kind: 'pink', dur: 0.12, peak: 0.1, filter: { type: 'bandpass', f0: 1200, q: 1.5 }, grain: { depth: 0.6, hz: 80 } });
  click(0.17, 1.35);
  v.burst({ at: 0.18, dur: 0.07, peak: 0.1, filter: { type: 'bandpass', f0: 4600, q: 20 } }); // spring ring
};

const shotgunBlast: Builder = (v) => {
  const sat = v.ctx.createWaveShaper();
  sat.curve = saturationCurve();
  sat.connect(v.out);
  v.own(sat);
  const to = sat;
  v.burst({ dur: 0.04, peak: 0.9, attack: 0.0005, to, filter: { type: 'highpass', f0: 1800 } }); // crack
  v.burst({ dur: 0.5, peak: 0.85, attack: 0.001, to, filter: { type: 'lowpass', f0: 9000, f1: 600 } }); // blast
  v.tone({ f0: 135, f1: 34, dur: 0.5, peak: 0.95, attack: 0.001, to }); // thump
  v.burst({ kind: 'brown', dur: 0.65, peak: 0.7, attack: 0.002, to, filter: { type: 'lowpass', f0: 260 } }); // boom
  v.burst({ at: 0.05, dur: 1.15, peak: 0.22, attack: 0.02, filter: { type: 'lowpass', f0: 1800, f1: 250 } }); // room tail
};

const explosionFizz: Builder = (v) => {
  v.burst({ dur: 0.45, peak: 0.6, attack: 0.002, filter: { type: 'lowpass', f0: 2600, f1: 400 } });
  v.tone({ f0: 105, f1: 40, dur: 0.35, peak: 0.7, attack: 0.002 });
  for (let i = 0; i < 34; i++) { // fizzing sparks, thinning out over time
    const t = 0.05 + 0.85 * Math.pow(Math.random(), 1.6);
    v.burst({ at: t, dur: rnd(0.004, 0.012), peak: rnd(0.08, 0.22) * (1 - t * 0.7),
      filter: { type: 'bandpass', f0: rnd(3000, 8500), q: 6 } });
  }
};

export const weapons = {
  'shotgun-rack': shotgunRack, 'shotgun-blast': shotgunBlast, 'explosion-fizz': explosionFizz,
} satisfies Record<string, Builder>;
