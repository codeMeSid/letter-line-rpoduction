import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../engine/looks';
import { ParticleSystem } from '../engine/particles';
import type { Vec3 } from '../engine/types';
import { Broom } from './broom';
import { fakeAudio, meshes } from './testkit';

function mk() {
  const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
  const { audio, plays } = fakeAudio();
  const particles = new ParticleSystem();
  let park: Vec3 = [500, -400, 18];
  const broom = new Broom(looks, audio, particles, () => park);
  const run = (s: number, each?: () => void) => { for (let t = 0; t < s - 1e-9; t += 1 / 60) { broom.update(1 / 60); each?.(); } };
  return { broom, plays, run, particles, setPark: (p: Vec3) => { park = p; } };
}

describe('Broom', () => {
  it('drives to the slot, sweeps 0.8 s, calls onSwept once, plays broom-sweep', () => {
    const t = mk();
    let n = 0;
    t.broom.sweep(() => [300, -400, 18], 'debris', () => n++);
    expect(t.broom.busy).toBe(true);
    t.run(2.2); // 186 units at 120/s = 1.55 s, then 0.8 s
    expect(n).toBe(0);
    expect(t.plays).toContain('broom-sweep');
    t.run(0.3);
    expect(n).toBe(1);
    t.run(5);
    expect(n).toBe(1);
  });
  it('a gap tap takes 0.3 s at the slot and whooshes', () => {
    const t = mk();
    let n = 0;
    t.broom.sweep(() => [300, -400, 18], 'gap', () => n++);
    t.run(1.7);
    expect(n).toBe(0);
    t.run(0.3);
    expect(n).toBe(1);
    expect(t.plays).toContain('whoosh');
    expect(t.plays).not.toContain('broom-sweep');
  });
  it('puffs smoke at the slot only while sweeping, not while driving', () => {
    const t = mk();
    t.broom.sweep(() => [300, -400, 18], 'debris', () => {});
    t.run(1.4);
    expect(t.particles.count).toBe(0);
    t.run(0.4);
    expect(t.particles.count).toBeGreaterThanOrEqual(4);
  });
  it('faces its travel, spins the roller and jiggles while sweeping, and lights the beacon only while moving', () => {
    const t = mk();
    t.broom.sweep(() => [300, -400, 18], 'debris', () => {});
    t.run(1.8); // arrived, sweeping
    expect(Math.cos(t.broom.rover.rotation.z)).toBeGreaterThan(0.99); // front (-x) toward the slot
    const a = t.broom.roller.rotation.y;
    t.run(0.05);
    expect(Math.abs(t.broom.roller.rotation.y - a)).toBeGreaterThan(0.2);
    let lo = 1e9;
    let hi = -1e9;
    t.run(0.3, () => { lo = Math.min(lo, t.broom.rover.position.x); hi = Math.max(hi, t.broom.rover.position.x); });
    expect(hi - lo).toBeGreaterThan(4); // +-3 at 6 Hz
    expect(hi - lo).toBeLessThan(6.1);
    const lit = () => meshes(t.broom.group).some((m) => m.userData.role === 'glow');
    expect(lit()).toBe(true);
    t.run(5);
    expect(lit()).toBe(false); // parked
    const idle = t.broom.roller.rotation.y;
    t.run(0.3);
    expect(t.broom.roller.rotation.y).toBe(idle);
    expect(Math.cos(t.broom.rover.rotation.z)).toBeGreaterThan(0.99); // turned back to face the shelf
  });
  it('runs two sweeps in order and parks afterwards', () => {
    const t = mk();
    const order: string[] = [];
    t.broom.sweep(() => [300, -400, 18], 'debris', () => order.push('a'));
    t.broom.sweep(() => [380, -415, 18], 'gap', () => order.push('b'));
    t.run(3);
    expect(order).toEqual(['a']);
    t.run(10);
    expect(order).toEqual(['a', 'b']);
    expect(t.broom.busy).toBe(false);
    expect(t.broom.rover.position.distanceTo(new THREE.Vector3(500, -400, 18))).toBeLessThan(0.5);
  });
  it('follows a slot that moves while it drives', () => {
    const t = mk();
    let x = 300;
    let swept = 0;
    t.broom.sweep(() => [x, -400, 18], 'debris', () => swept++);
    t.run(0.6);
    x = 200; // the rows stepped back
    let nearest = 1e9;
    t.run(5, () => { nearest = Math.min(nearest, Math.abs(t.broom.rover.position.x - 214)); });
    expect(swept).toBe(1);
    expect(nearest).toBeLessThan(1);
  });
  it('a vanished slot mid-trip still calls onSwept once and the broom returns home', () => {
    const t = mk();
    let gone = false;
    let n = 0;
    t.broom.sweep(() => (gone ? null : [300, -400, 18]), 'debris', () => n++);
    t.run(0.8);
    gone = true;
    t.run(0.1);
    expect(n).toBe(1);
    t.run(6);
    expect(n).toBe(1);
    expect(t.broom.busy).toBe(false);
    expect(t.broom.rover.position.distanceTo(new THREE.Vector3(500, -400, 18))).toBeLessThan(0.5);
  });
  it('a row change drives along the park x first, then along the row', () => {
    const t = mk();
    t.broom.sweep(() => [300, -360, 18], 'debris', () => {});
    let offPark = 0;
    t.run(0.25, () => { if (Math.abs(t.broom.rover.position.x - 500) > 0.5) offPark++; });
    expect(offPark).toBe(0); // still on the (park.x, y) leg: 40 units at 120/s = 0.33 s
    expect(t.broom.rover.position.y).toBeGreaterThan(-400);
  });
  it('a chained sweep on another row changes rows at the park x, not through the shelf', () => {
    const t = mk();
    const order: string[] = [];
    t.broom.sweep(() => [300, -360, 18], 'debris', () => order.push('a'));
    t.broom.sweep(() => [320, -320, 18], 'gap', () => order.push('b')); // queued behind a, one row further back
    const rowChangesAt: number[] = [];
    let prev = t.broom.rover.position.y;
    t.run(14, () => {
      const { x, y } = t.broom.rover.position;
      if (Math.abs(y - prev) > 1e-6) rowChangesAt.push(x);
      prev = y;
    });
    expect(order).toEqual(['a', 'b']);
    expect(rowChangesAt.length).toBeGreaterThan(10); // park -> row a, row a -> row b, home
    for (const x of rowChangesAt) expect(Math.abs(x - 500)).toBeLessThan(2.5); // park.x, give or take one 60 fps step (2 units); the old behaviour changed rows at x ~ 314
  });
  it('chained sweeps on the same row drive straight along it', () => {
    const t = mk();
    let afterA = false;
    let doneB = false;
    t.broom.sweep(() => [300, -360, 18], 'gap', () => { afterA = true; });
    t.broom.sweep(() => [260, -360, 18], 'gap', () => { doneB = true; });
    let maxX = 0;
    t.run(6, () => { if (afterA && !doneB) maxX = Math.max(maxX, t.broom.rover.position.x); });
    expect(doneB).toBe(true);
    expect(maxX).toBeGreaterThan(0);
    expect(maxX).toBeLessThan(320); // from slot A (x 314) it goes on to slot B (274): never back toward park.x (500)
  });
  it('is a real rover: body, cover, four wheels, roller on two arms, beacon; all role-tagged', () => {
    const t = mk();
    const ms = meshes(t.broom.group);
    expect(ms.every((m) => !!m.userData.role)).toBe(true);
    expect(ms.filter((m) => m.userData.role === 'rubber').length).toBeGreaterThanOrEqual(5); // 4 wheels + roller core (+ beacon off)
    expect(ms.some((m) => m.userData.role === 'paint-accent')).toBe(true);
    expect(ms.some((m) => m.userData.role === 'paint')).toBe(true);
    expect(ms.filter((m) => m.userData.role === 'steel').length).toBeGreaterThanOrEqual(2);
  });
  it('dispose detaches the group', () => {
    const t = mk();
    const parent = new THREE.Group();
    parent.add(t.broom.group);
    t.broom.dispose();
    expect(t.broom.group.parent).toBeNull();
  });
});
