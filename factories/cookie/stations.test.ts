import { describe, expect, it } from 'vitest';
import type { StationDef } from '../../engine/station';
import { drive, job as letterJob, runJob, testCtx } from '../letter/stations/testkit';
import { BELT_W } from '../shared/dims';
import { COOKIE_STAGES } from './product';
import { cooler } from './stations/cooler';
import { cutter } from './stations/cutter';
import { depositor } from './stations/depositor';
import { extruder } from './stations/extruder';
import { hopper } from './stations/hopper';
import { icer } from './stations/icer';
import { mixer } from './stations/mixer';
import { oven } from './stations/oven';
import { packer } from './stations/packer';
import { robot } from './stations/robot';
import { sprinkler } from './stations/sprinkler';

const job = (ch: string, isSpace = false) => ({ ...letterJob(ch, isSpace), product: 'cookie' as const, stage: 'bowl' });

/** [station, output stage, stage it shapes, edge-triggered sounds per job] */
const STATIONS: [StationDef, string, string, Record<string, number>][] = [
  [hopper, 'batch', 'batch', { 'pour-sand': 1 }],
  [mixer, 'dough', 'dough', { 'mixer-churn': 1 }],
  [extruder, 'extruded', 'extruded', { 'press-thump': 1 }],
  [cutter, 'cut', 'cut', { 'gob-shear': 1 }],
  [depositor, 'chipped', 'chipped', { 'pour-sand': 1 }],
  [oven, 'baked', 'baked', { hiss: 1 }],
  [cooler, 'cooled', 'cooled', { whoosh: 1 }],
  [icer, 'iced', 'iced', { 'filler-pour': 1 }],
  [sprinkler, 'sprinkled', 'sprinkled', { 'pour-sand': 1 }],
  [packer, 'packed', 'packed', { 'cap-press': 1 }],
];

const tally = (names: string[]) => names.reduce<Record<string, number>>((m, n) => ({ ...m, [n]: (m[n] ?? 0) + 1 }), {});

describe.each(STATIONS)('%s', (def, out, shaped, sounds) => {
  it('declares its output stage (a real product stage) and a footprint wider than the belt', () => {
    expect(def.outputStage).toBe(out);
    expect(COOKIE_STAGES).toContain(out);
    expect(Math.min(...def.footprint)).toBeGreaterThanOrEqual(BELT_W);
  });
  it('shapes the product through its own stage, ends complete, passes', () => {
    const r = runJob(def, job('A'));
    expect(r.p.shapes.length).toBeGreaterThan(10);
    for (const [s] of r.p.shapes) expect(s).toBe(shaped);
    expect(r.p.shapes[r.p.shapes.length - 1][1]).toBeCloseTo(1, 6);
    expect(r.verdict).toBe('pass');
  });
  it('space jobs make no sound and no particles', () => {
    const r = runJob(def, job('', true));
    expect(r.k.plays).toEqual([]);
    expect(r.k.particles.count).toBe(0);
  });
  it('a cookie job makes sound and keeps particles inside the footprint', () => {
    const r = runJob(def, job('A'));
    expect(r.k.plays.length).toBeGreaterThan(0);
    const { count, p } = r.k.particles;
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

describe('robot', () => {
  it('is the rail robot with its own id', () => {
    expect(robot.id).toBe('cookie-robot');
    expect(robot.outputStage).toBeUndefined();
  });
});
