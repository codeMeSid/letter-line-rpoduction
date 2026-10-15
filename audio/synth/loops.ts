import type { LoopName } from '../types';
import type { Builder, Voice } from './voice';

/**
 * Seamless loops. Noise comes from crossfaded loop buffers and oscillators/LFOs are periodic, so nothing
 * clicks at the wrap. Gain is controlled on the voice's `out` node by the provider.
 */

/** Noise → filter → level → out, with slow LFOs breathing the cutoff. */
function roar(v: Voice, kind: 'brown' | 'pink', hz: number, q: number, level: number, breathe: number[]): void {
  const f = v.biquad('lowpass', hz, q);
  v.chain(v.noiseSrc(kind), f, v.gain(level), v.out);
  breathe.forEach((r, i) => v.lfo(r, hz * (0.28 - i * 0.07), f.frequency));
}

const furnaceRoar: Builder = (v) => {
  roar(v, 'brown', 430, 0.9, 0.85, [0.31, 0.83]);
  const mid = v.biquad('bandpass', 950, 0.7);
  v.chain(v.noiseSrc('pink'), mid, v.gain(0.22), v.out);
  v.lfo(0.47, 260, mid.frequency);
  v.chain(v.osc('sine', 46), v.gain(0.3), v.out); // chest rumble
  v.chain(v.crackleSrc(), v.biquad('highpass', 1800), v.gain(0.5), v.out); // embers
};

const kilnRoar: Builder = (v) => {
  roar(v, 'brown', 520, 0.8, 0.8, [0.23, 0.61]);
  const mid = v.biquad('bandpass', 1400, 0.6);
  v.chain(v.noiseSrc('pink'), mid, v.gain(0.26), v.out);
  v.lfo(0.37, 380, mid.frequency);
  v.chain(v.osc('sine', 58), v.gain(0.26), v.out);
  v.chain(v.crackleSrc(), v.biquad('highpass', 2200), v.gain(0.32), v.out);
};

const lehrHum: Builder = (v) => {
  v.chain(v.osc('sine', 100), v.gain(0.3), v.out);
  v.chain(v.osc('sine', 200.4), v.gain(0.08), v.out);
  v.chain(v.osc('triangle', 50), v.gain(0.14), v.out);
  v.chain(v.noiseSrc('brown'), v.biquad('lowpass', 240), v.gain(0.6), v.out);
};

const conveyorHum: Builder = (v) => {
  v.chain(v.osc('sawtooth', 52), v.biquad('lowpass', 170), v.gain(0.22), v.out);
  v.chain(v.noiseSrc('brown'), v.biquad('lowpass', 420), v.gain(0.7), v.out);
  // belt-joint clicks: band-passed noise gated by a ~6 Hz LFO
  const gate = v.gain(0.55);
  v.lfo(6, 0.45, gate.gain);
  v.chain(v.noiseSrc('pink'), v.biquad('bandpass', 1900, 1.2), gate, v.gain(0.16), v.out);
};

const ovenHum: Builder = (v) => {
  v.chain(v.osc('sine', 120), v.gain(0.2), v.out);
  v.chain(v.osc('sine', 240.6), v.gain(0.08), v.out);
  const fan = v.biquad('bandpass', 900, 0.8);
  v.chain(v.noiseSrc('pink'), fan, v.gain(0.22), v.out); // fan
  v.lfo(0.19, 80, fan.frequency);
  v.chain(v.crackleSrc(), v.biquad('highpass', 3000), v.gain(0.12), v.out); // element ticks
};

const neonBuzz: Builder = (v) => {
  v.chain(v.osc('sawtooth', 120), v.biquad('lowpass', 1500), v.gain(0.07), v.out); // mains buzz
  v.chain(v.osc('square', 240.3), v.biquad('lowpass', 1200), v.gain(0.03), v.out);
  v.chain(v.osc('sine', 60), v.gain(0.09), v.out);
  v.chain(v.noiseSrc('white'), v.biquad('bandpass', 5200, 3), v.gain(0.06), v.out); // gas fizz
  const flick = v.gain(0.7);
  v.lfo(7.3, 0.3, flick.gain);
  v.chain(v.noiseSrc('pink'), v.biquad('bandpass', 2400, 4), flick, v.gain(0.05), v.out);
};

export const loops = {
  'furnace-roar': furnaceRoar, 'kiln-roar': kilnRoar, 'lehr-hum': lehrHum, 'conveyor-hum': conveyorHum,
  'oven-hum': ovenHum, 'neon-buzz': neonBuzz,
} satisfies Record<LoopName, Builder>;
