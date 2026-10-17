import type { ProductKind, Vec3 } from './types';

export const ROAD = 160;        // road between neighbouring plots
/** Plot left edge → factory origin. The `all` layout's left U-turn sits 30 left of the origin, plus the 70 floor pad. */
export const PAD_LEFT = 110;
export const PAD_RIGHT = 260;   // last machine/shelf → plot right edge (forklift dock)
export const SITE_SIZE: [number, number] = [900, 700]; // unbuilt plot (construction site)
/** Construction sites span y SITE_Y0 .. SITE_Y0 + SITE_SIZE[1] (about the band the built floors cover). */
export const SITE_Y0 = -560;
export const FLIGHT_MS = 2400;

export interface PlotSpec { kind: ProductKind; width: number; built: boolean }
export interface Plot { kind: ProductKind; x0: number; x1: number; built: boolean; origin: Vec3 }
export interface Pose { target: Vec3; extent: number }

/** Plots side by side along +x in the given order, ROAD apart; the factory origin sits PAD_LEFT in from the plot edge. */
export function campusLayout(specs: readonly PlotSpec[]): Plot[] {
  const out: Plot[] = [];
  let x = 0;
  for (const s of specs) {
    out.push({ kind: s.kind, x0: x, x1: x + s.width, built: s.built, origin: [x + PAD_LEFT, 0, 0] });
    x += s.width + ROAD;
  }
  return out;
}

const ss = (t: number) => t * t * (3 - 2 * t);
const mix = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** Camera flight, u = 0..1: pull out on A (first 25%), pan A→B at `wide` (middle 50%), push in on B (last 25%). */
export function flightPose(u: number, a: Pose, b: Pose, wide: number): Pose {
  const t = Math.min(1, Math.max(0, u));
  if (t < 0.25) return { target: [...a.target], extent: a.extent + (wide - a.extent) * ss(t / 0.25) };
  if (t < 0.75) return { target: mix(a.target, b.target, ss((t - 0.25) / 0.5)), extent: wide };
  return { target: [...b.target], extent: wide + (b.extent - wide) * ss((t - 0.75) / 0.25) };
}
