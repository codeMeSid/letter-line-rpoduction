import * as THREE from 'three';
import type { AudioBus } from '../../../audio/bus';
import { Looks } from '../../../engine/looks';
import { ParticleSystem } from '../../../engine/particles';
import type { ProductHandle } from '../../../engine/product';
import { defaultSettings } from '../../../engine/settings';
import type { StationCtx, StationDef, StationInstance } from '../../../engine/station';
import type { Job } from '../../../engine/types';

/** `now` defaults to a frozen clock; pass one that advances to exercise time-driven motion. */
export function testCtx(now: () => number = () => 0) {
  const plays: string[] = [];
  const loops: { stopped: boolean }[] = [];
  const audio = {
    play: (n: string) => { plays.push(n); },
    loop: () => { const l = { stopped: false, setGain() {}, stop() { l.stopped = true; } }; loops.push(l); return l; },
  } as unknown as AudioBus;
  const particles = new ParticleSystem();
  const group = new THREE.Group();
  group.position.set(300, -100, 22); // the host positions station groups at their anchor
  const ctx: StationCtx = {
    group, origin: [300, -100, 22],
    looks: new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' }),
    particles, audio, settings: () => defaultSettings, now,
    placing: () => [], product: () => null,
    shelfSpan: () => ({ x0: 0, x1: 460, y: -420, z: 18 }),
  };
  return { ctx, plays, loops, particles, group };
}

export function recProduct(): ProductHandle & { shapes: [string, number][] } {
  const h = { root: new THREE.Group(), shapes: [] as [string, number][], shape(s: string, t: number) { h.shapes.push([s, t]); }, place() {}, restyle() {}, dispose() {} };
  return h;
}

export const job = (char: string, isSpace = false): Job => ({ id: 7, slotId: 7, char, isSpace, special: 'none', product: 'letter', stage: 'flask', phase: 'station', stationIndex: 0, progress: 0, pos: [300, -100, 22], defect: false, retries: 0 });

/** One full job (t 0→1 in 60 steps) on an existing instance, then 30 idle frames. */
export function drive(def: StationDef, inst: StationInstance, j: Job) {
  const p = recProduct();
  inst.begin(j, p);
  const steps = 60;
  for (let i = 0; i <= steps; i++) inst.update(def.duration / steps, j, i / steps, p);
  const verdict = inst.finish(j);
  for (let i = 0; i < 30; i++) inst.update(1 / 30, null, 0, null);
  return { p, verdict };
}

/** Run a full job through a fresh station then 30 idle frames. */
export function runJob(def: StationDef, j: Job) {
  const k = testCtx();
  const inst = def.create(k.ctx);
  return { k, inst, ...drive(def, inst, j) };
}
