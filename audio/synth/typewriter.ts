import { rnd, type Builder } from './voice';

/**
 * Mechanical typewriter key: type-bar strike (sharp click) + frame ring (high-Q band-passed noise and two
 * inharmonic partials) + key bottoming out (low thock) + platen rebound tick. Randomised ±6% per strike.
 */
const keyClack: Builder = (v) => {
  const k = rnd(0.94, 1.06);
  v.burst({ dur: 0.012, peak: 0.5, attack: 0.0005, filter: { type: 'highpass', f0: 3200 * k } });
  v.burst({ at: 0.001, dur: 0.05, peak: 0.42, filter: { type: 'bandpass', f0: 2300 * k, f1: 1500 * k, q: 7 } });
  v.tone({ at: 0.001, f0: 3380 * k, dur: 0.035, peak: 0.06 });
  v.tone({ at: 0.001, f0: 2150 * k, dur: 0.045, peak: 0.07 });
  v.tone({ at: 0.002, type: 'triangle', f0: 190 * k, f1: 82 * k, dur: 0.065, peak: 0.55, attack: 0.001 });
  v.burst({ at: 0.022, kind: 'pink', dur: 0.03, peak: 0.26, filter: { type: 'lowpass', f0: 1500 } });
  v.tone({ at: 0.03, type: 'square', f0: 900 * k, f1: 600 * k, dur: 0.012, peak: 0.04 });
};

/** Small bell partials (hand-bell / typewriter margin bell): ratios of a struck bar. */
const BELL = [1, 2.76, 5.4, 8.93] as const;

const ding: Builder = (v) => {
  const f = 2350;
  v.burst({ dur: 0.01, peak: 0.25, filter: { type: 'highpass', f0: 4000 } }); // striker tick
  BELL.forEach((r, i) => {
    v.tone({ f0: f * r, dur: 1.5 / (1 + i * 0.9), peak: 0.3 / (1 + i * 0.7), attack: 0.001 });
  });
  v.tone({ f0: f * 1.004, dur: 1.3, peak: 0.16, attack: 0.001 }); // beating pair
};

const factoryBell: Builder = (v) => {
  const f = 480;
  v.burst({ dur: 0.02, peak: 0.25, filter: { type: 'bandpass', f0: 1800, q: 1.5 } }); // clapper
  const partials: Array<[number, number, number]> = [ // ratio, level, decay s
    [0.5, 0.17, 2.8], [1, 0.22, 2.6], [1.19, 0.12, 2.2], [1.5, 0.11, 1.8],
    [2, 0.12, 1.5], [2.5, 0.08, 1.0], [3.01, 0.07, 0.8], [4.1, 0.05, 0.5],
  ];
  for (const [r, a, d] of partials) v.tone({ f0: f * r, dur: d, peak: a, attack: 0.002 });
  v.tone({ f0: f * 1.006, dur: 2.4, peak: 0.11, attack: 0.002 }); // slow beating
};

export const typewriter = { 'key-clack': keyClack, ding, 'factory-bell': factoryBell } satisfies Record<string, Builder>;
