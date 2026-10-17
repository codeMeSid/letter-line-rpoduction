import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ProductKind } from '../engine/types';
import { Destroyer } from './destroyer';
import { BELT_TOP } from '../factories/shared/dims';
import { miniFactory } from './testkit';

function setup(over = {}) {
  const f = miniFactory(over);
  const flashes: number[] = [];
  const d = new Destroyer({
    director: f.director, looks: f.looks, particles: f.particles, audio: f.audio, settings: () => f.settings,
    hosts: new Map<ProductKind, typeof f.host>([['letter', f.host]]), flash: () => flashes.push(1), shake: () => {},
  });
  f.director.setBackspaceHandler(d);
  f.parent.add(d.group);
  const step = (s: number) => { for (let t = 0; t < s; t += 1 / 30) { f.director.update(1 / 30); f.host.update(1 / 30, 1 / 30); d.update(1 / 30); } };
  const shelve = () => { for (let i = 0; i < 600 && f.director.jobsOf('letter').length; i++) step(1 / 30); };
  const bs = () => f.director.handle({ type: 'backspace' });
  return { ...f, d, step, shelve, bs, flashes };
}

const chunkMesh = (root: THREE.Object3D): THREE.InstancedMesh => {
  let m: THREE.InstancedMesh | null = null;
  root.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData.role === 'steel') m = o as THREE.InstancedMesh; });
  return m!;
};
const zOf = (m: THREE.InstancedMesh, i: number) => m.getMatrixAt(i, new THREE.Matrix4()).elements[14];

describe('Destroyer', () => {
  it('shoots a shelved char: slot dies at once, then (close-up) is removed and the product shatters', () => {
    const t = setup();
    t.type('a');
    t.shelve();
    const h = t.handles[0];
    t.bs();
    expect(t.director.shelf('letter').text()).toBe('');
    expect(t.director.shelf('letter').rows[0][0].state).toBe('dying');
    t.step(2);
    expect(t.director.shelf('letter').rows[0]).toHaveLength(0);
    expect(h.disposed).toBe(true);
    expect(t.plays).toEqual(expect.arrayContaining(['shotgun-rack', 'shotgun-blast', 'metal-crumple']));
    expect(t.flashes).toHaveLength(1);
  });
  it('shoot mode: an in-flight char is removed at once and shot where it is', () => {
    const t = setup({ inflightBackspace: 'shoot' });
    t.type('a');
    t.step(0.2);
    const h = t.handles[0];
    t.bs();
    expect(t.director.shelf('letter').rows[0]).toHaveLength(0);
    expect(t.director.jobsOf('letter')).toHaveLength(0);
    expect(h.disposed).toBe(false);
    t.step(2);
    expect(h.disposed).toBe(true);
    expect(t.plays).toContain('shotgun-blast');
  });
  it('a queued (never seen) job goes quietly', () => {
    const t = setup({ pace: 'cinematic' });
    t.type('ab');
    t.bs();
    t.step(2);
    expect(t.director.shelf('letter').text()).toBe('a');
    expect(t.plays).not.toContain('shotgun-blast');
  });
  it('rapid backspaces over shelved abcde: five shots, each slot removed once', () => {
    const t = setup();
    t.type('abcde');
    t.shelve();
    const removed: number[] = [];
    t.director.events.on('slot:removed', ({ slotId }) => removed.push(slotId));
    for (let i = 0; i < 5; i++) t.bs();
    t.step(8);
    expect(t.director.shelf('letter').text()).toBe('');
    expect(new Set(removed).size).toBe(5);
    expect(removed).toHaveLength(5);
    expect(t.plays.filter((p) => p === 'shotgun-blast')).toHaveLength(5);
  });
  it('newline is removed with no fx', () => {
    const t = setup();
    t.type('a\n');
    t.bs();
    expect(t.director.shelf('letter').rows).toHaveLength(1);
  });
  it('the shot product is held where it stood while the gun lines up, then its steel chunks fly', () => {
    const t = setup();
    t.type('a');
    t.shelve();
    const h = t.handles[0];
    const at = h.root.position.clone();
    t.bs();
    t.step(0.3);
    expect(h.root.position.distanceTo(at)).toBeLessThan(1e-6);
    expect(h.root.parent).toBe(t.d.group);
    t.step(1.5);
    expect(h.disposed).toBe(true);
    expect(chunkMesh(t.d.group).count).toBeGreaterThan(0);
  });
  it('a backspace on an empty shelf does nothing', () => {
    const t = setup();
    expect(() => { t.bs(); t.step(1); }).not.toThrow();
    expect(t.plays).not.toContain('shotgun-blast');
  });
  it('dispose mid-shot frees the held product', () => {
    const t = setup();
    t.type('a');
    t.shelve();
    const h = t.handles[0];
    t.bs();
    t.step(0.1);
    t.d.dispose();
    expect(h.disposed).toBe(true);
    expect(t.d.group.parent).toBeNull();
  });
  it('backspaces waiting behind a newline carry on: ab\\ncd + five backspaces empties the shelf', () => {
    const t = setup();
    t.type('ab\ncd');
    t.shelve();
    for (let i = 0; i < 5; i++) t.bs();
    t.step(10);
    expect(t.director.shelf('letter').text()).toBe('');
    expect(t.director.shelf('letter').rows).toHaveLength(1);
    expect(t.plays.filter((p) => p === 'shotgun-blast')).toHaveLength(4);
  });
  it('a char shot during the robot placement arc shatters onto the factory floor, not mid-air', () => {
    const t = setup();
    t.type('a');
    const [job] = t.director.jobsOf('letter');
    for (let i = 0; i < 900 && job.phase !== 'placing'; i++) t.step(1 / 30);
    t.step(0.4); // the arc has lifted the product well above the belt
    expect(job.phase).toBe('placing');
    expect(job.pos[2]).toBeGreaterThan(BELT_TOP + 30);
    t.bs();
    t.step(2.8); // shot at ~0.7 s; ~2.1 s later the chunks (life 2.5 s) and the shell have landed and stopped hopping
    const frags = chunkMesh(t.d.group);
    expect(frags.count).toBeGreaterThan(0);
    for (let i = 0; i < frags.count; i++) { expect(zOf(frags, i)).toBeGreaterThanOrEqual(0); expect(zOf(frags, i)).toBeLessThan(5); }
    t.d.group.updateMatrixWorld(true);
    const hulls: THREE.Object3D[] = [];
    t.d.group.traverse((o) => { if (o.userData.role === 'paint-accent') hulls.push(o); });
    expect(hulls.length).toBeGreaterThan(0);
    for (const o of hulls) expect(o.getWorldPosition(new THREE.Vector3()).z).toBeLessThan(5);
  });
  it('restyle reaches products held for their shot, and only those', () => {
    const t = setup();
    t.type('a');
    t.shelve();
    const h = t.handles[0];
    let n = 0;
    h.restyle = () => { n++; };
    t.bs();
    t.step(0.1);
    t.d.restyle();
    expect(n).toBe(1);
    t.step(2);
    t.d.restyle();
    expect(n).toBe(1);
  });
});
