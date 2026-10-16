import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AudioBus } from '../audio/bus';
import { Director } from './director';
import type { FactoryDef } from './factory';
import { FactoryHost } from './factoryHost';
import { Looks } from './looks';
import { ParticleSystem } from './particles';
import type { ProductHandle, ProductModel } from './product';
import { defaultSettings, type Settings } from './settings';
import type { StationDef, StationInstance } from './station';
import type { Job } from './types';

interface RecHandle extends ProductHandle { shapes: [string, number][]; disposed: boolean; restyled: number }
interface RecInst extends StationInstance { seen: (Job | null)[]; got: (ProductHandle | null)[]; destroyed: boolean; restyled: number }

function setup() {
  const settings: Settings = { ...defaultSettings, product: 'letter', layout: 'pan' };
  const director = new Director({ settings: () => settings, now: () => 0 });
  const handles: RecHandle[] = [];
  const insts: RecInst[] = [];
  const product: ProductModel = {
    kind: 'letter', stages: ['raw', 'a', 'b'], size: [26, 8, 32], lineSize: 46,
    create: () => {
      const h: RecHandle = {
        root: new THREE.Group(), shapes: [], disposed: false, restyled: 0,
        shape(s, t) { h.shapes.push([s, t]); }, place() {}, restyle() { h.restyled++; }, dispose() { h.disposed = true; },
      };
      handles.push(h);
      return h;
    },
  };
  const station = (id: string, out: string): StationDef => ({
    id, label: id, footprint: [90, 90], height: 60, duration: 0.5, outputStage: out,
    create: () => {
      const i: RecInst = {
        seen: [], got: [], destroyed: false, restyled: 0,
        begin() {}, update(_dt, job, _t, p) { i.seen.push(job); i.got.push(p); }, finish: () => 'pass',
        restyle() { i.restyled++; }, destroy() { i.destroyed = true; },
      };
      insts.push(i);
      return i;
    },
  });
  const def: FactoryDef = { kind: 'letter', label: 'L', product, stations: [station('s1', 'a'), station('s2', 'b')] };
  const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
  const parent = new THREE.Group();
  const host = new FactoryHost(def, [0, 0, 0], { parent, looks, director, particles: new ParticleSystem(), audio: new AudioBus(), settings: () => settings, now: () => 0 }, 'pan');
  const step = (n: number, dt = 1 / 30) => { for (let i = 0; i < n; i++) { director.update(dt); host.update(dt, dt); } };
  return { settings, director, host, handles, insts, step };
}

describe('FactoryHost', () => {
  it('creates a handle per job, positions it, hides queued jobs', () => {
    const f = setup();
    for (const c of 'abc') f.director.handle({ type: 'char', char: c });
    f.step(1);
    expect(f.handles).toHaveLength(3);
    const jobs = f.director.jobsOf('letter');
    const queued = jobs.filter((j) => j.phase === 'queued');
    expect(queued.length).toBeGreaterThan(0);
    for (const j of jobs) {
      const h = f.handles[j.id - 1];
      expect(h.root.visible).toBe(j.phase !== 'queued');
      expect(h.root.position.toArray()).toEqual(j.pos);
    }
  });
  it('stations receive their job + handle; off-station jobs are shaped once per stage', () => {
    const f = setup();
    f.director.handle({ type: 'char', char: 'a' });
    f.step(60);
    expect(f.insts[0].seen.some((j) => j !== null)).toBe(true);
    expect(f.insts[0].got.some((p) => p === f.handles[0])).toBe(true);
    const shapes = f.handles[0].shapes.filter(([, t]) => t === 1).map(([s]) => s);
    expect(new Set(shapes).size).toBe(shapes.length);
  });
  it('backspace mid-station disposes the handle and the station idles', () => {
    const f = setup();
    f.director.handle({ type: 'char', char: 'a' });
    f.step(3);
    f.director.handle({ type: 'backspace' });
    f.step(2);
    expect(f.handles[0].disposed).toBe(true);
    expect(f.insts[0].seen[f.insts[0].seen.length - 1]).toBeNull();
  });
  it('a finished product is adopted by the shelf (not disposed)', () => {
    const f = setup();
    f.director.handle({ type: 'char', char: 'a' });
    f.step(600);
    expect(f.director.shelf('letter').text()).toBe('a');
    expect(f.handles[0].disposed).toBe(false);
    expect(f.host.shelfView.group.children).toContain(f.handles[0].root);
  });
  it('relayout keeps handles and rebuilds stations; restyle reaches handles and stations', () => {
    const f = setup();
    f.director.handle({ type: 'char', char: 'a' });
    f.step(3);
    const before = f.insts.slice();
    f.host.relayout('snake');
    expect(before.every((i) => i.destroyed)).toBe(true);
    expect(f.handles[0].disposed).toBe(false);
    f.host.restyle();
    expect(f.handles[0].restyled).toBe(1);
    expect(f.insts[f.insts.length - 1].restyled).toBe(1);
  });
});
