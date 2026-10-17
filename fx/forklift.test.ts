import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../engine/looks';
import type { ProductHandle } from '../engine/product';
import type { Vec3 } from '../engine/types';
import { Forklift } from './forklift';
import { fakeAudio, meshes } from './testkit';

const PARK: Vec3 = [1200, -500, 0];
const DOOR: Vec3 = [1310, -500, 0];
const END: Vec3 = [900, -440, 18];

function mk(over: { onLift?: boolean } = {}) {
  const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
  const { audio, plays } = fakeAudio();
  const fk = new Forklift(looks, audio, PARK, DOOR);
  const h = { root: new THREE.Group(), disposed: false, restyled: 0, shape() {}, place() {}, restyle() { h.restyled++; }, dispose() { h.disposed = true; } };
  h.root.add(new THREE.Mesh(new THREE.BoxGeometry(26, 8, 32)));
  h.root.position.set(END[0] - 100, END[1] - 15, END[2]);
  const plank = looks.part(new THREE.BoxGeometry(500, 22, 4), 'wood');
  plank.position.set(END[0] - 250, END[1], END[2] - 2);
  const group = new THREE.Group();
  group.add(plank, h.root);
  let geomDisposed = 0;
  plank.geometry.addEventListener('dispose', () => geomDisposed++);
  const state = { lifts: 0, liftAt: -1, t: 0 };
  const handle: ProductHandle = h;
  fk.fetch(() => END, () => { state.lifts++; state.liftAt = state.t; return over.onLift === false ? null : { group, handles: [handle] }; }, END[2] + 32); // other rows' product tops
  const run = (s: number, speed = 1, each?: () => void) => {
    for (let t = 0; t < s - 1e-9; t += 1 / 60) { state.t += 1 / 60 / speed; fk.update(1 / 60, speed); each?.(); }
  };
  /** Seconds until idle again (simulated at 1 / 60 s real steps at `speed`). */
  const trip = (speed = 1) => {
    let n = 0;
    while (fk.busy && n < 60 * 40) { fk.update(1 / 60, speed); n++; }
    return n / 60;
  };
  return { fk, plays, h, plank, group, state, run, trip, geomDisposed: () => geomDisposed, looks };
}
const dist = (fk: Forklift, p: Vec3) => Math.hypot(fk.truck.position.x - p[0], fk.truck.position.y - p[1]);
const worldZ = (o: THREE.Object3D) => { o.updateWorldMatrix(true, false); return o.getWorldPosition(new THREE.Vector3()).z; };

describe('Forklift', () => {
  it('parks facing -x; fetch makes it busy; onLift is called once after 3-4 s at speed 1', () => {
    const t = mk();
    expect(t.fk.busy).toBe(true);
    expect(dist(t.fk, PARK)).toBeLessThan(1e-6);
    t.run(2.5);
    expect(t.state.lifts).toBe(0);
    t.run(1.5);
    expect(t.state.lifts).toBe(1);
    expect(t.state.liftAt).toBeGreaterThan(2.8);
    expect(t.state.liftAt).toBeLessThan(4);
    t.run(12);
    expect(t.state.lifts).toBe(1);
  });
  it('inserts the forks under the plank end (fork base 6 past it), then the load rides the carriage up at least 10', () => {
    const t = mk();
    while (t.state.lifts === 0) t.run(1 / 60);
    // at lift start: forks aligned with the row (y) and 6 past its end (x), facing -x
    expect(t.fk.truck.position.x).toBeCloseTo(END[0] + 6, 3);
    expect(t.fk.truck.position.y).toBeCloseTo(END[1], 3);
    expect(Math.cos(t.fk.truck.rotation.z)).toBeCloseTo(1, 4);
    expect(t.group.parent).toBe(t.fk.group.getObjectByName('forks')); // the load is on the forks
    expect(t.fk.group.getObjectByName('forks')!.parent!.parent).toBe(t.fk.truck);
    const z0 = worldZ(t.plank);
    t.run(0.7);
    expect(worldZ(t.plank) - z0).toBeGreaterThanOrEqual(10);
    expect(worldZ(t.plank) - z0).toBeLessThan(60);
  });
  it('the forks slide under the plank end without touching it or its posts, 84 long', () => {
    const t = mk();
    while (t.state.lifts === 0) t.run(1 / 60);
    const carriage = t.fk.group.getObjectByName('carriage')!;
    const local = (m: THREE.Mesh) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox!; };
    const forks = carriage.children.find((c) => (c as THREE.Mesh).isMesh && local(c as THREE.Mesh).min.x < -80) as THREE.Mesh;
    expect(forks).toBeDefined();
    forks.updateWorldMatrix(true, false);
    const pos = forks.geometry.attributes.position;
    const v = new THREE.Vector3();
    let under = 0;
    let minX = 1e9;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(forks.matrixWorld);
      minX = Math.min(minX, v.x);
      if (v.x >= END[0]) continue; // behind the plank end: the heel shank and the carriage
      under++;
      expect(v.z).toBeLessThanOrEqual(14 + 1e-6); // below the plank underside (plank 14..18)
      expect(v.z).toBeGreaterThan(11);            // and close to it
      expect(Math.abs(v.y - END[1])).toBeLessThan(11); // inside the plank depth
      const inPost = v.x > END[0] - 5 && v.y > END[1] + 6 && v.y < END[1] + 10; // the end post (r 2, at the back of the plank)
      expect(inPost).toBe(false);
    }
    expect(under).toBeGreaterThan(20);
    expect(END[0] - minX).toBeCloseTo(84, 3);
  });
  it('never turns: the heading stays -x for the whole trip, and the forks face the shelf throughout', () => {
    const t = mk();
    let n = 0;
    t.run(16, 1, () => { n++; expect(t.fk.truck.rotation.z).toBe(0); });
    expect(n).toBeGreaterThan(500);
    expect(t.fk.busy).toBe(false);
  });
  it('raises the load to the travel height (plank underside 6 above the other rows\' product tops) and keeps it there until shed; no lowering', () => {
    const t = mk();
    while (t.state.lifts === 0) t.run(1 / 60);
    const z0 = worldZ(t.plank);
    const want = END[2] + 32 + 6 - (END[2] - 4); // rise that puts the underside at product top + 6
    let reached = false;
    let minAfter = 1e9;
    let maxRise = 0;
    t.run(16, 1, () => {
      if (!t.group.parent || t.h.disposed) return;
      const rise = worldZ(t.plank) - z0;
      maxRise = Math.max(maxRise, rise);
      if (rise > want - 0.1) reached = true;
      if (reached) minAfter = Math.min(minAfter, rise);
    });
    expect(reached).toBe(true);
    expect(minAfter).toBeGreaterThan(want - 0.1);
    expect(maxRise).toBeLessThan(want + 0.1);
  });
  it('carried products pass under the door lintel (z 110) when they cross the door line', () => {
    const t = mk();
    let crossed = 0;
    const box = new THREE.Box3();
    t.run(16, 1, () => {
      if (!t.group.parent || t.h.disposed) return;
      t.h.root.updateWorldMatrix(true, true);
      box.setFromObject(t.h.root);
      if (box.min.x <= DOOR[0] && box.max.x >= DOOR[0]) { crossed++; expect(box.max.z).toBeLessThan(110); }
    });
    expect(crossed).toBeGreaterThan(10);
  });
  it('plays the motor and the reversing beep', () => {
    const t = mk();
    t.run(14);
    expect(t.plays).toContain('forklift-motor');
    expect(t.plays).toContain('forklift-beep');
    expect(t.plays.filter((p) => p === 'forklift-motor').length).toBeGreaterThanOrEqual(2);
  });
  it('drives the load out the dock door, disposes it, and is back at park, idle', () => {
    const t = mk();
    let maxX = -1e9;
    let carried = true;
    t.run(14, 1, () => {
      maxX = Math.max(maxX, t.fk.truck.position.x);
      if (t.h.disposed && t.group.parent) carried = false; // disposed while still attached would be a leak
    });
    expect(maxX).toBeGreaterThan(DOOR[0] + 200); // 220 beyond the door
    expect(t.h.disposed).toBe(true);
    expect(t.group.parent).toBeNull();
    expect(t.geomDisposed()).toBe(1); // the plank geometry, once
    expect(carried).toBe(true);
    expect(t.fk.busy).toBe(false);
    expect(dist(t.fk, PARK)).toBeLessThan(1);
    expect(t.fk.truck.rotation.z).toBe(0); // never turned
    expect(t.fk.truck.position.z).toBe(0);
  });
  it('the whole trip takes about 10 s at speed 1 and a third of that at speed 3', () => {
    const a = mk();
    const t1 = a.trip(1);
    const b = mk();
    const t3 = b.trip(3);
    expect(t1).toBeGreaterThan(8);
    expect(t1).toBeLessThan(12.5);
    expect(t3 / t1).toBeGreaterThan(0.3);
    expect(t3 / t1).toBeLessThan(0.38);
    expect(b.h.disposed).toBe(true);
    expect(dist(b.fk, PARK)).toBeLessThan(1);
  });
  it('onLift returning null (row vanished) backs out and parks without throwing; nothing is carried or disposed', () => {
    const t = mk({ onLift: false });
    expect(() => t.run(14)).not.toThrow();
    expect(t.state.lifts).toBe(1);
    expect(t.fk.busy).toBe(false);
    expect(dist(t.fk, PARK)).toBeLessThan(1);
    expect(t.h.disposed).toBe(false);
    expect(t.group.parent).toBeNull();
    expect(Math.cos(t.fk.truck.rotation.z)).toBeGreaterThan(0.9999);
  });
  it('a target that disappears before the lift sends it home without calling onLift', () => {
    const t = mk();
    let gone = false;
    t.fk.dispose(); // fresh fork lift below
    const looks = t.looks;
    const { audio } = fakeAudio();
    const fk = new Forklift(looks, audio, PARK, DOOR);
    let lifts = 0;
    fk.fetch(() => (gone ? null : END), () => { lifts++; return null; });
    for (let i = 0; i < 60; i++) fk.update(1 / 60, 1);
    gone = true;
    for (let i = 0; i < 60 * 12 && fk.busy; i++) fk.update(1 / 60, 1);
    expect(lifts).toBe(0);
    expect(fk.busy).toBe(false);
    expect(dist(fk, PARK)).toBeLessThan(1);
  });
  it('follows a moving target: the plank end may still be gliding when the forklift arrives', () => {
    const t = mk();
    t.fk.dispose();
    const { audio } = fakeAudio();
    const fk = new Forklift(t.looks, audio, PARK, DOOR);
    const end: Vec3 = [900, -440, 18];
    let atLift: Vec3 | null = null;
    let endAtLift = 0;
    fk.fetch(() => end, () => { atLift = [fk.truck.position.x, fk.truck.position.y, 0]; endAtLift = end[1]; return null; });
    for (let i = 0; i < 60 * 20 && fk.busy; i++) { end[1] = Math.min(-400, end[1] + 0.2); fk.update(1 / 60, 1); }
    expect(atLift).not.toBeNull();
    expect(endAtLift).toBeGreaterThan(-440); // the plank was still gliding (it moves 40 in all) when the forks went in
    expect(endAtLift).toBeLessThan(-400);
    expect(Math.abs(atLift![1] - endAtLift)).toBeLessThan(0.5); // lined up with where the plank was at that moment
  });
  it('every mesh is role-tagged and a seated driver in a hard hat is present', () => {
    const t = mk();
    for (const m of meshes(t.fk.group)) expect(m.userData.role).toBeTruthy();
    const roles = new Set(meshes(t.fk.group).map((m) => m.userData.role));
    for (const r of ['paint-accent', 'paint', 'steel', 'rubber', 'copper', 'sand']) expect(roles.has(r)).toBe(true);
    const head = t.fk.group.getObjectByName('head')!;
    expect(head).toBeDefined();
    const seat = new THREE.Vector3();
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(seat);
    expect(seat.z).toBeGreaterThan(48); // seated on the cab, under the overhead guard
    expect(seat.z).toBeLessThan(62);
    const hip = t.fk.group.getObjectByName('hip-l')!;
    hip.updateWorldMatrix(true, false);
    const knee = t.fk.group.getObjectByName('knee-l')!;
    knee.updateWorldMatrix(true, false);
    // the driver faces the forks: knees are on the -x side of the hips
    expect(knee.getWorldPosition(new THREE.Vector3()).x).toBeLessThan(hip.getWorldPosition(new THREE.Vector3()).x - 5);
  });
  it('has a mast, a moving carriage with two forks, an overhead guard, wheels that turn with distance, and a beacon that blinks only while busy', () => {
    const t = mk();
    const lit = () => meshes(t.fk.group).some((m) => m.userData.role === 'glow');
    const spin = () => t.fk.group.getObjectByName('wheel-spin-0')!.rotation.y;
    expect(t.fk.group.getObjectByName('carriage')).toBeDefined();
    expect(t.fk.group.getObjectByName('forks')).toBeDefined();
    const s0 = spin();
    let sawOn = false;
    let sawOff = false;
    t.run(1.2, 1, () => { if (lit()) sawOn = true; else sawOff = true; });
    expect(sawOn && sawOff).toBe(true);
    expect(Math.abs(spin() - s0)).toBeGreaterThan(5); // 120+ units driven at wheel radius 7
    t.run(14);
    expect(lit()).toBe(false);
    const idle = spin();
    t.run(1);
    expect(spin()).toBe(idle);
  });
  it('setDock moves a parked forklift to the new park; during a trip the new spots are used', () => {
    const t = mk();
    t.run(14);
    expect(t.fk.busy).toBe(false);
    t.fk.setDock([2000, -300, 0], [2110, -300, 0]);
    expect(dist(t.fk, [2000, -300, 0])).toBeLessThan(1e-6);
    // mid-trip dock move: the trip still ends at the new park
    let lifted = false;
    t.fk.fetch(() => [1700, -240, 18], () => { lifted = true; return null; });
    for (let i = 0; i < 90; i++) t.fk.update(1 / 60, 1);
    t.fk.setDock([2100, -320, 0], [2210, -320, 0]);
    for (let i = 0; i < 60 * 20 && t.fk.busy; i++) t.fk.update(1 / 60, 1);
    expect(lifted).toBe(true);
    expect(dist(t.fk, [2100, -320, 0])).toBeLessThan(1);
  });
  it('dispose mid-trip disposes the carried load and detaches everything; restyle reaches the carried products', () => {
    const t = mk();
    while (t.state.lifts === 0) t.run(1 / 60);
    t.run(1.2);
    t.fk.restyle();
    expect(t.h.restyled).toBe(1);
    t.fk.dispose();
    expect(t.h.disposed).toBe(true);
    expect(t.geomDisposed()).toBe(1);
    expect(t.group.parent).toBeNull();
    expect(t.fk.group.parent).toBeNull();
    expect(() => t.fk.update(1 / 60, 1)).not.toThrow();
  });
  it('a second fetch while busy is ignored', () => {
    const t = mk();
    let other = 0;
    t.fk.fetch(() => END, () => { other++; return null; });
    t.run(14);
    expect(other).toBe(0);
    expect(t.state.lifts).toBe(1);
  });
  it('a top-tier plank is lifted at its own z, and the travel height is relative to it', () => {
    const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
    const fk = new Forklift(looks, fakeAudio().audio, PARK, DOOR);
    const top: Vec3 = [900, -440, 98];
    const plank = looks.part(new THREE.BoxGeometry(500, 22, 4), 'wood');
    plank.position.set(650, -440, 96);
    const group = new THREE.Group();
    group.add(plank);
    let liftZ = -1;
    fk.fetch(() => top, () => { liftZ = fk.group.getObjectByName('carriage')!.getWorldPosition(new THREE.Vector3()).z; return { group, handles: [] }; }, 50);
    for (let i = 0; i < 60 * 8 && liftZ < 0; i++) fk.update(1 / 60, 1);
    expect(liftZ).toBeCloseTo(98 - 6, 1); // forks go in 6 under the tier's plank top, not at the base level
    const z0 = worldZ(plank);
    for (let i = 0; i < 60 * 3; i++) fk.update(1 / 60, 1);
    expect(worldZ(plank) - z0).toBeCloseTo(14, 0); // the others are far below: only the lift, not the full clearance
  });
});
