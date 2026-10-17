import * as THREE from 'three';
import type { AudioBus } from '../audio/bus';
import type { Director } from '../engine/director';
import type { FactoryHost } from '../engine/factoryHost';
import type { Looks } from '../engine/looks';
import type { ParticleSystem } from '../engine/particles';
import type { ProductHandle } from '../engine/product';
import type { Settings } from '../engine/settings';
import type { Job } from '../engine/types';
import { buildBuilding, type Building } from '../factories/shared/building';

export interface SiteDeps { looks: Looks; director: Director; audio: AudioBus; particles: ParticleSystem; settings: () => Settings }

export const BUILDING_MIN_H = 320;
const SIGN_SCALE = 3;

/** Everything around one built factory's machines: building shell, sign; later hoist, broom, forklift, workers. */
export class FactorySite {
  readonly group = new THREE.Group();
  building!: Building;
  private sign: ProductHandle | null = null;

  constructor(readonly host: FactoryHost, private d: SiteDeps, parent: THREE.Object3D) {
    parent.add(this.group);
    this.build();
  }

  /** After host.relayout(): the floor box changed. */
  rebuild(): void {
    this.clear();
    this.build();
  }

  update(_realDt: number, night: number): void {
    this.building.setNight(night > 0.5); // setNight is a no-op when unchanged
  }

  restyle(): void { this.sign?.restyle(); }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }

  private build(): void {
    const height = Math.max(BUILDING_MIN_H, this.host.layout.bounds.max[2] + 160);
    this.building = buildBuilding(this.d.looks, this.host.floorBox(), height);
    this.group.add(this.building.group);
    const def = this.host.def;
    const stage = def.product.stages[def.product.stages.length - 1];
    const job: Job = {
      id: -1, slotId: -1, char: 'A', isSpace: false, special: 'none', product: def.kind, stage, phase: 'shelved',
      stationIndex: def.stations.length - 1, progress: 1, pos: [...this.building.signAt], defect: false, retries: 0,
    };
    const h = def.product.create(job, { looks: this.d.looks, marks: this.d.settings().letterMarks });
    h.shape(stage, 1);
    h.place(1);
    h.root.scale.setScalar(SIGN_SCALE);
    h.root.position.set(...this.building.signAt);
    this.group.add(h.root);
    this.sign = h;
  }

  private clear(): void {
    if (this.sign) { this.sign.dispose(); this.sign.root.removeFromParent(); this.sign = null; }
    this.building?.dispose();
  }
}
