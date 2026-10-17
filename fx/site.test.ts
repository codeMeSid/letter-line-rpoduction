import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Job } from '../engine/types';
import { FactorySite } from './site';
import { meshes, miniFactory } from './testkit';

/** A site on a miniFactory; `step` advances director + host + site together (30 Hz). */
function setup(over = {}) {
  const f = miniFactory(over);
  const site = new FactorySite(f.host, { looks: f.looks, director: f.director, audio: f.audio, particles: f.particles, settings: () => f.settings }, f.parent);
  const step = (s: number) => { for (let t = 0; t < s - 1e-9; t += 1 / 30) { f.director.update(1 / 30); f.host.update(1 / 30, 1 / 30); site.update(1 / 30, 0); } };
  const shelve = () => { for (let i = 0; i < 1800 && f.director.jobsOf('letter').length; i++) step(1 / 30); };
  const shipped: string[] = [];
  f.director.events.on('row:shipped', ({ slots }) => shipped.push(slots.map((x) => x.char).join('')));
  return { ...f, site, step, shelve, shipped, shelf: f.director.shelf('letter') };
}

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
  it('owns one forklift for its whole life, parked facing -x at the dock; a rebuild keeps it and moves its park', () => {
    const t = setup();
    const { forklift } = t.site;
    expect(forklift).toBeDefined();
    expect(forklift.group.parent).toBe(t.site.group);
    const park = t.site.building.dockPark;
    expect(Math.hypot(forklift.truck.position.x - park[0], forklift.truck.position.y - park[1])).toBeLessThan(1e-6);
    expect(Math.cos(forklift.truck.rotation.z)).toBeCloseTo(1, 6);
    t.host.relayout('snake');
    t.site.rebuild();
    expect(t.site.forklift).toBe(forklift);
    expect(forklift.group.parent).toBe(t.site.group);
    const park2 = t.site.building.dockPark;
    expect(Math.hypot(forklift.truck.position.x - park2[0], forklift.truck.position.y - park2[1])).toBeLessThan(1e-6);
    t.site.dispose();
    expect(forklift.group.parent).toBeNull();
  });
  it('no row ships while the shelf keeps its three rows', () => {
    const t = setup();
    t.type('ab\ncd\nef');
    t.shelve();
    t.step(10);
    expect(t.site.forklift.busy).toBe(false);
    expect(t.shipped).toEqual([]);
    expect(t.shelf.rows).toHaveLength(3);
  });
  it('overflow ships: the fourth row sends the forklift for the oldest, which is shipped once and disposed', () => {
    const t = setup();
    t.type('ab\ncd\nef\ngh');
    t.shelve();
    t.step(15);
    expect(t.shipped).toEqual(['ab']);
    expect(t.shelf.rows).toHaveLength(3);
    expect(t.shelf.text()).toBe('cd\nef\ngh');
    expect(t.handles[1].disposed).toBe(true); // 'a' and 'b' left on the forklift and were disposed beyond the dock door
    expect(t.handles[2].disposed).toBe(true);
    expect(t.handles[3].disposed).toBe(false);
    expect(t.site.forklift.busy).toBe(false);
  });
  it('overflow catches up: six quick rows end at three, in order, and no job is ever destroyed by shipping', () => {
    const t = setup();
    const destroyed: Job[] = [];
    t.director.events.on('job:phase', ({ job }) => { if (job.phase === 'destroyed') destroyed.push(job); });
    t.type('a\nb\nc\nd\ne\nf');
    t.shelve();
    expect(t.shelf.rows.length).toBeGreaterThan(3); // the forklift is still on its first trip
    t.step(60);
    expect(t.shelf.rows).toHaveLength(3);
    expect(t.shelf.text()).toBe('d\ne\nf');
    expect(t.shipped).toEqual(['a', 'b', 'c']);
    expect(destroyed).toEqual([]);
  });
  it('relayout mid-fetch: the trip still lifts the same row and ships it exactly once', () => {
    const t = setup();
    t.type('ab\ncd\nef\ngh');
    for (let i = 0; i < 600 && !t.site.forklift.busy; i++) t.step(1 / 30);
    expect(t.site.forklift.busy).toBe(true);
    t.step(1);
    expect(t.shipped).toEqual([]); // still driving over to the row
    t.host.relayout('snake');
    t.site.rebuild();
    t.step(40);
    expect(t.shipped).toEqual(['ab']);
    expect(t.shelf.rows).toHaveLength(3);
    expect(t.site.forklift.busy).toBe(false);
    const park = t.site.building.dockPark;
    expect(Math.hypot(t.site.forklift.truck.position.x - park[0], t.site.forklift.truck.position.y - park[1])).toBeLessThan(1);
  });
  it('a backspace that takes the shelf back to three rows while the forklift drives over cancels the lift', () => {
    const t = setup();
    t.type('ab\ncd\nef\n');
    for (let i = 0; i < 600 && !t.site.forklift.busy; i++) t.step(1 / 30);
    expect(t.site.forklift.busy).toBe(true);
    t.step(0.5);
    t.director.handle({ type: 'backspace' }); // removes the empty fourth row
    expect(t.shelf.rows).toHaveLength(3);
    t.step(30);
    expect(t.shipped).toEqual([]);
    expect(t.shelf.text()).toBe('ab\ncd\nef');
    expect(t.site.forklift.busy).toBe(false);
    expect(t.handles[1].disposed).toBe(false); // 'a' is still on the shelf
  });
});
