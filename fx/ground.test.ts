import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../engine/looks';
import { PLOTS } from '../factories/registry';
import { buildGround } from './ground';
import { meshes } from './testkit';

const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });

describe('buildGround', () => {
  const g = buildGround(looks, PLOTS);
  it('every mesh is role-tagged', () => {
    const ms = meshes(g.group);
    expect(ms.length).toBeGreaterThan(2);
    for (const m of ms) expect(m.userData.role).toBeTruthy();
  });
  it('covers the whole campus ± 300 in x', () => {
    const bb = new THREE.Box3().setFromObject(g.group);
    expect(bb.min.x).toBeLessThanOrEqual(PLOTS[0].x0 - 300);
    expect(bb.max.x).toBeGreaterThanOrEqual(PLOTS.at(-1)!.x1 + 300);
  });
  it('never pokes above the floor top', () => {
    for (const m of meshes(g.group)) expect(new THREE.Box3().setFromObject(m).max.z).toBeLessThanOrEqual(0);
  });
  it('dispose detaches and disposes geometry', () => {
    const p = new THREE.Group();
    const c = buildGround(looks, PLOTS);
    p.add(c.group);
    let gone = false;
    meshes(c.group)[0].geometry.addEventListener('dispose', () => { gone = true; });
    c.dispose();
    expect(gone).toBe(true);
    expect(c.group.parent).toBeNull();
  });
});
