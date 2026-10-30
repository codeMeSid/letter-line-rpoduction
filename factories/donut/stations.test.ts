import { describe, expect, it } from 'vitest';
import type { StationDef } from '../../engine/station';
import { BELT_W } from '../shared/dims';
import { drive, job as letterJob, recProduct, runJob, testCtx } from '../letter/stations/testkit';
import { DONUT_STAGES } from './product';
import { cooler } from './stations/cooler';
import { depositor } from './stations/depositor';
import { flour } from './stations/flour';
import { fryer } from './stations/fryer';
import { glazer } from './stations/glazer';
import { inspection } from './stations/inspection';
import { mixer } from './stations/mixer';
import { piper } from './stations/piper';
import { proofer } from './stations/proofer';
import { robot } from './stations/robot';
import { sprinkler } from './stations/sprinkler';

const job = (ch: string, isSpace = false) => ({ ...letterJob(ch, isSpace), product: 'donut' as const, stage: 'bowl' });

/** [station, output stage, stages it may shape, edge-triggered sounds per job] */
const STATIONS: [StationDef, string | undefined, string[], Record<string, number>][] = [
  [flour, 'flour', ['flour'], { 'pour-sand': 1 }],
  [mixer, 'dough', ['dough'], { 'mixer-churn': 1 }],
  [proofer, 'proofed', ['proofed'], { 'oven-hum': 1 }],
  [depositor, 'ring', ['ring'], { 'press-thump': 1 }],
  [fryer, 'fried', ['fried'], { 'kiln-roar': 1 }],
  [cooler, 'cooled', ['cooled'], { 'motor-whir': 1 }],
  [glazer, 'glazed', ['glazed'], { 'filler-pour': 1 }],
  [sprinkler, 'sprinkled', ['sprinkled'], { whoosh: 1 }],
  [piper, 'lettered', ['lettered'], { 'coder-tick': 1 }],
  [inspection, undefined, ['lettered'], { 'camera-flash': 1 }],
];

const tally = (names: string[]) => names.reduce<Record<string, number>>((m, n) => ({ ...m, [n]: (m[n] ?? 0) + 1 }), {});

describe.each(STATIONS)('%s', (def, out, shaped, sounds) => {
  it('declares its output stage (a real product stage) and a footprint wider than the belt', () => {
    expect(def.outputStage).toBe(out);
    if (out) expect(DONUT_STAGES).toContain(out);
    expect(Math.min(...def.footprint)).toBeGreaterThanOrEqual(BELT_W);
  });
  it('shapes the product through its own stage, ends complete, passes', () => {
    const r = runJob(def, job('A'));
    expect(r.p.shapes.length).toBeGreaterThan(10);
    for (const [s] of r.p.shapes) expect(shaped).toContain(s);
    expect(r.p.shapes[r.p.shapes.length - 1][1]).toBeCloseTo(1, 6);
    expect(r.p.root.rotation.z).toBe(0);
    expect(r.verdict).toBe('pass');
  });
  it('space jobs make no sound and no particles', () => {
    const r = runJob(def, job('', true));
    expect(r.k.plays).toEqual([]);
    expect(r.k.particles.count).toBe(0);
  });
  it('a donut job makes sound and particles inside the footprint', () => {
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
  it('builds geometry, idles without a job, restyles and cleans up on destroy', () => {
    const k = testCtx();
    const inst = def.create(k.ctx);
    expect(k.group.children.length).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) inst.update(1 / 30, null, 0, null);
    inst.restyle?.();
    inst.destroy();
    expect(k.group.children.length).toBe(0);
    expect(k.loops.every((l) => l.stopped)).toBe(true);
  });
});

describe('inspection', () => {
  it('rejects a defective donut only', () => {
    const k = testCtx();
    const inst = inspection.create(k.ctx);
    expect(drive(inspection, inst, { ...job('A'), defect: true }).verdict).toBe('reject');
    expect(k.plays).toContain('reject-kick');
    expect(drive(inspection, inst, job('A')).verdict).toBe('pass');
  });
});

describe('depositor and fryer', () => {
  it('depositor turns the tray while drawing the ring', () => {
    const k = testCtx();
    const inst = depositor.create(k.ctx);
    const p = recProduct();
    const j = job('A');
    inst.begin(j, p);
    let max = 0;
    for (let i = 0; i <= 60; i++) { inst.update(depositor.duration / 60, j, i / 60, p); max = Math.max(max, Math.abs(p.root.rotation.z)); }
    expect(max).toBeGreaterThan(5);
  });
  it('fryer swings the tray to the vat, dips it, and brings it back', () => {
    const k = testCtx();
    const inst = fryer.create(k.ctx);
    const p = recProduct();
    const j = job('A');
    inst.begin(j, p);
    let maxY = 0;
    let end = 0;
    for (let i = 0; i <= 60; i++) {
      p.root.position.set(0, 0, 0);
      inst.update(fryer.duration / 60, j, i / 60, p);
      maxY = Math.max(maxY, p.root.position.y);
      end = Math.abs(p.root.position.y) + Math.abs(p.root.position.z);
    }
    expect(maxY).toBeGreaterThan(40);
    expect(end).toBeLessThan(0.5);
  });
});

describe('robot', () => {
  it('is the rail robot with its own id', () => {
    expect(robot.id).toBe('donut-robot');
    expect(robot.outputStage).toBeUndefined();
  });
});
