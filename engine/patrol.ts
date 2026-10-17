import type { Vec3 } from './types';

/** Closed loop (front-left → front-right → back-right → back-left) around [min, max] inflated by `margin`, at height z. */
export function patrolLoop(min: Vec3, max: Vec3, margin: number, z = 0): Vec3[] {
  const x0 = min[0] - margin, x1 = max[0] + margin, y0 = min[1] - margin, y1 = max[1] + margin;
  return [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
}

const segLen = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

export function loopLength(pts: readonly Vec3[]): number {
  let L = 0;
  for (let i = 0; i < pts.length; i++) L += segLen(pts[i], pts[(i + 1) % pts.length]);
  return L;
}

/** Position and heading (atan2 of the travel direction in xy) at arc length s along the closed loop; s wraps, negative is fine. */
export function sampleLoop(pts: readonly Vec3[], s: number): { pos: Vec3; heading: number } {
  const L = loopLength(pts);
  let r = ((s % L) + L) % L;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const seg = segLen(a, b);
    if (r < seg || i === pts.length - 1) {
      const k = seg > 0 ? Math.min(1, r / seg) : 0;
      return { pos: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k], heading: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
    r -= seg;
  }
  return { pos: [...pts[0]], heading: 0 };
}
