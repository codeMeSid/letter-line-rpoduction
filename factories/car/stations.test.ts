import { describe, expect, it } from 'vitest';
import type { StationDef } from '../../engine/station';
import { drive, job as letterJob, runJob, testCtx } from '../letter/stations/testkit';
import { BELT_W } from '../shared/dims';
import { CAR_STAGES } from './product';
import { axler } from './stations/axler';
import { boxer } from './stations/boxer';
import { chiller } from './stations/chiller';
import { heater } from './stations/heater';
import { hopper } from './stations/hopper';
import { inspect } from './stations/inspect';
import { paint } from './stations/paint';
import { press } from './stations/press';
import { printer } from './stations/printer';
import { robot } from './stations/robot';
import { trimmer } from './stations/trimmer';
import { wheeler } from './stations/wheeler';

const job = (ch: string, isSpace = false) => ({ ...letterJob(ch, isSpace), product: 'car' as const, stage: 'pellets' });

/** [station, output stage, stages it may shape, edge-triggered sounds per job, emits particles] */
const STATIONS: [StationDef, string | undefined, string[], Record<string, number>, boolean][] = [
  [hopper, 'pellets', ['pellets'], { 'pour-sand': 1 }, true],
  [heater, 'melted', ['melted'], { hiss: 1 }, true],
  [press, 'moulded', ['moulded'], { 'mould-clamp': 2, 'injection-thunk': 1 }, true],
  [chiller, 'cooled', ['cooled'], { 'air-blow': 1 }, true],
  [trimmer, 'trimmed', ['trimmed'], { crunch: 1 }, true],
  [axler, 'axled', ['axled'], { 'press-thump': 1 }, true],
  [wheeler, 'wheeled', ['wheeled'], { 'press-thump': 1 }, true],
  [paint, 'painted', ['painted'], { whoosh: 1 }, true],
  [printer, 'printed', ['printed'], { 'coder-tick': 1 }, true],
  [inspect, undefined, ['printed'], { 'camera-flash': 1 }, true],
  [boxer, 'boxed', ['boxed'], { 'bend-squeak': 1, 'press-thump': 1 }, false],
];

const tally = (names: string[]) => names.reduce<Record<string, number>>((m, n) => ({ ...m, [n]: (m[n] ?? 0) + 1 }), {});

describe.each(STATIONS)('%s', (def, out, shaped, sounds, emits) => {
  it('declares its output stage and a footprint wider than the belt', () => {
    expect(def.outputStage).toBe(out);
    if (out) expect(CAR_STAGES).toContain(out);
    expect(Math.min(...def.footprint)).toBeGreaterThanOrEqual(BELT_W);
  });
  it('shapes the product through its own stage, ends complete, passes', () => {
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
  it('a car job makes sound and particles inside the footprint', () => {
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
    for (let i = 0; i < 30; i++) inst.update(1 / 30, null, 0, null);
    inst.destroy();
    expect(k.group.children).toHaveLength(0);
  });
});

describe('inspect', () => {
  it('rejects a defective car', () => {
    const k = testCtx();
    const inst = inspect.create(k.ctx);
    expect(inst.finish({ ...job('A'), defect: true })).toBe('reject');
  });
});

describe('robot', () => {
  it('is the rail robot with its own id', () => {
    expect(robot.id).toBe('car-robot');
    expect(robot.outputStage).toBeUndefined();
  });
});
