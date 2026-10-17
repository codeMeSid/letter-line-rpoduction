import * as THREE from 'three';
import { loopLength, sampleLoop } from '../engine/patrol';
import type { Looks } from '../engine/looks';
import type { Vec3 } from '../engine/types';
import { figure, type Figure } from '../factories/shared/figure';

const SPEED = 30;        // units / s
const STRIDE = 6;        // units per gait radian
const STAND_T = 2;       // s spent at an inspection
const GAP_MIN = 6;       // walking seconds between inspections
const GAP_SPAN = 6;
const REVERSE = [1, 4];  // these walk against the loop

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Workers patrolling the closed loop around a factory: six figures spread out, two walking the other way, each stopping now and then to look at the line with a raised arm. */
export class Workers {
  readonly group = new THREE.Group();
  readonly figures: Figure[] = [];
  private s: number[] = [];
  private dir: number[] = [];
  private walk: number[] = [];
  private next: number[] = [];   // walking seconds until the next inspection
  private stand: number[] = [];  // seconds left standing (0 = walking)
  private rnd: (() => number)[] = [];
  private L: number;

  constructor(looks: Looks, private loop: Vec3[], count = 6) {
    this.L = loopLength(loop);
    for (let i = 0; i < count; i++) {
      const f = figure(looks);
      this.figures.push(f);
      this.group.add(f.group);
      this.s.push((i * this.L) / count);
      this.dir.push(REVERSE.includes(i) ? -1 : 1);
      this.walk.push(0);
      this.rnd.push(mulberry32(i + 1));
      this.next.push(GAP_MIN + this.rnd[i]() * GAP_SPAN);
      this.stand.push(0);
    }
    this.update(0);
  }

  setLoop(loop: Vec3[]): void {
    const L = loopLength(loop);
    for (let i = 0; i < this.s.length; i++) this.s[i] *= L / this.L; // keep the spread
    this.loop = loop;
    this.L = L;
    this.update(0);
  }

  update(dt: number): void {
    for (let i = 0; i < this.figures.length; i++) {
      const f = this.figures[i];
      if (this.stand[i] > 0) {
        this.stand[i] -= dt;
        if (this.stand[i] <= 0) { this.stand[i] = 0; this.next[i] = GAP_MIN + this.rnd[i]() * GAP_SPAN; }
      } else if (dt > 0) {
        this.s[i] += this.dir[i] * SPEED * dt;
        this.walk[i] += (dt * SPEED) / STRIDE;
        this.next[i] -= dt;
        if (this.next[i] <= 0) this.stand[i] = STAND_T;
      }
      const { pos, heading } = sampleLoop(this.loop, this.s[i]);
      f.group.position.set(pos[0], pos[1], pos[2]);
      if (this.stand[i] > 0) {
        f.group.rotation.z = Math.PI / 2; // face the line
        f.pose(0, 1);
      } else {
        f.group.rotation.z = heading + (this.dir[i] < 0 ? Math.PI : 0);
        f.pose(this.walk[i], 0);
      }
    }
  }

  dispose(): void {
    for (const f of this.figures) f.dispose();
    this.group.removeFromParent();
  }
}
