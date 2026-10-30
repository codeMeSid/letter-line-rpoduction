import { describe, expect, it } from 'vitest';
import type { StationDef } from '../../engine/station';
import { BELT_W } from '../shared/dims';
import { drive, job as letterJob, runJob, testCtx } from '../letter/stations/testkit';
import { MUG_STAGES } from './product';
import { bisqueKiln } from './stations/bisqueKiln';
import { blunger } from './stations/blunger';
import { caster } from './stations/caster';
import { clayBin } from './stations/clayBin';
import { dryer } from './stations/dryer';
import { glazeKiln } from './stations/glazeKiln';
import { glazer } from './stations/glazer';
import { handler } from './stations/handler';
import { inspection } from './stations/inspection';
import { printer } from './stations/printer';
import { robot } from './stations/robot';

const job = (ch: string, isSpace = false) => ({ ...letterJob(ch, isSpace), product: 'mug' as const, stage: 'tub' });

/** [station, output stage, stages it may shape, edge-triggered sounds per job, emits particles] */
const STATIONS: [StationDef, string | undefined, string[], Record<string, number>, boolean][] = [
  [clayBin, 'clay', ['clay'], { 'pour-sand': 1 }, true],
  [blunger, 'slip', ['slip'], { 'mixer-churn': 1 }, true],
  [caster, 'cast', ['cast'], { 'filler-pour': 1, 'mould-clamp': 1 }, true],
  [handler, 'handled', ['handled'], { 'press-thump': 1 }, true],
  [dryer, 'dried', ['dried'], { 'motor-whir': 1 }, true],
  [bisqueKiln, 'bisque', ['bisque'], { hiss: 1 }, true],
  [inspection, undefined, ['bisque'], { 'camera-flash': 1, ding: 1 }, true],
  [glazer, 'glazed', ['glazed'], { 'filler-pour': 1 }, true],
  [glazeKiln, 'fired', ['fired'], { 'motor-whir': 1 }, true],
  [printer, 'printed', ['printed'], { 'press-thump': 2 }, false],
];

const tally = (names: string[]) => names.reduce<Record<string, number>>((m, n) => ({ ...m, [n]: (m[n] ?? 0) + 1 }), {});

describe.each(STATIONS)('%s', (def, out, shaped, sounds, emits) => {
  it('declares its output stage (a real product stage) and a footprint wider than the belt', () => {
    expect(def.outputStage).toBe(out);
    if (out) expect(MUG_STAGES).toContain(out);
    expect(Math.min(...def.footprint)).toBeGreaterThanOrEqual(BELT_W);
  });
  it('shapes the product through its own stages, ends complete, passes', () => {
    const r = runJob(def, job('A'));
    expect(r.p.shapes.length).toBeGreaterThan(10);
    for (const [s] of r.p.shapes) expect(shaped).toContain(s);
    expect(r.p.shapes[r.p.shapes.length - 1][1]).toBeCloseTo(1, 6);
    expect(r.verdict).toBe('pass');
  });
  it('space jobs make no sound and no particles', () => {
    const r = runJob(def, job('', true));
    expect(r.k.plays).toEqual([]);
    expect(r.k.particles.count).toBe(0);
  });
  it('a mug job makes sound and (where it works loose material) particles inside the footprint', () => {
    const r = runJob(def, job('A'));
    expect(r.k.plays.length).toBeGreaterThan(0);
    const { count, p } = r.k.particles;
    expect(count > 0).toBe(emits);
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
    expect(k.particles.count).toBe(0);
    inst.destroy();
    expect(k.group.children.length).toBe(0);
    expect(k.loops.every((l) => l.stopped)).toBe(true);
  });
});

describe('inspection', () => {
  it('rejects a defective mug only', () => {
    const k = testCtx();
    const inst = inspection.create(k.ctx);
    expect(drive(inspection, inst, { ...job('A'), defect: true }).verdict).toBe('reject');
    expect(k.plays).toContain('reject-kick');
    expect(drive(inspection, inst, job('A')).verdict).toBe('pass');
  });
});

describe('robot', () => {
  it('is the rail robot with its own id', () => {
    expect(robot.id).toBe('mug-robot');
    expect(robot.outputStage).toBeUndefined();
  });
});
