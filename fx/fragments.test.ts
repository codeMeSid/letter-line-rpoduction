import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../engine/looks';
import { Fragments } from './fragments';
import { meshes } from './testkit';

const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
const zs = (m: THREE.InstancedMesh) => {
  const mat = new THREE.Matrix4();
  return Array.from({ length: m.count }, (_, i) => (m.getMatrixAt(i, mat), mat.elements[14]));
};

describe('Fragments', () => {
  it('burst makes one role-tagged InstancedMesh of that many chunks', () => {
    const f = new Fragments(looks);
    f.burst('steel', [0, 0, 40], 9, 3, 0);
    expect(f.group.children).toHaveLength(1);
    const m = f.group.children[0] as THREE.InstancedMesh;
    expect(m.isInstancedMesh).toBe(true);
    expect(m.userData.role).toBe('steel');
    expect(m.count).toBe(9);
    f.burst('steel', [0, 0, 40], 2, 3, 0); // same pool
    expect(f.group.children).toHaveLength(1);
    expect(m.count).toBe(11);
  });
  it('chunks fly, land on the floor (never below it) and are gone after their life', () => {
    const f = new Fragments(looks);
    f.burst('steel', [0, 0, 40], 9, 3, 0);
    const m = f.group.children[0] as THREE.InstancedMesh;
    const z0 = zs(m);
    f.update(0.5);
    expect(zs(m).every((z) => z >= 0)).toBe(true);
    expect(zs(m)).not.toEqual(z0);
    f.update(3);
    expect(m.count).toBe(0);
  });
  it('chunks land on the floor they were given (an upper level)', () => {
    const f = new Fragments(looks);
    f.burst('steel', [0, 0, 120], 9, 3, 100);
    const m = f.group.children[0] as THREE.InstancedMesh;
    for (let i = 0; i < 60; i++) f.update(1 / 60);
    expect(m.count).toBe(9);
    expect(Math.min(...zs(m))).toBeGreaterThanOrEqual(100);
  });
  it('a 200-chunk burst caps at the pool capacity without throwing', () => {
    const f = new Fragments(looks);
    expect(() => f.burst('steel', [0, 0, 40], 200, 3, 0)).not.toThrow();
    expect((f.group.children[0] as THREE.InstancedMesh).count).toBe(128);
    f.burst('copper', [0, 0, 40], 1, 3, 0);
    expect(f.group.children).toHaveLength(2);
  });
  it('pile: role-tagged chunks plus a liquid puddle; dispose detaches it', () => {
    const f = new Fragments(looks);
    const p = f.pile('steel', [10, 0, 18], 5, 3, true);
    const ms = meshes(p.group);
    expect(ms.filter((m) => m.userData.role === 'steel')).toHaveLength(5);
    expect(ms.filter((m) => m.userData.role === 'liquid')).toHaveLength(1);
    expect(p.group.parent).not.toBeNull();
    p.dispose();
    expect(p.group.parent).toBeNull();
    expect(meshes(f.pile('steel', [0, 0, 0], 3, 3, false).group)).toHaveLength(3);
  });
  it('dispose disposes the shared geometry and detaches', () => {
    const parent = new THREE.Group();
    const f = new Fragments(looks);
    parent.add(f.group);
    f.burst('steel', [0, 0, 40], 4, 3, 0);
    let disposed = 0;
    (f.group.children[0] as THREE.InstancedMesh).geometry.addEventListener('dispose', () => disposed++);
    f.dispose();
    expect(disposed).toBe(1);
    expect(f.group.parent).toBeNull();
  });
});
