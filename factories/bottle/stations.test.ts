import { describe, expect, it } from 'vitest';
import type { StationDef } from '../../engine/station';
import { BELT_W } from '../shared/dims';
import { BOTTLE_STAGES } from './product';
import { capper } from './stations/capper';
import { coder } from './stations/coder';
import { filler } from './stations/filler';
import { furnace } from './stations/furnace';
import { gobShear } from './stations/gobShear';
import { inspection } from './stations/inspection';
import { isMachine } from './stations/isMachine';
import { labeler } from './stations/labeler';
import { lehr } from './stations/lehr';
import { mixer } from './stations/mixer';
import { rinser } from './stations/rinser';
import { robot } from './stations/robot';
import { silos } from './stations/silos';
import { drive, job as letterJob, recProduct, runJob, testCtx } from '../letter/stations/testkit';

const job = (ch: string, isSpace = false) => ({ ...letterJob(ch, isSpace), product: 'bottle' as const, stage: 'tub' });

/** [station, output stage, stages it may shape, edge-triggered sounds per job, emits particles] */
const STATIONS: [StationDef, string | undefined, string[], Record<string, number>, boolean][] = [
  [silos, 'batch', ['batch'], { 'pour-sand': 1 }, true],
  [mixer, 'mixed', ['mixed'], { 'mixer-churn': 1 }, true],
  [furnace, 'melted', ['melted'], { 'furnace-roar': 1 }, true],
  [gobShear, 'gob', ['gob'], { 'gob-shear': 1 }, true],
  [isMachine, 'bottle-hot', ['parison', 'bottle-hot'], { 'mould-clamp': 2, 'air-blow': 1 }, true],
  [lehr, 'bottle', ['bottle'], { hiss: 1 }, true],
  [inspection, undefined, ['bottle'], { 'camera-flash': 1 }, true],
  [rinser, undefined, ['bottle'], { 'water-jet': 1 }, true],
  [filler, 'filled', ['filled'], { 'filler-pour': 1 }, true],
  [capper, 'capped', ['capped'], { 'cap-press': 1 }, true],
  [labeler, 'labelled', ['labelled'], { 'labeler-wrap': 1 }, false],
  [coder, undefined, ['labelled'], { 'laser-zap': 1 }, true],
];

const tally = (names: string[]) => names.reduce<Record<string, number>>((m, n) => ({ ...m, [n]: (m[n] ?? 0) + 1 }), {});

describe.each(STATIONS)('%s', (def, out, shaped, sounds, emits) => {
  it('declares its output stage (a real product stage) and a footprint wider than the belt', () => {
    expect(def.outputStage).toBe(out);
    if (out) expect(BOTTLE_STAGES).toContain(out);
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
  it('a bottle job makes sound and (where it works loose material) particles inside the footprint', () => {
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
    inst.destroy();
    expect(k.group.children.length).toBe(0);
    expect(k.loops.every((l) => l.stopped)).toBe(true);
  });
});

describe('inspection', () => {
  it('rejects a defective bottle only', () => {
    const k = testCtx();
    const inst = inspection.create(k.ctx);
    expect(drive(inspection, inst, { ...job('A'), defect: true }).verdict).toBe('reject');
    expect(k.plays).toContain('reject-kick');
    expect(drive(inspection, inst, job('A')).verdict).toBe('pass');
  });
});

describe('rinser and furnace', () => {
  /** Max |rotation| of the product root over one job, and its rotation after 30 idle frames (the host re-positions the root each frame; here it is never reset). */
  function swing(def: StationDef, axis: 'x' | 'y') {
    const k = testCtx();
    const inst = def.create(k.ctx);
    const p = recProduct();
    const j = job('A');
    inst.begin(j, p);
    let max = 0;
    for (let i = 0; i <= 60; i++) {
      p.root.position.set(0, 0, 0);
      inst.update(def.duration / 60, j, i / 60, p);
      max = Math.max(max, Math.abs(p.root.rotation[axis]));
    }
    return { max, end: p.root.rotation[axis] };
  }
  it('rinser inverts the bottle and sets it upright again', () => {
    const r = swing(rinser, 'y');
    expect(r.max).toBeCloseTo(Math.PI, 1);
    expect(Math.abs(r.end)).toBeLessThan(0.05);
  });
  it('furnace tips the tub toward the mouth and sets it level again', () => {
    const r = swing(furnace, 'x');
    expect(r.max).toBeGreaterThan(1.5);
    expect(Math.abs(r.end)).toBeLessThan(0.05);
  });
});

describe('robot', () => {
  it('is the rail robot with its own id', () => {
    expect(robot.id).toBe('bottle-robot');
    expect(robot.outputStage).toBeUndefined();
  });
});
