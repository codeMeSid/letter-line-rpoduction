import * as THREE from 'three';
import type { AudioBus } from '../audio/bus';
import { Director } from '../engine/director';
import type { FactoryDef } from '../engine/factory';
import { FactoryHost } from '../engine/factoryHost';
import { Looks } from '../engine/looks';
import { ParticleSystem } from '../engine/particles';
import type { ProductHandle, ProductModel } from '../engine/product';
import { defaultSettings, type Settings } from '../engine/settings';
import type { StationDef } from '../engine/station';

export interface TestHandle extends ProductHandle { disposed: boolean }

export function fakeAudio() {
  const plays: string[] = [];
  const audio = { play: (n: string) => { plays.push(n); }, loop: () => ({ setGain() {}, stop() {} }) } as unknown as AudioBus;
  return { audio, plays };
}

export const meshes = (root: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
  return out;
};

/** A two-station 'letter' factory with recording handles, mounted on a real Director + FactoryHost (layout 'pan'). */
export function miniFactory(over: Partial<Settings> = {}) {
  const settings: Settings = { ...defaultSettings, product: 'letter', layout: 'pan', ...over };
  const { audio, plays } = fakeAudio();
  const director = new Director({ settings: () => settings, now: () => 0, audio });
  const handles: TestHandle[] = [];
  const product: ProductModel = {
    kind: 'letter', stages: ['raw', 'done'], size: [26, 8, 32], lineSize: 46,
    shatter: { burst: [{ kind: 'spark', count: 4 }], sounds: ['metal-crumple'], fragments: { role: 'steel', count: 3, size: 3 } },
    create: () => {
      const h: TestHandle = { root: new THREE.Group(), disposed: false, shape() {}, place() {}, restyle() {}, dispose() { h.disposed = true; } };
      h.root.add(new THREE.Mesh(new THREE.BoxGeometry(26, 8, 32)));
      handles.push(h);
      return h;
    },
  };
  const station = (id: string): StationDef => ({
    id, label: id, footprint: [90, 90], height: 60, duration: 0.3, outputStage: 'done',
    create: () => ({ begin() {}, update() {}, finish: () => 'pass', destroy() {} }),
  });
  const def: FactoryDef = { kind: 'letter', label: 'L', product, stations: [station('s1'), station('s2')] };
  const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
  const parent = new THREE.Group();
  const particles = new ParticleSystem();
  const host = new FactoryHost(def, [0, 0, 0], { parent, looks, director, particles, audio, settings: () => settings, now: () => 0 }, 'pan');
  const type = (s: string) => { for (const ch of s) director.handle(ch === ' ' ? { type: 'space' } : ch === '\n' ? { type: 'enter' } : { type: 'char', char: ch }); };
  return { settings, director, host, handles, looks, parent, particles, audio, plays, def, type };
}
