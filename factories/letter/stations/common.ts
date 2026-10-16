import * as THREE from 'three';
import type { Looks } from '../../../engine/looks';
import type { StationCtx } from '../../../engine/station';
import type { Vec3 } from '../../../engine/types';
import { BELT_TOP } from '../../shared/dims';
import { disposeTree, hazardBand, housing } from '../../shared/parts';

/** Station-local z of the floor (local z = 0 is the belt top). */
export const FLOOR = -BELT_TOP;

export const ss = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Frame-rate independent ease of `v` toward `target`. */
export const ease = (v: number, target: number, dt: number, rate = 6) => v + (target - v) * Math.min(1, dt * rate);

/** The pedestal under the product: a paint housing from the floor to z = -3 standing on a hazard-striped plate (`band` w × d). */
export function stationBase(looks: Looks, w: number, d: number, band: [number, number] = [w + 10, d + 10]): THREE.Group {
  const g = new THREE.Group();
  const stripes = hazardBand(looks, band[0], band[1], 0.6);
  stripes.position.z = FLOOR;
  const body = housing(looks, w, d, -3 - FLOOR, 'paint', 2);
  body.position.z = FLOOR;
  g.add(stripes, body);
  return g;
}

/** Points on a z-axis helix centred at (x, y). */
export function helix(r: number, turns: number, z0: number, z1: number, x = 0, y = 0, perTurn = 10): Vec3[] {
  const n = Math.ceil(turns * perTurn);
  return Array.from({ length: n + 1 }, (_, i): Vec3 => {
    const a = (i / n) * turns * Math.PI * 2;
    return [x + Math.cos(a) * r, y + Math.sin(a) * r, z0 + ((z1 - z0) * i) / n];
  });
}

/** Station-local point → world point (particles live in world space). */
export const world = (ctx: StationCtx, x: number, y: number, z: number): Vec3 => [ctx.origin[0] + x, ctx.origin[1] + y, ctx.origin[2] + z];

/** World z of this station's floor (particles land there). */
export const floorZ = (ctx: StationCtx) => ctx.origin[2] + FLOOR;

/** Dispose every geometry under the station group and empty it. `keep` (cached geometry holders) are detached first, undisposed. */
export function teardown(group: THREE.Group, keep: THREE.Object3D[] = []): void {
  for (const k of keep) k.removeFromParent();
  for (const c of [...group.children]) disposeTree(c);
}

/** Edge-triggered one-shots: `once(key)` is true the first time per job (`reset()` in begin). */
export function oneShots() {
  const fired = new Set<string>();
  return {
    reset: () => fired.clear(),
    once(key: string) {
      if (fired.has(key)) return false;
      fired.add(key);
      return true;
    },
  };
}
