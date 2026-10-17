import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../../engine/looks';
import { figure } from './figure';

const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
const world = (o: THREE.Object3D) => { o.updateWorldMatrix(true, false); return o.getWorldPosition(new THREE.Vector3()); };
const roles = (root: THREE.Object3D) => {
  const out: (string | undefined)[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o.userData.role); });
  return out;
};

describe('figure', () => {
  it('is a role-tagged person: hard hat, hi-vis vest, clothes, boots, skin', () => {
    const f = figure(looks);
    const r = roles(f.group);
    expect(r.length).toBeGreaterThan(14);
    expect(r.every((x) => typeof x === 'string')).toBe(true);
    for (const role of ['paint-accent', 'copper', 'paint', 'rubber', 'sand', 'steel']) expect(r).toContain(role);
  });
  it('stands 40..44 tall with its feet on z = 0, facing +x', () => {
    const f = figure(looks);
    const b = new THREE.Box3().setFromObject(f.group);
    expect(b.max.z - b.min.z).toBeGreaterThan(40);
    expect(b.max.z - b.min.z).toBeLessThan(44);
    expect(b.min.z).toBeCloseTo(0, 5);
    const hat = new THREE.Box3();
    f.group.traverse((o) => { if (o.userData.role === 'paint-accent') hat.expandByObject(o); });
    const head = new THREE.Box3().setFromObject(f.group.getObjectByName('head')!);
    expect(hat.max.x).toBeGreaterThan(head.max.x); // the hat's visor points the way the person faces
  });
  it('walk swings the legs in opposite directions and the arms against the legs', () => {
    const f = figure(looks);
    f.pose(Math.PI / 2, 0);
    const g = (n: string) => f.group.getObjectByName(n)!;
    expect(g('hip-l').rotation.y).toBeCloseTo(0.5, 6);
    expect(g('hip-r').rotation.y).toBeCloseTo(-0.5, 6);
    expect(Math.sign(g('shoulder-l').rotation.y)).toBe(-Math.sign(g('hip-l').rotation.y));
    expect(Math.sign(g('shoulder-r').rotation.y)).toBe(-Math.sign(g('hip-r').rotation.y));
    f.pose(0, 0);
    expect(g('hip-l').rotation.y).toBeCloseTo(0, 6);
  });
  it('dips the body as the legs spread so the planted foot stays on the floor, and leaves the caller\'s position alone', () => {
    const f = figure(looks);
    f.group.position.set(10, 20, 30);
    for (const w of [0, 0.4, Math.PI / 2, 2.2, Math.PI, 4.5, 5.5]) {
      f.pose(w, 0);
      expect(f.group.position.toArray()).toEqual([10, 20, 30]);
      expect(new THREE.Box3().setFromObject(f.group, true).min.z - 30).toBeGreaterThan(-0.05); // no boot sinks into the floor
    }
    f.pose(Math.PI / 2, 0);
    const spread = new THREE.Box3().setFromObject(f.group, true);
    expect(spread.min.z - 30).toBeCloseTo(0, 1); // both soles flat on the floor
    const hip = f.group.getObjectByName('hip-l')!;
    expect(world(hip).z - 30).toBeLessThan(20 - 2); // the hips dipped
    f.pose(0, 0);
    expect(world(f.group.getObjectByName('hip-l')!).z - 30).toBeCloseTo(20, 5);
  });
  it('arm 1 raises the right hand above the shoulder', () => {
    const f = figure(looks);
    const hand = f.group.getObjectByName('hand-r')!;
    const shoulder = f.group.getObjectByName('shoulder-r')!;
    f.pose(0, 0);
    expect(world(hand).z).toBeLessThan(world(shoulder).z - 8);
    f.pose(0, 1);
    expect(world(hand).z).toBeGreaterThan(world(shoulder).z);
    expect(world(hand).x).toBeGreaterThan(world(shoulder).x); // reaching forward
  });
  it('seated puts the hips at 18, thighs forward and shins down', () => {
    const f = figure(looks);
    f.pose(0, 0, true);
    const hip = f.group.getObjectByName('hip-l')!;
    expect(world(hip).z).toBeCloseTo(18, 5);
    const knee = world(f.group.getObjectByName('knee-l')!);
    expect(knee.z).toBeCloseTo(18, 5); // thigh horizontal
    expect(knee.x).toBeGreaterThan(world(hip).x + 8);
    const boot = world(f.group.getObjectByName('boot-l')!);
    expect(Math.abs(boot.x - knee.x)).toBeLessThan(2); // shin hangs straight down from the knee (the boot toe sits 1.2 ahead)
    expect(boot.z).toBeLessThan(knee.z - 8);
  });
  it('dispose frees every geometry and detaches', () => {
    const f = figure(looks);
    const parent = new THREE.Group();
    parent.add(f.group);
    let n = 0;
    f.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.addEventListener('dispose', () => n++); });
    const meshes = roles(f.group).length;
    f.dispose();
    expect(n).toBe(meshes);
    expect(f.group.parent).toBeNull();
  });
});
