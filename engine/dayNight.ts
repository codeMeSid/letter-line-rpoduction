import type { Vec3 } from './types';

export const DAY_SECONDS = 120;   // one full day, real time
export const DAY_SHARE = 0.6;     // u in [0, DAY_SHARE) is day
export const NOON = DAY_SHARE / 2;
const TWILIGHT = 0.05;            // u-width of the dusk/dawn blend on each side of an edge

const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
/** Today's fixed sun (engine/stage.ts): noon must reproduce it exactly. */
export const SUN_NOON: Vec3 = norm([-0.45, -0.6, 1]);
export const SUN_COLOR = 0xfff4e6;
const DAWN_COLOR = 0xffa463;
const MOON_COLOR = 0x9fb4ff;
const MOON_DIR: Vec3 = norm([0.35, -0.7, 0.8]);
const MOON_SCALE = 0.25;
const NIGHT_HEMI = 0.35;
const NOON_AZ = Math.atan2(SUN_NOON[1], SUN_NOON[0]);
const NOON_EL = Math.asin(SUN_NOON[2]);
const LOW_EL = (8 * Math.PI) / 180;
const SWEEP = Math.PI * 0.45;     // azimuth swing either side of noon (left in the morning, right in the evening)

export interface Sky {
  sunDir: Vec3;      // unit, target → light
  sunColor: number;  // hex
  sunScale: number;  // × the look's sun intensity
  hemiScale: number; // × the look's hemisphere intensity
  night: number;     // 0 day … 1 night
}

const ss = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function mixHex(a: number, b: number, k: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 0 by day, 1 by night; 0.5 exactly at dusk (u = DAY_SHARE) and dawn (u = 0 ≡ 1); C1 across both edges. */
function nightness(u: number): number {
  if (u < DAY_SHARE) return 0.5 * (1 - ss(0, TWILIGHT, Math.min(u, DAY_SHARE - u)));
  return 0.5 + 0.5 * ss(0, TWILIGHT, Math.min(u - DAY_SHARE, 1 - u));
}

/** Sky at day-phase u in [0, 1). */
export function skyAt(u: number): Sky {
  const w = ((u % 1) + 1) % 1;
  // sun progress through the day; on the night side it stays parked at the nearer edge (dusk 1, dawn 0)
  const d = w < DAY_SHARE ? w / DAY_SHARE : w - DAY_SHARE < 1 - w ? 1 : 0;
  const arc = Math.sin(Math.PI * d);
  const az = NOON_AZ + (d - 0.5) * 2 * SWEEP;
  const el = LOW_EL + (NOON_EL - LOW_EL) * arc;
  const day: Vec3 = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  const dayScale = 0.4 + 0.6 * arc;
  const dayHemi = 0.75 + 0.25 * arc;
  const n = nightness(w);
  return {
    sunDir: n === 0 ? day : norm([day[0] + (MOON_DIR[0] - day[0]) * n, day[1] + (MOON_DIR[1] - day[1]) * n, day[2] + (MOON_DIR[2] - day[2]) * n]),
    sunColor: mixHex(mixHex(DAWN_COLOR, SUN_COLOR, arc), MOON_COLOR, n),
    sunScale: dayScale + (MOON_SCALE - dayScale) * n,
    hemiScale: dayHemi + (NIGHT_HEMI - dayHemi) * n,
    night: n,
  };
}

/** Sky `sec` real seconds after load; the cycle starts at noon. `on = false` holds noon. */
export function skyAtTime(sec: number, on: boolean): Sky {
  return skyAt(on ? NOON + sec / DAY_SECONDS : NOON);
}
