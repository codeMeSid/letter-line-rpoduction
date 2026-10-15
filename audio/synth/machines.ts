import { rnd, type Builder } from './voice';

/** Raw-material and forming-side machine sounds. */

const pourSand: Builder = (v) => {
  v.burst({
    kind: 'pink', dur: 0.95, peak: 1.0, attack: 0.08, hold: 0.55, grain: { depth: 0.75, hz: 110 },
    filter: { type: 'bandpass', f0: 3200, f1: 2500, q: 0.5 }, filter2: { type: 'highpass', f0: 900 },
  });
  v.burst({ kind: 'brown', dur: 0.95, peak: 0.12, attack: 0.1, hold: 0.5, filter: { type: 'lowpass', f0: 700 } });
};

const mixerChurn: Builder = (v) => {
  v.tone({ type: 'sawtooth', f0: 52, f1: 58, dur: 1.3, peak: 0.22, attack: 0.15, hold: 0.8,
    filter: { type: 'lowpass', f0: 220 }, am: { rate: 5.5, depth: 0.35 } });
  v.burst({ kind: 'brown', dur: 1.3, peak: 0.5, attack: 0.15, hold: 0.8,
    filter: { type: 'lowpass', f0: 650, f1: 450 }, am: { rate: 3.7, depth: 0.4 } });
  v.burst({ kind: 'pink', dur: 1.3, peak: 0.16, attack: 0.2, hold: 0.7, grain: { depth: 0.6, hz: 40 },
    filter: { type: 'bandpass', f0: 1100, q: 0.8 } });
};

const gobShear: Builder = (v) => {
  v.burst({ dur: 0.03, peak: 0.45, filter: { type: 'highpass', f0: 3000 } });
  v.tone({ type: 'sawtooth', f0: 2100, f1: 650, dur: 0.07, peak: 0.16, filter: { type: 'bandpass', f0: 1800, q: 3 } });
  v.tone({ at: 0.005, type: 'triangle', f0: 160, f1: 70, dur: 0.1, peak: 0.45 });
  v.burst({ at: 0.04, dur: 0.04, peak: 0.12, filter: { type: 'bandpass', f0: 4200, q: 8 } }); // blade ring
};

const mouldClamp: Builder = (v) => {
  v.tone({ f0: 125, f1: 48, dur: 0.18, peak: 0.85, attack: 0.002 });
  v.burst({ dur: 0.1, peak: 0.5, filter: { type: 'bandpass', f0: 900, f1: 500, q: 4 } });
  v.tone({ at: 0.09, type: 'square', f0: 230, f1: 190, dur: 0.03, peak: 0.12, filter: { type: 'lowpass', f0: 1200 } });
  v.burst({ at: 0.09, dur: 0.06, peak: 0.35, filter: { type: 'bandpass', f0: 2600, q: 5 } }); // lock latch
  v.tone({ at: 0.095, f0: 1480, dur: 0.25, peak: 0.07 });
};

const airBlow: Builder = (v) => {
  v.burst({ dur: 0.75, peak: 0.6, attack: 0.12, hold: 0.25, grain: { depth: 0.25, hz: 90 },
    filter: { type: 'bandpass', f0: 1500, f1: 3600, q: 0.9 }, filter2: { type: 'highpass', f0: 700 } });
};

const cameraFlash: Builder = (v) => {
  // flash capacitor whine rising, then the pop
  v.tone({ f0: 2000, f1: 9500, dur: 0.3, peak: 0.07, attack: 0.05, hold: 0.2 });
  v.burst({ at: 0.3, dur: 0.14, peak: 0.55, attack: 0.001, filter: { type: 'highpass', f0: 2200 } });
  v.tone({ at: 0.3, f0: 210, f1: 80, dur: 0.09, peak: 0.45 });
  v.tone({ at: 0.3, f0: 3200, f1: 1800, dur: 0.06, peak: 0.1 });
};

const laserZap: Builder = (v) => {
  v.tone({ type: 'sawtooth', f0: 2600, f1: 170, dur: 0.2, peak: 0.2, attack: 0.001,
    filter: { type: 'bandpass', f0: 2200, f1: 400, q: 2.5 } });
  v.tone({ f0: 1300, f1: 90, dur: 0.18, peak: 0.28, attack: 0.001 });
  v.burst({ dur: 0.05, peak: 0.12, filter: { type: 'highpass', f0: 5000 } });
};

const rejectKick: Builder = (v) => {
  v.burst({ dur: 0.12, peak: 0.35, kind: 'pink', filter: { type: 'lowpass', f0: 1800, f1: 600 } }); // pneumatic psst
  v.tone({ f0: 150, f1: 58, dur: 0.17, peak: 0.7 });
  for (let i = 0; i < 4; i++) { // clatter as the part tumbles into the chute
    v.burst({ at: 0.05 + i * rnd(0.03, 0.05), dur: rnd(0.02, 0.05), peak: rnd(0.15, 0.28),
      filter: { type: 'bandpass', f0: rnd(1400, 3200), q: 6 } });
  }
};

export const machines = {
  'pour-sand': pourSand, 'mixer-churn': mixerChurn, 'gob-shear': gobShear, 'mould-clamp': mouldClamp,
  'air-blow': airBlow, 'camera-flash': cameraFlash, 'laser-zap': laserZap, 'reject-kick': rejectKick,
} satisfies Record<string, Builder>;
