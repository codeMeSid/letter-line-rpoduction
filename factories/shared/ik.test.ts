import { describe, expect, it } from 'vitest';
import { forwardArm, solveArm, type ArmDims } from './ik';
import type { Vec3 } from '../../engine/types';

const D: ArmDims = { shoulderZ: 60, upper: 100, fore: 95 };

describe('solveArm', () => {
  it('reaches reachable targets (forward(solve(t)) = t)', () => {
    const targets: Vec3[] = [[120, 0, 60], [0, 90, 20], [-60, -80, 150], [30, 30, 100], [150, 40, 30]];
    for (const t of targets) {
      const p = solveArm(t, D);
      expect(p.reach).toBe(true);
      const w = forwardArm(p, D);
      for (let i = 0; i < 3; i++) expect(w[i]).toBeCloseTo(t[i], 6);
    }
  });
  it('clamps unreachable targets to full stretch along the target direction', () => {
    const p = solveArm([400, 0, 60], D);
    expect(p.reach).toBe(false);
    const w = forwardArm(p, D);
    expect(Math.hypot(w[0], w[1], w[2] - D.shoulderZ)).toBeCloseTo(D.upper + D.fore - 1e-3, 2);
    expect(w[1]).toBeCloseTo(0, 6);
  });
  it('elbow bends upward (elbow-up solution)', () => {
    const p = solveArm([100, 0, 60], D);
    expect(p.elbow).toBeGreaterThan(0);
    expect(p.shoulder).toBeGreaterThan(0);
  });
});
