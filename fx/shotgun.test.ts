import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../engine/looks';
import { ParticleSystem } from '../engine/particles';
import { Shotgun } from './shotgun';
import { meshes } from './testkit';

const mk = () => {
  const plays: string[] = [];
  const flashes: number[] = [];
  const shakes: number[] = [];
  const particles = new ParticleSystem();
  const g = new Shotgun({
    looks: new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' }),
    particles,
    audio: { play: (n) => { plays.push(n); } },
    flash: () => flashes.push(1),
    shake: (m) => shakes.push(m),
  });
  const run = (s: number) => { for (let t = 0; t < s; t += 1 / 60) g.update(1 / 60); };
  return { g, plays, flashes, shakes, run, particles };
};

describe('Shotgun', () => {
  it('is a real gun: stock, receiver, barrel, magazine, pump, all role-tagged', () => {
    const { g } = mk();
    const ms = meshes(g.group);
    expect(ms.length).toBeGreaterThanOrEqual(8);
    expect(ms.every((m) => !!m.userData.role)).toBe(true);
    expect(ms.some((m) => m.userData.role === 'wood')).toBe(true);
    expect(ms.some((m) => m.userData.role === 'steel')).toBe(true);
  });
  it('is about 54 long with the barrel along +x and a vertical hanger rod above it', () => {
    const { g } = mk();
    g.group.updateMatrixWorld(true);
    const gun = new THREE.Box3();
    g.gimbal.traverse((o) => { if ((o as THREE.Mesh).isMesh) gun.expandByObject(o); });
    expect(gun.max.x - gun.min.x).toBeGreaterThan(48);
    expect(gun.max.x - gun.min.x).toBeLessThan(62);
    expect(gun.max.x).toBeGreaterThan(-gun.min.x); // barrel side is longer than the stock side
    expect(new THREE.Box3().setFromObject(g.group).max.z).toBeGreaterThan(300);
  });
  it('drops in, racks, fires once, hits once; idles away after 1.5 s', () => {
    const { g, plays, flashes, shakes, run } = mk();
    expect(g.group.visible).toBe(false);
    let hits = 0;
    g.shoot([100, -300, 30], 0, () => hits++);
    expect(g.busy).toBe(true);
    run(0.3);
    expect(g.group.visible).toBe(true);
    expect(hits).toBe(0);
    run(0.6);
    expect(hits).toBe(1);
    expect(plays.filter((p) => p === 'shotgun-rack')).toHaveLength(1);
    expect(plays.filter((p) => p === 'shotgun-blast')).toHaveLength(1);
    expect(flashes).toHaveLength(1);
    expect(shakes.length).toBe(1);
    run(2.5);
    expect(g.busy).toBe(false);
    expect(g.group.visible).toBe(false);
  });
  it('queues rapid shots in order without leaving', () => {
    const { g, run } = mk();
    const order: number[] = [];
    for (let i = 0; i < 3; i++) g.shoot([100 + i * 30, -300, 30], 0, () => order.push(i));
    run(3);
    expect(order).toEqual([0, 1, 2]);
  });
  it('aims the barrel at the target: the muzzle ends up closer to it than the receiver', () => {
    const { g, run } = mk();
    const target = new THREE.Vector3(100, -300, 30);
    g.shoot(target.toArray() as [number, number, number], 0, () => {});
    run(0.55); // racked, not yet fired
    const mid = g.muzzle.getWorldPosition(new THREE.Vector3());
    const recv = g.gimbal.getWorldPosition(new THREE.Vector3());
    expect(mid.distanceTo(target)).toBeLessThan(recv.distanceTo(target) - 25);
    const barrel = mid.clone().sub(recv).normalize();
    const toTarget = target.clone().sub(recv).normalize();
    expect(barrel.dot(toTarget)).toBeGreaterThan(0.98);
  });
  it('fires: flash + sparks along the aim, recoil, and an ejected shell that is cleaned up', () => {
    const { g, run, particles } = mk();
    g.shoot([100, -300, 30], 0, () => {});
    run(0.65);
    expect(particles.count).toBeGreaterThanOrEqual(15); // flash x1 + spark x14
    expect(meshes(g.shells).length).toBeGreaterThanOrEqual(2); // hull + brass head
    expect(meshes(g.shells).every((m) => !!m.userData.role)).toBe(true);
    run(3.5);
    expect(meshes(g.shells)).toHaveLength(0);
  });
  it('spent shells are capped at 8 (oldest removed early) and clear after their life', () => {
    const { g, run } = mk();
    const eject = (g as unknown as { eject(floor: number): void }).eject.bind(g);
    for (let i = 0; i < 12; i++) eject(0);
    expect(g.shells.children).toHaveLength(8);
    run(3.5);
    expect(g.shells.children).toHaveLength(0);
  });
  it('a shot during the lift reverses back into the next target instead of leaving', () => {
    const { g, run } = mk();
    g.shoot([100, -300, 30], 0, () => {});
    run(0.85 + 1.5 + 0.1); // fired, recovered, idled, now lifting
    expect(g.busy).toBe(true);
    let hit = false;
    g.shoot([160, -300, 30], 0, () => { hit = true; });
    run(1);
    expect(hit).toBe(true);
    expect(g.group.visible).toBe(true);
  });
});
