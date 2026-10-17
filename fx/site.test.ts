import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FactorySite } from './site';
import { meshes, miniFactory } from './testkit';

describe('FactorySite', () => {
  it('wraps the host floor box in a building and shows the finished product on the sign', () => {
    const f = miniFactory();
    const site = new FactorySite(f.host, { looks: f.looks, director: f.director, audio: f.audio, particles: f.particles, settings: () => f.settings }, f.parent);
    expect(site.group.parent).toBe(f.parent);
    expect(meshes(site.building.group).length).toBeGreaterThan(30);
    expect(f.handles.length).toBe(1); // the sign product
    const sign = f.handles[0];
    expect(sign.root.scale.x).toBe(3);
    site.rebuild();
    expect(sign.disposed).toBe(true);    // the old sign product was disposed
    expect(f.handles.length).toBe(2);
    site.dispose();
    expect(f.handles[1].disposed).toBe(true);
    expect(site.group.parent).toBeNull();
  });
  it('owns one hoist and one broom for its whole life; a rebuild keeps them and re-anchors the hoist', () => {
    const f = miniFactory();
    const site = new FactorySite(f.host, { looks: f.looks, director: f.director, audio: f.audio, particles: f.particles, settings: () => f.settings }, f.parent);
    const { hoist, broom } = site;
    expect(hoist).toBeDefined();
    expect(broom).toBeDefined();
    expect(hoist.group.parent).toBe(site.group);
    expect(broom.group.parent).toBe(site.group);
    const home = () => new THREE.Box3().setFromObject(hoist.group).getCenter(new THREE.Vector3());
    expect(Math.abs(home().x - site.building.chuteTop[0])).toBeLessThan(12);
    f.host.relayout('snake');
    site.rebuild();
    expect(site.hoist).toBe(hoist);
    expect(site.broom).toBe(broom);
    expect(hoist.group.parent).toBe(site.group);
    expect(broom.group.parent).toBe(site.group);
    expect(Math.abs(home().x - site.building.chuteTop[0])).toBeLessThan(12);
    site.update(0.1, 0);
    site.dispose();
    expect(hoist.group.parent).toBeNull();
    expect(broom.group.parent).toBeNull();
  });
  it('update advances the hoist and the broom', () => {
    const f = miniFactory();
    const site = new FactorySite(f.host, { looks: f.looks, director: f.director, audio: f.audio, particles: f.particles, settings: () => f.settings }, f.parent);
    expect(site.hoist.busy).toBe(false);
    site.broom.sweep(() => [0, 0, 18], 'gap', () => {});
    expect(site.broom.busy).toBe(true);
    for (let i = 0; i < 1800; i++) site.update(1 / 60, 0); // 30 s: the shelf is ~500 wide, so the trip is long
    expect(site.broom.busy).toBe(false);
  });
});
