import type { Pace } from './types';

export interface PaceParams {
  /** speed follows typing WPM (Clock.speedMul) */
  wpm: boolean;
  /** fixed sim speed multiplier when !wpm */
  speedMul: number;
  /** jobs allowed past the queue at once */
  maxInFlight: number;
  /** camera locked to follow mode */
  lockFollow: boolean;
}

export const FAST_MUL = 1 / 0.35;

export function paceParams(p: Pace): PaceParams {
  switch (p) {
    case 'auto': return { wpm: true, speedMul: 1, maxInFlight: Infinity, lockFollow: false };
    case 'fast': return { wpm: false, speedMul: FAST_MUL, maxInFlight: Infinity, lockFollow: false };
    case 'detailed': return { wpm: false, speedMul: 1, maxInFlight: Infinity, lockFollow: false };
    case 'cinematic': return { wpm: false, speedMul: 1, maxInFlight: 1, lockFollow: true };
  }
}
