import { describe, expect, it } from 'vitest';
import type { StationDef } from '../../engine/station';
import { BELT_W } from '../shared/dims';
import { cooling } from './stations/cooling';
import { moulder } from './stations/moulder';
import { pour } from './stations/pour';
import { shakeout } from './stations/shakeout';
import { job, runJob, testCtx } from './stations/testkit';

const STATIONS: [StationDef, string][] = [[moulder, 'moulded'], [pour, 'poured'], [cooling, 'cooled'], [shakeout, 'cast']];

describe.each(STATIONS)('%s', (def, out) => {
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
