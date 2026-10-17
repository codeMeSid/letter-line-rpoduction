import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../engine/looks';
import { loopLength, patrolLoop, sampleLoop } from '../engine/patrol';
import type { Vec3 } from '../engine/types';
import { Workers } from './workers';
import { meshes } from './testkit';

const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
const loop = patrolLoop([0, -200, 0], [600, 0, 90], 45);
const edgeDist = (p: THREE.Vector3, lp: Vec3[]) => {
  let best = 1e9;
  for (let i = 0; i < lp.length; i++) {
    const a = lp[i];
    const b = lp[(i + 1) % lp.length];
    const abx = b[0] - a[0], aby = b[1] - a[1];
    const k = Math.max(0, Math.min(1, ((p.x - a[0]) * abx + (p.y - a[1]) * aby) / (abx * abx + aby * aby)));
    best = Math.min(best, Math.hypot(p.x - (a[0] + abx * k), p.y - (a[1] + aby * k)));
  }
  return best;
};
/** Arc position of a point on the loop. */
const arcOf = (p: THREE.Vector3, lp: Vec3[]) => {
  let best = 0, bd = 1e9;
  const L = loopLength(lp);
  for (let s = 0; s < L; s += 0.5) { const q = sampleLoop(lp, s).pos; const d = Math.hypot(q[0] - p.x, q[1] - p.y); if (d < bd) { bd = d; best = s; } }
  return best;
};

describe('Workers', () => {
  it('has 6 figures, all on the loop and spread out after the first update', () => {
    const w = new Workers(looks, loop);
    expect(w.figures).toHaveLength(6);
    w.update(0.5);
    const L = loopLength(loop);
    const arcs = w.figures.map((f) => arcOf(f.group.position, loop));
    for (const f of w.figures) expect(edgeDist(f.group.position, loop)).toBeLessThan(0.01);
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
      const d = Math.abs(arcs[i] - arcs[j]);
      expect(Math.min(d, L - d)).toBeGreaterThan(50);
    }
  });
  it('walkers face the way they move; exactly two move against the loop direction', () => {
    const w = new Workers(looks, loop);
    w.update(0.5);
    const before = w.figures.map((f) => f.group.position.clone());
    const L = loopLength(loop);
    const arc0 = w.figures.map((f) => arcOf(f.group.position, loop));
    w.update(0.2);
    let against = 0;
    w.figures.forEach((f, i) => {
      const d = f.group.position.clone().sub(before[i]);
      const face = new THREE.Vector3(Math.cos(f.group.rotation.z), Math.sin(f.group.rotation.z), 0);
      expect(d.dot(face)).toBeGreaterThan(0);
      let da = arcOf(f.group.position, loop) - arc0[i];
      da -= L * Math.round(da / L);
      if (da < 0) against++;
    });
    expect(against).toBe(2);
  });
  it('stops to inspect: stands still >= 1.5 s facing the line with the arm raised', () => {
    const w = new Workers(looks, loop);
    const run = new Array(6).fill(0);
    const last = w.figures.map((f) => f.group.position.clone());
    let best = 0;
    for (let t = 0; t < 30; t += 1 / 30) {
      w.update(1 / 30);
      w.figures.forEach((f, i) => {
        const still = f.group.position.distanceTo(last[i]) < 1e-9;
        const raised = f.group.getObjectByName('shoulder-r')!.rotation.y < -2;
        run[i] = still && raised ? run[i] + 1 / 30 : 0;
        if (run[i] > best) { best = run[i]; expect(f.group.rotation.z).toBeCloseTo(Math.PI / 2, 6); }
        last[i].copy(f.group.position);
      });
    }
    expect(best).toBeGreaterThanOrEqual(1.5);
  });
  it('setLoop moves them onto the new loop; dispose detaches', () => {
    const w = new Workers(looks, loop);
    const next = patrolLoop([1000, 100, 0], [1400, 300, 90], 45);
    w.setLoop(next);
    for (const f of w.figures) expect(edgeDist(f.group.position, next)).toBeLessThan(0.01);
    const holder = new THREE.Group();
    holder.add(w.group);
    w.dispose();
    expect(w.group.parent).toBeNull();
  });
  it('every mesh is role-tagged', () => {
    const w = new Workers(looks, loop);
    for (const m of meshes(w.group)) expect(m.userData.role).toBeTruthy();
  });
});
