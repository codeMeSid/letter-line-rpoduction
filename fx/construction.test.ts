import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SITE_SIZE, SITE_Y0, type Plot } from '../engine/campus';
import { Looks } from '../engine/looks';
import { ConstructionSite } from './construction';
import { meshes } from './testkit';

const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
const plot: Plot = { kind: 'bottle', x0: 2000, x1: 2900, built: false, origin: [2110, 0, 0] };

describe('ConstructionSite', () => {
  it('every mesh is role-tagged', () => {
    const c = new ConstructionSite(looks, plot);
    const ms = meshes(c.group);
    expect(ms.length).toBeGreaterThan(30);
    for (const m of ms) expect(m.userData.role).toBeTruthy();
  });
  it('bounds() lies inside the plot and above the ground', () => {
    const c = new ConstructionSite(looks, plot);
    const b = c.bounds();
    expect(b.min[0]).toBeGreaterThanOrEqual(plot.x0);
    expect(b.max[0]).toBeLessThanOrEqual(plot.x1);
    expect(b.min[1]).toBeGreaterThanOrEqual(SITE_Y0);
    expect(b.max[1]).toBeLessThanOrEqual(SITE_Y0 + SITE_SIZE[1]);
    expect(b.min[2]).toBeGreaterThanOrEqual(0);
    const bb = new THREE.Box3().setFromObject(c.group);
    expect(bb.min.x).toBeGreaterThanOrEqual(plot.x0 - 1);
    expect(bb.max.x).toBeLessThanOrEqual(plot.x1 + 1);
    expect(bb.min.y).toBeGreaterThanOrEqual(SITE_Y0 - 1);
    expect(bb.max.y).toBeLessThanOrEqual(SITE_Y0 + SITE_SIZE[1] + 1);
  });
  it('the crane slews with update()', () => {
    const c = new ConstructionSite(looks, plot);
    const jib = c.group.getObjectByName('jib')!;
    const r0 = jib.rotation.z;
    c.update(5);
    expect(jib.rotation.z).not.toBe(r0);
    expect(Math.abs(jib.rotation.z)).toBeLessThanOrEqual(0.6 + 1e-9);
  });
  it('night shows glow (cabin windows, crane lamp)', () => {
    const c = new ConstructionSite(looks, plot);
    const glow = () => meshes(c.group).filter((m) => m.userData.role === 'glow' && m.visible).length;
    c.setNight(false);
    const day = glow();
    c.setNight(true);
    expect(glow()).toBeGreaterThan(day);
    expect(glow()).toBeGreaterThanOrEqual(1);
  });
  it('dispose detaches and disposes geometry', () => {
    const p = new THREE.Group();
    const c = new ConstructionSite(looks, plot);
    p.add(c.group);
    let gone = false;
    meshes(c.group)[0].geometry.addEventListener('dispose', () => { gone = true; });
    c.dispose();
    expect(gone).toBe(true);
    expect(c.group.parent).toBeNull();
  });
});
