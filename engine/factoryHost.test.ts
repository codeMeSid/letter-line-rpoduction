import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AudioBus } from '../audio/bus';
import { Director } from './director';
import type { FactoryDef } from './factory';
import { FactoryHost } from './factoryHost';
import { Looks, type LookOptions } from './looks';
import { ParticleSystem } from './particles';
import type { ProductHandle, ProductModel } from './product';
import { defaultSettings, type Settings } from './settings';
import type { StationDef, StationInstance } from './station';
import type { Job, Vec3 } from './types';

interface RecHandle extends ProductHandle { shapes: [string, number][]; calls: string[]; disposed: boolean; restyled: number }
interface Begun { job: Job; product: ProductHandle | null; at: Vec3 | null; jobAt: Vec3 }
interface RecInst extends StationInstance {
  seen: (Job | null)[]; got: (ProductHandle | null)[]; begun: Begun[]; mesh: THREE.Mesh; destroyed: boolean; restyled: number;
}

const lookOpts: LookOptions = { look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' };

function setup(look: LookOptions['look'] = 'realistic') {
  const settings: Settings = { ...defaultSettings, product: 'letter', layout: 'pan' };
  const director = new Director({ settings: () => settings, now: () => 0 });
  const handles: RecHandle[] = [];
  const insts: RecInst[] = [];
  const product: ProductModel = {
    kind: 'letter', stages: ['raw', 'a', 'b'], size: [26, 8, 32], lineSize: 46,
    create: () => {
      const h: RecHandle = {
        root: new THREE.Group(), shapes: [], calls: [], disposed: false, restyled: 0,
        shape(s, t) { h.shapes.push([s, t]); h.calls.push(`shape:${s}:${t}`); },
        place() { h.calls.push('place'); },
        restyle() { h.restyled++; },
        dispose() { h.disposed = true; }, // like real handles: does not detach itself
      };
      handles.push(h);
      return h;
    },
  };
  const station = (id: string, out: string): StationDef => ({
    id, label: id, footprint: [90, 90], height: 60, duration: 0.5, outputStage: out,
    create: (ctx) => {
      const mesh = ctx.looks.part(new THREE.BoxGeometry(10, 10, 10), 'steel');
      const whole = ctx.looks.part(new THREE.BoxGeometry(4, 4, 4), 'steel');
      whole.name = 'whole';
      whole.userData.cut = false; // opted out of the cutaway slice
      ctx.group.add(mesh, whole);
      const i: RecInst = {
        seen: [], got: [], begun: [], mesh, destroyed: false, restyled: 0,
        begin(job, p) { i.begun.push({ job, product: p, at: p ? p.root.position.toArray() : null, jobAt: [...job.pos] }); },
        update(_dt, job, _t, p) { i.seen.push(job); i.got.push(p); },
        finish: () => 'pass',
        restyle() { i.restyled++; }, destroy() { i.destroyed = true; },
      };
      insts.push(i);
      return i;
    },
  });
  const def: FactoryDef = { kind: 'letter', label: 'L', product, stations: [station('s1', 'a'), station('s2', 'b')] };
  const looks = new Looks({ ...lookOpts, look });
  const parent = new THREE.Group();
  const host = new FactoryHost(def, [0, 0, 0], { parent, looks, director, particles: new ParticleSystem(), audio: new AudioBus(), settings: () => settings, now: () => 0 }, 'pan');
  const step = (n: number, dt = 1 / 30) => { for (let i = 0; i < n; i++) { director.update(dt); host.update(dt, dt); } };
  return { settings, director, host, handles, insts, step, looks, parent };
}

const meshes = (root: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
  return out;
};
const clip = (m: THREE.Mesh) => (m.material as THREE.Material).clippingPlanes;

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
  it('queued jobs are invisible: 30 typed chars never stack more than one visible product on station 0', () => {
    const f = setup();
    for (let i = 0; i < 30; i++) f.director.handle({ type: 'char', char: 'a' });
    f.step(1);
    expect(f.handles).toHaveLength(30);
    const anchor = new THREE.Vector3(...f.host.layout.anchors[0]);
    const stacked = f.handles.filter((h) => h.root.visible && h.root.position.distanceTo(anchor) < 1);
    expect(stacked.length).toBeLessThanOrEqual(1);
    expect(f.handles.filter((h) => !h.root.visible).length).toBeGreaterThanOrEqual(25);
  });
  it('a handle is created at its job position, so begin() never sees (0,0,0)', () => {
    const f = setup();
    f.director.handle({ type: 'char', char: 'a' });
    f.step(80); // through station 0, the conveyor and into station 1
    for (const inst of f.insts) {
      expect(inst.begun).toHaveLength(1);
      const b = inst.begun[0];
      expect(b.at).toEqual(b.jobAt);
      expect(b.at).not.toEqual([0, 0, 0]);
    }
  });
  it('newest() follows the newest job on the line, not one arcing to the shelf', () => {
    const f = setup();
    f.director.handle({ type: 'char', char: 'a' });
    f.director.handle({ type: 'char', char: 'b' });
    const [a, b] = f.director.jobsOf('letter');
    let checked = 0;
    for (let i = 0; i < 900 && b.phase !== 'shelved'; i++) {
      f.step(1);
      if (a.phase === 'placing' && b.phase !== 'queued' && b.phase !== 'placing') {
        expect(f.host.newest()).toEqual(b.pos);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('newest() falls back to the placing job when nothing else is on the line', () => {
    const f = setup();
    f.director.handle({ type: 'char', char: 'a' });
    const [a] = f.director.jobsOf('letter');
    for (let i = 0; i < 900 && a.phase !== 'placing'; i++) f.step(1);
    expect(a.phase).toBe('placing');
    expect(f.host.newest()).toEqual(a.pos);
  });
  it('stations receive their job + handle; off-station jobs are shaped once per stage', () => {
    const f = setup();
    f.director.handle({ type: 'char', char: 'a' });
    f.step(60);
    expect(f.insts[0].seen.some((j) => j !== null)).toBe(true);
    expect(f.insts[0].got.some((p) => p === f.handles[0])).toBe(true);
    // in a station the station shapes the product; off-station the host shapes it, once, to the new stage
    expect(f.handles[0].shapes).toEqual([['a', 1]]);
    f.step(540);
    expect(f.handles[0].shapes).toEqual([['a', 1], ['b', 1]]);
  });
  it('the final stage is shaped before the placing arc starts', () => {
    const f = setup();
    f.director.handle({ type: 'char', char: 'a' });
    f.step(600);
    const calls = f.handles[0].calls;
    expect(calls.indexOf('place')).toBeGreaterThan(-1);
    expect(calls.indexOf('shape:b:1')).toBeGreaterThan(-1);
    expect(calls.indexOf('shape:b:1')).toBeLessThan(calls.indexOf('place'));
  });
  it('backspace mid-station disposes and detaches the handle and the station idles', () => {
    const f = setup();
    f.director.handle({ type: 'char', char: 'a' });
    f.step(3);
    expect(f.insts[0].seen.some((j) => j !== null)).toBe(true); // precondition: the job was in station 0
    f.director.handle({ type: 'backspace' });
    f.step(2);
    expect(f.handles[0].disposed).toBe(true);
    expect(f.handles[0].root.parent).toBeNull();
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
  it('a space handle is disposed and detached once it reaches the shelf', () => {
    const f = setup();
    f.director.handle({ type: 'space' });
    f.step(600);
    expect(f.handles).toHaveLength(1);
    expect(f.handles[0].disposed).toBe(true);
    expect(f.handles[0].root.parent).toBeNull();
  });
  it('destroy disposes and detaches in-flight and shelved handles', () => {
    const f = setup();
    f.director.handle({ type: 'char', char: 'a' });
    f.step(600);
    f.director.handle({ type: 'char', char: 'b' });
    f.step(3);
    f.host.destroy();
    for (const h of f.handles) {
      expect(h.disposed).toBe(true);
      expect(h.root.parent).toBeNull();
    }
    expect(f.host.root.parent).toBeNull();
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
  it('relayout re-begins a job that is mid-station on the rebuilt station instance', () => {
    const f = setup();
    f.director.handle({ type: 'char', char: 'a' });
    f.step(3);
    const [job] = f.director.jobsOf('letter');
    expect(job.phase).toBe('station');
    const n = f.insts.length;
    f.host.relayout('snake');
    const fresh = f.insts.slice(n);
    expect(fresh).toHaveLength(2);
    expect(fresh[job.stationIndex].begun).toHaveLength(1);
    expect(fresh[job.stationIndex].begun[0].job).toBe(job);
    expect(fresh[job.stationIndex].begun[0].product).toBe(f.handles[0]);
    expect(fresh[job.stationIndex ^ 1].begun).toHaveLength(0);
    f.step(2); // and the new instance now gets the job's updates
    expect(fresh[job.stationIndex].seen[fresh[job.stationIndex].seen.length - 1]).toBe(job);
  });

  describe('cutaway clipping is per object', () => {
    it('clips station and conveyor meshes only; floor, walkway, shelf and products stay whole', () => {
      const f = setup('cutaway');
      f.director.handle({ type: 'char', char: 'a' });
      f.step(1); // draws the shelf planks
      const plane = f.looks.cutPlane;
      for (const inst of f.insts) {
        expect(clip(inst.mesh)).toHaveLength(1);
        expect(clip(inst.mesh)![0]).toBe(plane);
      }
      const world = f.host.root.children[0];
      const belts = meshes(world).filter((m) => m.userData.role === 'belt');
      expect(belts.length).toBeGreaterThan(0);
      for (const b of belts) expect(clip(b)![0]).toBe(plane);
      const floor = world.children.find((o) => (o as THREE.Mesh).isMesh && o.userData.role === 'concrete') as THREE.Mesh;
      expect(floor).toBeDefined();
      expect(clip(floor)).toBeNull();
      const planks = meshes(f.host.shelfView.group.children[0]);
      expect(planks.length).toBeGreaterThan(0);
      for (const m of planks) expect(clip(m)).toBeNull();
      const hazard = meshes(world).filter((m) => m.userData.role === 'paint-accent' || m.userData.role === 'rubber');
      for (const m of hazard) expect(clip(m)).toBeNull();
    });
    it('nothing is clipped outside cutaway, and the tags survive a look switch', () => {
      const f = setup('realistic');
      f.step(1);
      for (const inst of f.insts) expect(clip(inst.mesh)).toBeNull();
      f.looks.set({ ...lookOpts, look: 'cutaway' });
      f.looks.apply(f.parent);
      for (const inst of f.insts) expect(clip(inst.mesh)![0]).toBe(f.looks.cutPlane);
      for (const m of meshes(f.host.shelfView.group.children[0])) expect(clip(m)).toBeNull();
    });
    it('a station mesh with userData.cut = false stays whole after build and after a look switch', () => {
      const f = setup('cutaway');
      const wholes = meshes(f.host.root).filter((m) => m.name === 'whole');
      expect(wholes).toHaveLength(f.insts.length);
      for (const m of wholes) {
        expect(m.userData.cut).toBe(false);
        expect(clip(m)).toBeNull();
      }
      for (const look of ['realistic', 'cutaway'] as const) {
        f.looks.set({ ...lookOpts, look });
        f.looks.apply(f.parent);
        for (const m of wholes) {
          expect(m.userData.cut).toBe(false);
          expect(clip(m)).toBeNull();
        }
      }
      for (const inst of f.insts) expect(clip(inst.mesh)![0]).toBe(f.looks.cutPlane); // the positive control is still cut
    });
    it('relayout re-tags the rebuilt stations', () => {
      const f = setup('cutaway');
      const n = f.insts.length;
      f.host.relayout('snake');
      for (const inst of f.insts.slice(n)) expect(clip(inst.mesh)![0]).toBe(f.looks.cutPlane);
    });
  });
});
