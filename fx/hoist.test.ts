import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ProductHandle } from '../engine/product';
import type { Vec3 } from '../engine/types';
import { Looks } from '../engine/looks';
import { Hoist, type HoistAnchors } from './hoist';
import { fakeAudio, meshes } from './testkit';

const A: HoistAnchors = { chuteTop: [-70, 166, 150], chuteBottom: [70, 166, 58], binPos: [120, 166, 0], ceil: 320 };

interface H extends ProductHandle { disposed: boolean; restyled: number }
/** A 32-tall product standing on its origin (like the real ones), parked on the belt. */
function handle(at: Vec3 = [60, -30, 22]): H {
  const h: H = { root: new THREE.Group(), disposed: false, restyled: 0, shape() {}, place() {}, restyle() { h.restyled++; }, dispose() { h.disposed = true; } };
  h.root.add(new THREE.Mesh(new THREE.BoxGeometry(26, 8, 32).translate(0, 0, 16)));
  h.root.position.set(...at);
  return h;
}

function mk() {
  const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
  const { audio, plays } = fakeAudio();
  const hoist = new Hoist(looks, audio, A);
  const world = new THREE.Group();
  world.add(hoist.group);
  const run = (s: number, each?: () => void) => { for (let t = 0; t < s - 1e-9; t += 1 / 60) { hoist.update(1 / 60); each?.(); } };
  return { hoist, plays, run, looks };
}

describe('Hoist', () => {
  it('lifts the product, carries it over the chute and drops it in the bin within 3 s', () => {
    const t = mk();
    const h = handle();
    let done = 0;
    t.hoist.reject(h, () => done++);
    expect(t.hoist.busy).toBe(true);
    t.run(1.45); // mid-carry: gripped and well off the belt, following the claw
    expect(h.root.position.z).toBeGreaterThan(22 + 80);
    expect(done).toBe(0);
    t.run(1.55);
    expect(done).toBe(1);
    expect(h.root.parent).toBe(t.hoist.bin);
    expect(t.hoist.bin.parent).toBe(t.hoist.group);
    expect(h.disposed).toBe(false);
    const p = h.root.position;
    expect(Math.abs(p.x - A.binPos[0])).toBeLessThan(16);
    expect(Math.abs(p.y - A.binPos[1])).toBeLessThan(12);
    expect(p.z).toBeGreaterThanOrEqual(A.binPos[2] + 6);
    expect(p.z).toBeLessThanOrEqual(A.binPos[2] + 20);
    t.run(1); // the claw is back home
    expect(t.hoist.busy).toBe(false);
  });
  it('plays reject-kick once, at the grip', () => {
    const t = mk();
    t.hoist.reject(handle());
    t.run(0.7);
    expect(t.plays.filter((p) => p === 'reject-kick')).toHaveLength(0);
    t.run(0.4);
    expect(t.plays.filter((p) => p === 'reject-kick')).toHaveLength(1);
    t.run(3);
    expect(t.plays.filter((p) => p === 'reject-kick')).toHaveLength(1);
  });
  it('never teleports the product: the slide off the chute is a ballistic hop', () => {
    const t = mk();
    const h = handle();
    t.hoist.reject(h);
    const prev = new THREE.Vector3().copy(h.root.position);
    let worst = 0;
    t.run(3.2, () => { worst = Math.max(worst, prev.distanceTo(h.root.position)); prev.copy(h.root.position); });
    expect(worst).toBeLessThan(30); // 1800 u/s at 60 fps
    expect(worst).toBeGreaterThan(1);
  });
  it('seven rejects leave six handles in the bin and dispose the oldest', () => {
    const t = mk();
    const hs = Array.from({ length: 7 }, () => handle());
    for (const h of hs) { t.hoist.reject(h); t.run(3.4); }
    expect(t.hoist.bin.children).toHaveLength(6);
    expect(hs[0].disposed).toBe(true);
    expect(hs[0].root.parent).toBeNull();
    for (const h of hs.slice(1)) { expect(h.disposed).toBe(false); expect(h.root.parent).toBe(t.hoist.bin); }
  });
  it('serves two rejects in a row in order', () => {
    const t = mk();
    const order: number[] = [];
    const a = handle([60, -30, 22]);
    const b = handle([-100, -30, 22]);
    t.hoist.reject(a, () => order.push(1));
    t.hoist.reject(b, () => order.push(2));
    t.run(3.4);
    expect(order).toEqual([1]);
    expect(b.root.parent).not.toBe(t.hoist.bin);
    t.run(3.4);
    expect(order).toEqual([1, 2]);
    expect(t.hoist.busy).toBe(false);
  });
  it('is built from role-tagged machinery: block, cable, hook, three fingers, lamp', () => {
    const t = mk();
    const ms = meshes(t.hoist.group);
    expect(ms.length).toBeGreaterThanOrEqual(10);
    expect(ms.every((m) => !!m.userData.role)).toBe(true);
    expect(ms.some((m) => m.userData.role === 'paint-accent')).toBe(true);
    expect(ms.some((m) => m.userData.role === 'rubber' || m.userData.role === 'glow')).toBe(true); // the lamp bulb
    expect(ms.filter((m) => m.userData.role === 'steel').length).toBeGreaterThanOrEqual(6);
  });
  it('the lamp blinks while it works and is dark at rest', () => {
    const t = mk();
    const lit = () => meshes(t.hoist.group).some((m) => m.userData.role === 'glow');
    expect(lit()).toBe(false);
    const seen = new Set<boolean>();
    t.hoist.reject(handle());
    t.run(1, () => seen.add(lit()));
    expect([...seen].sort()).toEqual([false, true]);
    t.run(4);
    expect(lit()).toBe(false);
  });
  it('the cable runs from the block up past the ceiling', () => {
    const t = mk();
    t.hoist.reject(handle());
    t.run(0.8);
    t.hoist.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(t.hoist.group);
    expect(box.max.z).toBeGreaterThanOrEqual(A.ceil + 800 - 1);
  });
  it('setAnchors mid-trip still completes', () => {
    const t = mk();
    const h = handle();
    let done = 0;
    t.hoist.reject(h, () => done++);
    t.run(1);
    t.hoist.setAnchors({ chuteTop: [-40, 226, 150], chuteBottom: [100, 226, 58], binPos: [150, 226, 0], ceil: 400 });
    t.run(4);
    expect(done).toBe(1);
    expect(h.root.parent).toBe(t.hoist.bin);
    expect(Math.abs(h.root.position.x - 150)).toBeLessThan(16);
    expect(t.hoist.busy).toBe(false);
  });
  it('restyle reaches the carried and the binned products', () => {
    const t = mk();
    const a = handle();
    const b = handle();
    t.hoist.reject(a);
    t.run(3.4);
    t.hoist.reject(b);
    t.run(0.5);
    t.hoist.restyle();
    expect(a.restyled).toBe(1);
    expect(b.restyled).toBe(1);
  });
  it('dispose frees the bin, the carried product and a queued one', () => {
    const t = mk();
    const a = handle();
    const b = handle();
    const c = handle();
    t.hoist.reject(a);
    t.run(3.4);
    t.hoist.reject(b);
    t.hoist.reject(c);
    t.run(0.8);
    t.hoist.dispose();
    expect([a, b, c].map((h) => h.disposed)).toEqual([true, true, true]);
    expect(t.hoist.group.parent).toBeNull();
  });
});
