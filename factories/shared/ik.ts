import type { Vec3 } from '../../engine/types';

export interface ArmDims { shoulderZ: number; upper: number; fore: number }
/** yaw about z; shoulder = upper-arm elevation from horizontal; elbow = bend (0 = straight, >0 bends down). */
export interface ArmPose { yaw: number; shoulder: number; elbow: number; reach: boolean }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Analytic 2-bone IK, elbow-up. `t` = wrist point relative to the arm base (base at z = 0). */
export function solveArm(t: Vec3, d: ArmDims): ArmPose {
  const yaw = Math.atan2(t[1], t[0]);
  const r = Math.hypot(t[0], t[1]);
  const h = t[2] - d.shoulderZ;
  const want = Math.hypot(r, h);
  const lo = Math.abs(d.upper - d.fore) + 1e-3;
  const hi = d.upper + d.fore - 1e-3;
  const L = clamp(want, lo, hi);
  const reach = want >= lo && want <= hi;
  const inner = Math.acos(clamp((d.upper ** 2 + d.fore ** 2 - L ** 2) / (2 * d.upper * d.fore), -1, 1));
  const elbow = Math.PI - inner;
  const shoulder = Math.atan2(h, r) + Math.acos(clamp((d.upper ** 2 + L ** 2 - d.fore ** 2) / (2 * d.upper * L), -1, 1));
  return { yaw, shoulder, elbow, reach };
}

/** Wrist point of a pose (inverse of solveArm for reachable targets). */
export function forwardArm(p: ArmPose, d: ArmDims): Vec3 {
  const er = Math.cos(p.shoulder) * d.upper;
  const eh = Math.sin(p.shoulder) * d.upper;
  const a = p.shoulder - p.elbow;
  const r = er + Math.cos(a) * d.fore;
  const h = eh + Math.sin(a) * d.fore;
  return [r * Math.cos(p.yaw), r * Math.sin(p.yaw), d.shoulderZ + h];
}
