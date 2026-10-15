import { rnd, type Builder } from './voice';

/** Filling / finishing / handling sounds. */

const waterJet: Builder = (v) => {
  v.burst({ dur: 0.55, peak: 0.34, attack: 0.04, hold: 0.35, grain: { depth: 0.3, hz: 120 },
    filter: { type: 'bandpass', f0: 3000, q: 0.8 }, filter2: { type: 'highpass', f0: 1500 } });
  v.burst({ kind: 'pink', dur: 0.55, peak: 0.14, attack: 0.05, hold: 0.3, filter: { type: 'lowpass', f0: 700 } });
};

const fillerPour: Builder = (v) => {
  // stream into a bottle: pitch of the cavity resonance rises as it fills, with glugs
  v.burst({ kind: 'pink', dur: 1.05, peak: 0.4, attack: 0.05, hold: 0.8, grain: { depth: 0.5, hz: 70 },
    filter: { type: 'bandpass', f0: 700, f1: 1700, q: 1.2 } });
  v.tone({ f0: 300, f1: 900, dur: 1.0, peak: 0.12, attack: 0.05, hold: 0.7, am: { rate: 9, depth: 0.4 } });
  for (let i = 0; i < 9; i++) { // bubbles: short upward chirps
    const f = rnd(450, 1100);
    v.tone({ at: rnd(0.05, 0.95), f0: f, f1: f * 2, dur: 0.035, peak: rnd(0.08, 0.16), attack: 0.003 });
  }
};

const capPress: Builder = (v) => {
  v.burst({ dur: 0.035, peak: 0.4, filter: { type: 'bandpass', f0: 2500, q: 2 } });
  v.tone({ f0: 320, f1: 140, dur: 0.05, peak: 0.45 });
  v.burst({ at: 0.015, kind: 'pink', dur: 0.09, peak: 0.12, filter: { type: 'bandpass', f0: 1500, q: 1 } }); // thread
  v.tone({ at: 0.035, f0: 1800, f1: 1500, dur: 0.02, peak: 0.07, type: 'square', filter: { type: 'lowpass', f0: 3000 } });
};

const labelerWrap: Builder = (v) => {
  v.tone({ at: 0, f0: 3000, f1: 1500, dur: 0.01, peak: 0.12, type: 'square' }); // tick
  v.burst({ at: 0.02, dur: 0.38, peak: 0.35, attack: 0.05, hold: 0.2, grain: { depth: 0.5, hz: 90 },
    filter: { type: 'highpass', f0: 2500 }, filter2: { type: 'lowpass', f0: 8000 } });
  v.tone({ at: 0.02, type: 'triangle', f0: 170, f1: 210, dur: 0.38, peak: 0.07, attack: 0.04, hold: 0.2,
    vibrato: { rate: 24, depth: 6 } }); // roller whirr
  v.burst({ at: 0.4, dur: 0.02, peak: 0.15, filter: { type: 'bandpass', f0: 2200, q: 3 } }); // smoothing pat
};

const coderTick: Builder = (v) => {
  for (let i = 0; i < 7; i++) { // inkjet / dot-matrix chirps
    v.tone({ at: i * 0.014, type: 'square', f0: 3000 + (i % 3) * 400, dur: 0.008, peak: 0.25,
      filter: { type: 'bandpass', f0: 3400, q: 2 } });
  }
};

const robotServo: Builder = (v) => {
  const via = [[0.2, 560]] as const;
  v.tone({ type: 'sawtooth', f0: 300, via, f1: 340, dur: 0.58, peak: 0.3, attack: 0.04, hold: 0.35,
    filter: { type: 'lowpass', f0: 2400 }, am: { rate: 28, depth: 0.18 } });
  v.tone({ type: 'triangle', f0: 600, via: [[0.2, 1120]], f1: 680, dur: 0.58, peak: 0.18, attack: 0.04, hold: 0.35 });
  v.burst({ dur: 0.58, peak: 0.1, attack: 0.05, hold: 0.3, filter: { type: 'bandpass', f0: 2600, q: 3 } }); // gears
};

const motorWhir: Builder = (v) => {
  v.tone({ type: 'sawtooth', f0: 70, f1: 230, dur: 0.7, peak: 0.32, attack: 0.05, hold: 0.4,
    filter: { type: 'lowpass', f0: 900 }, am: { rate: 30, depth: 0.2 } });
  v.tone({ type: 'square', f0: 140, f1: 460, dur: 0.7, peak: 0.05, attack: 0.05, hold: 0.4,
    filter: { type: 'lowpass', f0: 1400 } });
  v.burst({ dur: 0.7, peak: 0.1, attack: 0.1, hold: 0.4, filter: { type: 'bandpass', f0: 1200, f1: 2600, q: 2 } });
};

const pressThump: Builder = (v) => {
  v.tone({ f0: 95, f1: 34, dur: 0.3, peak: 0.95, attack: 0.002 });
  v.burst({ kind: 'brown', dur: 0.22, peak: 0.55, filter: { type: 'lowpass', f0: 320 } });
  v.burst({ dur: 0.04, peak: 0.25, filter: { type: 'bandpass', f0: 1500, q: 2 } });
};

const hiss: Builder = (v) => {
  v.burst({ dur: 0.85, peak: 0.28, attack: 0.02, hold: 0.45,
    filter: { type: 'highpass', f0: 3500 }, filter2: { type: 'bandpass', f0: 7000, f1: 5000, q: 0.6 } });
};

const bendSqueak: Builder = (v) => {
  v.tone({ type: 'sawtooth', f0: 900, via: [[0.12, 1550]], f1: 1100, dur: 0.32, peak: 0.5, attack: 0.02,
    filter: { type: 'bandpass', f0: 1300, q: 3 }, vibrato: { rate: 33, depth: 40 } });
  v.burst({ dur: 0.3, peak: 0.12, attack: 0.03, grain: { depth: 0.7, hz: 60 }, filter: { type: 'bandpass', f0: 2400, q: 6 } });
};

const injectionThunk: Builder = (v) => {
  v.tone({ f0: 115, f1: 52, dur: 0.14, peak: 0.85, attack: 0.002 });
  v.burst({ kind: 'brown', dur: 0.1, peak: 0.4, filter: { type: 'lowpass', f0: 520 } });
  v.burst({ dur: 0.05, peak: 0.3, filter: { type: 'bandpass', f0: 700, q: 3 } });
  v.burst({ at: 0.08, dur: 0.32, peak: 0.15, attack: 0.01, filter: { type: 'highpass', f0: 3000 } }); // pressure release
};

export const process = {
  'water-jet': waterJet, 'filler-pour': fillerPour, 'cap-press': capPress, 'labeler-wrap': labelerWrap,
  'coder-tick': coderTick, 'robot-servo': robotServo, 'motor-whir': motorWhir, 'press-thump': pressThump,
  hiss, 'bend-squeak': bendSqueak, 'injection-thunk': injectionThunk,
} satisfies Record<string, Builder>;
