import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { letterGeometry } from '../../engine/letterSolid';
import type { StationDef } from '../../engine/station';
import { BELT_W } from '../shared/dims';
import { LETTER_H, LETTER_R } from './product';
import { cooling } from './stations/cooling';
import { moulder } from './stations/moulder';
import { pour } from './stations/pour';
import { shakeout } from './stations/shakeout';
import { drive, job, recProduct, runJob, testCtx } from './stations/testkit';

/** [station, output stage, edge-triggered sounds per job] */
const STATIONS: [StationDef, string, Record<string, number>][] = [
  [moulder, 'moulded', { 'pour-sand': 1, 'press-thump': 1 }],
  [pour, 'poured', { hiss: 1 }],
  [cooling, 'cooled', { hiss: 1 }],
  [shakeout, 'cast', { crunch: 1, 'press-thump': 1 }],
];

const tally = (names: string[]) => names.reduce<Record<string, number>>((m, n) => ({ ...m, [n]: (m[n] ?? 0) + 1 }), {});

describe.each(STATIONS)('%s', (def, out, sounds) => {
  it('declares its output stage and a footprint wider than the belt', () => {
    expect(def.outputStage).toBe(out);
    expect(Math.min(...def.footprint)).toBeGreaterThanOrEqual(BELT_W);
  });
  it('shapes the product through its stage, ending at t=1, and passes', () => {
    const r = runJob(def, job('A'));
    expect(r.p.shapes.length).toBeGreaterThan(10);
    expect(r.p.shapes.every(([s]) => s === out)).toBe(true);
    expect(r.p.shapes[r.p.shapes.length - 1][1]).toBeCloseTo(1, 6);
    expect(r.verdict).toBe('pass');
  });
  it('space jobs make no sound and no particles', () => {
    const r = runJob(def, job('', true));
    expect(r.k.plays).toEqual([]);
    expect(r.k.particles.count).toBe(0);
  });
  it('a letter job makes sound and particles, emitted in world space inside the footprint', () => {
    const r = runJob(def, job('A'));
    expect(r.k.plays.length).toBeGreaterThan(0);
    const { count, p } = r.k.particles;
    expect(count).toBeGreaterThan(0);
    const [ox, oy] = r.k.ctx.origin;
    for (let i = 0; i < count; i++) {
      expect(Math.abs(p[i * 3] - ox)).toBeLessThanOrEqual(def.footprint[0] / 2);
      expect(Math.abs(p[i * 3 + 1] - oy)).toBeLessThanOrEqual(def.footprint[1] / 2);
    }
  });
  it('fires each edge-triggered sound exactly once per job', () => {
    const k = testCtx();
    const inst = def.create(k.ctx);
    drive(def, inst, job('A'));
    drive(def, inst, job('B'));
    expect(tally(k.plays)).toEqual(Object.fromEntries(Object.entries(sounds).map(([n, c]) => [n, 2 * c])));
  });
  it('builds geometry, idles without a job, and cleans up on destroy', () => {
    const k = testCtx();
    const inst = def.create(k.ctx);
    expect(k.group.children.length).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) inst.update(1 / 30, null, 0, null);
    inst.destroy();
    expect(k.group.children.length).toBe(0);
    expect(k.loops.every((l) => l.stopped)).toBe(true);
  });
});

describe('moulder', () => {
  it('destroy never disposes the cached letter geometry it borrowed for the pattern', () => {
    const geom = letterGeometry('A', { height: LETTER_H, radius: LETTER_R });
    let disposed = false;
    const mark = () => { disposed = true; };
    geom.addEventListener('dispose', mark);
    const r = runJob(moulder, job('A'));
    r.inst.destroy();
    geom.removeEventListener('dispose', mark);
    expect(disposed).toBe(false);
  });
});

describe('pour', () => {
  it('the trolley never clips the gantry knee braces, mid-job or idle', () => {
    const k = testCtx();
    const inst = pour.create(k.ctx);
    const carriage = k.group.getObjectByName('trolley')!;
    const braces = ['brace-left', 'brace-right'].map((n) => k.group.getObjectByName(n)!);
    expect(carriage).toBeDefined();
    expect(braces.every(Boolean)).toBe(true);
    const clear = () => {
      k.group.updateMatrixWorld(true);
      const c = new THREE.Box3().setFromObject(carriage);
      return braces.every((b) => !c.intersectsBox(new THREE.Box3().setFromObject(b)));
    };
    const j = job('A');
    const p = recProduct();
    inst.begin(j, p);
    for (let i = 0; i <= 60; i++) {
      inst.update(pour.duration / 60, j, i / 60, p);
      expect(clear()).toBe(true);
    }
    for (let i = 0; i < 60; i++) {
      inst.update(1 / 30, null, 0, null);
      expect(clear()).toBe(true);
    }
  });
});

describe('shakeout', () => {
  it('vibrates the product during the shake window and leaves it at job.pos after', () => {
    let ms = 0;
    const k = testCtx(() => ms);
    const inst = shakeout.create(k.ctx);
    const j = job('A');
    const p = recProduct();
    inst.begin(j, p);
    const zs: number[] = [];
    for (let i = 0; i <= 60; i++) {
      ms += 7;
      p.root.position.set(...j.pos); // the host positions the root before every update
      inst.update(shakeout.duration / 60, j, i / 60, p);
      if (i / 60 >= 0.2 && i / 60 <= 0.6) zs.push(p.root.position.z);
    }
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.5);
    expect(p.root.position.toArray()).toEqual(j.pos); // t = 1: no offset left over
  });
});
