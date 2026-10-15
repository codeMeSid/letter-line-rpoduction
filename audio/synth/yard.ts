import type { Builder } from './voice';

/** Floor-level / traffic sounds: broom, forklift, whoosh. */

const broomSweep: Builder = (v) => {
  v.burst({ kind: 'pink', dur: 0.8, peak: 0.9, attack: 0.28, hold: 0.1, grain: { depth: 0.7, hz: 130 },
    filter: { type: 'bandpass', f0: 2600, f1: 1800, q: 0.8 }, filter2: { type: 'highpass', f0: 1000 } });
  v.burst({ kind: 'brown', dur: 0.8, peak: 0.2, attack: 0.3, filter: { type: 'lowpass', f0: 500 } });
};

const forkliftBeep: Builder = (v) => {
  for (const at of [0, 0.36]) {
    v.tone({ at, type: 'square', f0: 1000, dur: 0.18, peak: 0.32, attack: 0.004, hold: 0.15,
      filter: { type: 'lowpass', f0: 3800 } });
  }
};

const forkliftMotor: Builder = (v) => {
  v.tone({ type: 'sawtooth', f0: 40, f1: 56, dur: 1.1, peak: 0.3, attack: 0.1, hold: 0.7,
    filter: { type: 'lowpass', f0: 380 }, am: { rate: 14, depth: 0.3 } });
  v.tone({ type: 'sawtooth', f0: 80, f1: 112, dur: 1.1, peak: 0.1, attack: 0.1, hold: 0.7,
    filter: { type: 'lowpass', f0: 600 }, am: { rate: 14, depth: 0.3 } });
  v.burst({ kind: 'brown', dur: 1.1, peak: 0.3, attack: 0.1, hold: 0.7, filter: { type: 'lowpass', f0: 260 } });
};

const whoosh: Builder = (v) => {
  v.burst({ kind: 'pink', dur: 0.65, peak: 1.2, attack: 0.26, filter: { type: 'bandpass', f0: 450, via: [[0.26, 2200]], f1: 700, q: 1.1 } });
};

export const yard = {
  'broom-sweep': broomSweep, 'forklift-beep': forkliftBeep, 'forklift-motor': forkliftMotor, whoosh,
} satisfies Record<string, Builder>;
