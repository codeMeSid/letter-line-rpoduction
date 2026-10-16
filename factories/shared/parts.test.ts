import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../../engine/looks';
import { beam, column, flange, gauge, hazardBand, housing, lamp, lathe, legs, panel, piston, pipe } from './parts';

const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
const bbox = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);

describe('parts', () => {
  it('housing / column / lathe stand on z=0, centred on x/y', () => {
    for (const o of [housing(looks, 40, 30, 20), column(looks, 5, 50), lathe(looks, [[0, 0], [10, 0], [10, 30], [0, 30]], 'paint')]) {
      const b = bbox(o);
      expect(b.min.z).toBeCloseTo(0, 5);
      expect(b.min.x + b.max.x).toBeCloseTo(0, 5);
      expect(b.min.y + b.max.y).toBeCloseTo(0, 5);
    }
    expect(bbox(column(looks, 5, 50)).max.z).toBeCloseTo(50, 5);
    expect(bbox(lathe(looks, [[0, 0], [10, 0], [10, 30], [0, 30]], 'paint')).max.z).toBeCloseTo(30, 5);
  });
  it('beam spans its endpoints', () => {
    const b = bbox(beam(looks, [0, 0, 0], [100, 0, 50], 4));
    expect(b.min.x).toBeLessThanOrEqual(0.01 + 4);
    expect(b.max.x).toBeGreaterThanOrEqual(100 - 4);
    expect(b.max.z).toBeGreaterThanOrEqual(50 - 4);
  });
  it('piston extends its rod downward', () => {
    const p = piston(looks, { body: 6, rod: 2, len: 30, stroke: 20 });
    p.set(0);
    const z0 = bbox(p.group).min.z;
    p.set(1);
    expect(bbox(p.group).min.z).toBeCloseTo(z0 - 20, 4);
  });
  it('lamp swaps role between glow and rubber', () => {
    const l = lamp(looks, 2);
    const mesh = l.group.children[0] as THREE.Mesh;
    l.set(true);
    expect(mesh.userData.role).toBe('glow');
    l.set(false);
    expect(mesh.userData.role).toBe('rubber');
  });
  it('gauge needle rotates with value', () => {
    const g = gauge(looks, 6);
    g.set(0);
    const a = g.group.getObjectByName('needle')!.rotation.y;
    g.set(1);
    expect(g.group.getObjectByName('needle')!.rotation.y).not.toBeCloseTo(a, 3);
  });
  it('pipe follows its points', () => {
    const b = bbox(pipe(looks, [[0, 0, 0], [0, 0, 40], [30, 0, 40]], 2));
    expect(b.max.z).toBeGreaterThanOrEqual(39);
    expect(b.max.x).toBeGreaterThanOrEqual(29);
  });
  it('hazardBand stripes are clipped flush to w × d and stand h tall', () => {
    const b = bbox(hazardBand(looks, 60, 8, 2));
    expect(b.min.x).toBeCloseTo(-30, 4);
    expect(b.max.x).toBeCloseTo(30, 4);
    expect(b.min.y).toBeCloseTo(-4, 4);
    expect(b.max.y).toBeCloseTo(4, 4);
    expect(b.min.z).toBeCloseTo(0, 5);
    expect(b.max.z).toBeCloseTo(2, 5);
  });
  it('legs run from z=-h to z=0', () => {
    const b = bbox(legs(looks, 60, 40, 30));
    expect(b.min.z).toBeCloseTo(-30, 5);
    expect(b.max.z).toBeCloseTo(0, 5);
  });
  it('flange: one instanced bolt per bolt, group stands on z=0', () => {
    const f = flange(looks, 12, 6);
    const bolts = f.children.find((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh;
    expect(bolts.count).toBe(6);
    expect(bbox(f).min.z).toBeCloseTo(0, 5);
  });
  it('panel lamps blink at different rates', () => {
    const p = panel(looks, 44, 58);
    const glowing = () => {
      let n = 0;
      p.group.traverse((o) => { if (o.userData.role === 'glow') n++; });
      return n;
    };
    p.update(0);
    expect(glowing()).toBe(3);
    p.update(1000); // periods 900/1450/2300 ms: phases .11 .69 .43 → on, off, on
    expect(glowing()).toBe(2);
    p.update(1600); // phases .78 .10 .70 → off, on, off
    expect(glowing()).toBe(1);
  });
});
