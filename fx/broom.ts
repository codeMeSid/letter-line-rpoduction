import * as THREE from 'three';
import type { AudioBus } from '../audio/bus';
import type { Looks } from '../engine/looks';
import type { ParticleSystem } from '../engine/particles';
import type { Vec3 } from '../engine/types';
import { beam, box, column, disposeTree, housing, lamp, merged } from '../factories/shared/parts';

const SPEED = 120;          // units / s
const SWEEP_T = { debris: 0.8, gap: 0.3 };
const ROLLER_RATE = 25;     // rad / s
const JIGGLE = 3;           // units, along x
const JIGGLE_HZ = 6;
const TURN = 14;            // yaw smoothing rate, 1 / s
const STANDOFF = 14;        // the rover stops this far +x of the slot so its roller (at the front, -x) lands on it
const PARK_POLL = 0.5;      // an idle broom re-reads its park spot this often (a relayout moves the shelf)

type State = 'idle' | 'drive' | 'sweep' | 'home';
interface Req { at: () => Vec3 | null; kind: 'debris' | 'gap'; onSwept: () => void }

/**
 * A shelf cleaning rover: parks on a charging pad beside the shelf, drives to a slot (facing its travel),
 * spins its brush roller there, then reports `onSwept` and drives home. Sweeps queue; `at()` is read every frame
 * because a slot moves when rows step back. World coordinates, `group` under an identity transform.
 * Parts: body, cover, four wheels, brush roller (core + bristles) on two arms at the front (-x), beacon, charging pad.
 */
export class Broom {
  readonly group = new THREE.Group();
  /** The rover itself (the pad stays put). Origin = ground contact under the body centre, front = -x. */
  readonly rover = new THREE.Group();
  /** The brush roller group; it spins about its local y axis. */
  readonly roller = new THREE.Group();
  private pad = new THREE.Group();
  private post: THREE.Mesh;
  private beacon: { set(on: boolean): void };
  private beaconOn = false;

  private state: State = 'idle';
  private queue: Req[] = [];
  private cur: Req | null = null;
  private pos = new THREE.Vector3();
  private yaw = 0;
  private yawTo = 0;
  private leg = 0;
  private legX = 0;
  private st = 0;
  private parkT = 0;
  private parked = new THREE.Vector3();

  constructor(looks: Looks, private audio: Pick<AudioBus, 'play'>, private particles: Pick<ParticleSystem, 'emit'>, private park: () => Vec3) {
    const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.position.set(x, y, z); return o; };
    const rover = this.rover;
    rover.add(at(housing(looks, 18, 12, 7, 'paint-accent', 2), 0, 0, 2));
    rover.add(at(housing(looks, 13, 9, 2.5, 'paint', 1), 1, 0, 9));
    for (const sx of [-6.5, 6.5]) for (const sy of [-7.3, 7.3]) {
      const wheel = new THREE.Group();
      wheel.rotation.x = Math.PI / 2; // axle along y
      wheel.add(at(column(looks, 2.5, 2.4, 'rubber', 14), 0, 0, -1.2));
      rover.add(at(wheel, sx, sy, 2.5));
    }
    // brush roller: a rubber core with eight bristle fins, held in front on two steel arms
    const core = new THREE.Group();
    core.rotation.x = Math.PI / 2;
    core.add(at(column(looks, 3.2, 14, 'rubber', 16), 0, 0, -7));
    const fins = Array.from({ length: 8 }, (_, k) => new THREE.BoxGeometry(1.8, 13, 0.6).translate(3.7, 0, 0).rotateY((k * Math.PI) / 4));
    this.roller.add(core, merged(looks, fins, 'sand'));
    rover.add(at(this.roller, -15.5, 0, 4.4));
    for (const sy of [-7.8, 7.8]) rover.add(beam(looks, [-8, sy, 6.5], [-15.5, sy, 4.4], 1.4));
    const l = lamp(looks, 1.5);
    rover.add(at(l.group, 3, 0, 13.3));
    this.beacon = l;

    // charging pad under the park spot: the shelf ends before it, so the rover would hang in the air
    this.pad.add(at(housing(looks, 26, 16, 2, 'steel', 1), 0, 0, -2));
    this.pad.add(at(box(looks, 2, 16, 6, 'steel'), 12, 0, 0)); // back stop
    this.post = column(looks, 2.5, 1, 'steel', 10);            // unit height: scaled to reach the floor
    this.pad.add(this.post);
    this.group.add(this.pad, rover);
    this.syncPark();
  }

  get busy(): boolean { return this.state !== 'idle' || this.queue.length > 0; }

  /** Drive to `at()`, sweep (0.8 s debris, 0.3 s gap), call `onSwept`, go home. `at()` null (slot gone) still calls `onSwept`. */
  sweep(at: () => Vec3 | null, kind: 'debris' | 'gap', onSwept: () => void): void {
    const req = { at, kind, onSwept };
    if (this.state === 'idle' || this.state === 'home') this.start(req);
    else this.queue.push(req);
  }

  update(dt: number): void {
    if (this.state === 'idle') {
      this.parkT += dt;
      if (this.parkT >= PARK_POLL) { this.parkT = 0; this.syncPark(); }
      if (Math.abs(this.yawTo - this.yaw) > 1e-3) this.render(dt); // finish the turn on the pad
      return;
    }
    switch (this.state) {
      case 'drive': {
        const a = this.cur!.at();
        if (!a) { this.finish(); break; } // the slot vanished
        this.pos.z = a[2];
        if (this.leg === 0 && this.moveTo(this.legX, a[1], dt, true)) this.leg = 1;
        if (this.leg === 1 && this.moveTo(a[0] + STANDOFF, a[1], dt, true)) this.beginSweep(a);
        break;
      }
      case 'sweep': {
        const a = this.cur!.at();
        if (!a) { this.finish(); break; }
        this.pos.z = a[2];
        // the slot may step back while we sweep: follow it, and only sweep while on it
        if (this.moveTo(a[0] + STANDOFF, a[1], dt, false)) {
          this.st += dt;
          this.roller.rotation.y += ROLLER_RATE * dt;
          if (this.st >= SWEEP_T[this.cur!.kind]) this.finish();
        }
        break;
      }
      case 'home': {
        const p = this.park();
        this.pos.z = p[2];
        if (this.leg === 0 && this.moveTo(p[0], this.pos.y, dt, true)) this.leg = 1;
        if (this.leg === 1 && this.moveTo(p[0], p[1], dt, true)) { this.state = 'idle'; this.yawTo = 0; this.parkT = 0; }
        break;
      }
    }
    this.render(dt);
  }

  dispose(): void {
    this.queue.length = 0;
    this.cur = null;
    disposeTree(this.group);
  }

  // ---- internals ----

  private start(req: Req): void {
    this.cur = req;
    this.state = 'drive';
    this.leg = 0;
    this.legX = this.pos.x; // first change rows at the current x, then drive along the row
  }

  private beginSweep(a: Vec3): void {
    const req = this.cur!;
    this.state = 'sweep';
    this.st = 0;
    this.yawTo = 0; // front (-x) toward the slot
    this.audio.play(req.kind === 'gap' ? 'whoosh' : 'broom-sweep', { x: a[0] });
    this.particles.emit('smoke', { pos: a, count: 4, spread: 3, floor: a[2] });
  }

  /** Report the sweep, then take the next request or go home. The state stays put during `onSwept` so re-entrant sweeps queue. */
  private finish(): void {
    const req = this.cur!;
    this.cur = null;
    req.onSwept();
    const next = this.queue.shift();
    if (next) { this.start(next); return; }
    this.state = 'home';
    this.leg = 0;
  }

  /** Drive toward (x, y) at SPEED facing the way we go; true on arrival. */
  private moveTo(x: number, y: number, dt: number, turn: boolean): boolean {
    const dx = x - this.pos.x;
    const dy = y - this.pos.y;
    const d = Math.hypot(dx, dy);
    const step = SPEED * dt;
    if (d <= step) { this.pos.x = x; this.pos.y = y; return true; }
    this.pos.x += (dx / d) * step;
    this.pos.y += (dy / d) * step;
    if (turn) this.yawTo = Math.atan2(dy, dx) + Math.PI; // the front is -x
    return false;
  }

  private render(dt: number): void {
    const d = this.yawTo - this.yaw;
    this.yaw += (d - Math.round(d / (2 * Math.PI)) * 2 * Math.PI) * (1 - Math.exp(-TURN * dt)); // shortest way round
    const jiggle = this.state === 'sweep' ? JIGGLE * Math.sin(2 * Math.PI * JIGGLE_HZ * this.st) : 0;
    this.rover.position.set(this.pos.x + jiggle, this.pos.y, this.pos.z);
    this.rover.rotation.z = this.yaw;
    const moving = this.state !== 'idle';
    if (moving !== this.beaconOn) { this.beaconOn = moving; this.beacon.set(moving); }
  }

  /** Move the pad and the parked rover when the park spot moved (a relayout). */
  private syncPark(): void {
    const p = this.park();
    if (this.parked.set(p[0], p[1], p[2]).equals(this.pos) && this.pad.position.equals(this.pos)) return;
    this.pos.copy(this.parked);
    this.pad.position.set(p[0], p[1], p[2]);
    this.post.position.z = -p[2];
    this.post.scale.z = Math.max(1, p[2] - 2);
    this.rover.position.copy(this.pos);
    this.rover.rotation.z = this.yaw = this.yawTo = 0;
  }
}
