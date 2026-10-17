import * as THREE from 'three';
import type { AudioBus } from '../audio/bus';
import type { Looks } from '../engine/looks';
import type { ProductHandle } from '../engine/product';
import type { Vec3 } from '../engine/types';
import { cube } from '../factories/shared/building';
import { figure } from '../factories/shared/figure';
import { beam, box, column, disposeTree, hazardBand, housing, lamp, merged } from '../factories/shared/parts';

/** What the forklift lifts: a plank group and the product handles standing on it (world transforms already baked in). */
export interface Load { group: THREE.Group; handles: ProductHandle[] }

const SPEED = 140;        // units / s at speed 1
const TURN = 3;           // rad / s
const ALIGN = 1.1;        // the forklift only drives at full speed when facing within this (rad) of where it is going
const CREEP = 0.5;        // speed factor while sliding the forks under the plank
const AHEAD = 100;        // aligned point: this far past the plank end
const TUCK = 6;           // inserted: the fork base stands this far past the plank end (84 of the 90 long forks run under it)
const LIFT_T = 0.5;
const LIFT = 14;          // carriage rise that takes the plank off the posts
const TRAVEL = 40;        // total rise while swinging the plank round: it clears the products standing on the other rows
const OUT_LOWER = 140;    // driving toward the door the plank comes back down to LIFT (letters on it must pass under the door lintel)
const APPROACH_Z = 6;     // carriage height below the plank top when sliding in (fork 1.5 thick, plank 4 thick: the forks just fit under it)
const REST_Z = 0.3;
const BACK = 140;
const BEYOND = 220;
const CARRIAGE_RATE = 6;  // 1 / s
const BEEP_T = 0.5;       // real seconds between reversing beeps
const BLINK_HZ = 4;

type State = 'idle' | 'go' | 'insert' | 'lift' | 'back' | 'out' | 'return' | 'park';

const wrap = (a: number): number => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const smooth = (t: number): number => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.position.set(x, y, z); return o; };
const named = <T extends THREE.Object3D>(o: T, name: string): T => { o.name = name; return o; };

/** Fork blade pointing -x: a 90 long bar with a tapered tip and a vertical heel shank (all merged by the caller). */
function fork(y: number): THREE.BufferGeometry[] {
  const W = 3.2;
  const T = 1.5;
  const tip = new THREE.BoxGeometry(8, W, T).translate(-86, 0, T / 2);
  const p = tip.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getX(i) < -89) { p.setY(i, p.getY(i) * 0.35); p.setZ(i, T / 2 + (p.getZ(i) - T / 2) * 0.45); }
  }
  tip.computeVertexNormals();
  return [
    new THREE.BoxGeometry(82, W, T).translate(-41, 0, T / 2),
    tip,
    new THREE.BoxGeometry(T, W, 14).translate(T / 2, 0, 7),
  ].map((g) => g.translate(0, y, 0));
}

/**
 * The dock forklift: parks inside the +x dock door, drives to the oldest shelf row, slides its forks under the plank end,
 * lifts the plank with its products, backs out, carries it out through the dock door, drops (disposes) it and returns.
 * World coordinates, `group` under an identity transform. `truck` is the machine: origin = the fork base on the floor, forks point -x.
 * Parts: body (paint-accent) with counterweight (paint) and hazard stripes, fenders, four wheels with painted spokes (front r 7,
 * rear r 6), dash, steering column and wheel, seat on a pedestal, a seated figure, overhead guard (four posts + top frame),
 * blinking beacon, mast (two uprights, crossbars, lift and tilt cylinders), carriage with load backrest, two tapered forks.
 */
export class Forklift {
  readonly group = new THREE.Group();
  readonly truck = new THREE.Group();
  private carriage = named(new THREE.Group(), 'carriage');
  private forks = named(new THREE.Group(), 'forks');
  private steer = new THREE.Group();
  private wheels: { spin: THREE.Group; r: number }[] = [];
  private beacon: { set(on: boolean): void };
  private beaconOn = false;

  private state: State = 'idle';
  private x = 0;
  private y = 0;
  private z = 0;
  private yaw = 0;
  private cz = REST_Z;       // carriage height
  private czTo = REST_Z;
  private cz0 = 0;           // carriage height when the lift started
  private roll = 0;          // distance rolled by the wheels (forward positive)
  private st = 0;
  private backX = 0;
  private ox = 0;           // where the carried plank started swinging toward the door
  private oy = 0;
  private rdt = 0;           // this frame's real dt (beep and blink run in real time)
  private beepT = 0;
  private blinkT = 0;
  private lastYaw = 0;
  private steerA = 0;

  private target: (() => Vec3 | null) | null = null;
  private onLift: (() => Load | null) | null = null;
  private load: Load | null = null;
  private tgt = new THREE.Vector3();
  private park: Vec3;
  private door: Vec3;

  constructor(looks: Looks, private audio: Pick<AudioBus, 'play'>, park: Vec3, door: Vec3) {
    this.park = [...park];
    this.door = [...door];
    const t = this.truck;

    // ---- chassis ----
    t.add(at(housing(looks, 40, 28, 16, 'paint-accent', 3), 32, 0, 6));
    t.add(at(housing(looks, 14, 28, 18, 'paint', 2), 59, 0, 6)); // counterweight
    const stripes = hazardBand(looks, 14, 26, 0.4);
    stripes.rotation.y = Math.PI / 2; // extrusion -> +x: flush on the counterweight's rear face
    t.add(at(stripes, 66, 0, 15));
    t.add(at(box(looks, 16, 22, 0.4, 'rubber'), 30, 0, 22)); // cab floor mat
    t.add(at(housing(looks, 7, 20, 9, 'paint', 1.5), 18.5, 0, 22)); // dash

    // ---- wheels: front (drive) r 7, rear (steer) r 6; painted spokes show the rolling ----
    let wi = 0;
    const wheel = (r: number, x: number, sy: number) => {
      const spin = named(new THREE.Group(), `wheel-spin-${wi++}`);
      spin.add(
        looks.part(new THREE.CylinderGeometry(r, r, 5, 22), 'rubber'),
        looks.part(new THREE.CylinderGeometry(r * 0.5, r * 0.5, 5.2, 16), 'steel'),
        merged(looks, [new THREE.BoxGeometry(r * 0.95, 5.6, 1.2), new THREE.BoxGeometry(1.2, 5.6, r * 0.95)], 'paint-accent'),
      );
      const hub = new THREE.Group();
      hub.add(spin);
      t.add(at(hub, x, sy * 16.5, r));
      this.wheels.push({ spin, r });
    };
    for (const sy of [-1, 1]) { wheel(7, 22, sy); wheel(6, 46, sy); }
    for (const sy of [-1, 1]) t.add(at(housing(looks, 17, 6.4, 1.6, 'paint-accent', 0.8), 22, sy * 16.5, 14.4)); // front fenders

    // ---- mast, tilt and lift cylinders ----
    for (const sy of [-1, 1]) {
      t.add(at(box(looks, 4, 6, 70, 'steel'), 5, sy * 10, 0));
      t.add(beam(looks, [12.5, sy * 13.5, 15], [5, sy * 13.5, 36], 2.2));
    }
    for (const z of [6, 64]) t.add(at(box(looks, 4, 26, 3, 'steel'), 5, 0, z));
    t.add(at(column(looks, 1.5, 40, 'steel', 10), 5, 0, 9)); // lift cylinder, inside the mast between the uprights

    // ---- carriage: plate behind the forks, load backrest, two forks ----
    this.carriage.add(at(box(looks, 1.5, 18, 12, 'steel'), 2.25, 0, -REST_Z)); // rests on the floor with the forks
    const backrest = [-8, 0, 8].map((y) => cube(1.65, 2.85, y - 0.6, y + 0.6, 10, 36));
    backrest.push(cube(1.65, 2.85, -8.6, 8.6, 35, 36.2));
    this.carriage.add(merged(looks, backrest, 'steel'), merged(looks, [...fork(4.1), ...fork(-4.1)], 'steel'), this.forks);
    t.add(this.carriage);

    // ---- cab: seat, steering, driver, overhead guard, beacon ----
    t.add(at(column(looks, 3, 4.9, 'steel', 10), 40, 0, 22));
    t.add(at(housing(looks, 14, 14, 4, 'rubber', 1.5), 40, 0, 26.9)); // cushion, top at 30.9
    t.add(at(housing(looks, 3, 14, 14, 'rubber', 1.2), 47.5, 0, 28));
    t.add(beam(looks, [20.5, 0, 31], [30.5, 0, 40.5], 1.8)); // column
    const wheelPlane = at(new THREE.Group(), 30.5, 0, 40.5);
    wheelPlane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 1).normalize());
    this.steer.add(
      looks.part(new THREE.TorusGeometry(5.5, 0.8, 8, 24), 'rubber'),
      merged(looks, [new THREE.BoxGeometry(10.6, 0.9, 0.9), new THREE.BoxGeometry(0.9, 5.3, 0.9).translate(0, -2.65, 0)], 'steel'),
    );
    wheelPlane.add(this.steer);
    t.add(wheelPlane);
    const driver = figure(looks);
    driver.pose(0, 0, true);
    driver.group.rotation.z = Math.PI; // facing the forks (-x)
    t.add(at(driver.group, 42, 0, 15.4));

    const posts = [15, 51].flatMap((x) => [-12, 12].map((y) => cube(x - 1.1, x + 1.1, y - 1.1, y + 1.1, 22, 62)));
    const frame = [
      cube(14, 52, -13.1, -10.9, 61, 63), cube(14, 52, 10.9, 13.1, 61, 63),
      cube(13.9, 16.1, -13, 13, 61, 63), cube(49.9, 52.1, -13, 13, 61, 63),
      ...[24, 33, 42].map((x) => cube(x - 0.6, x + 0.6, -12, 12, 61.4, 62.6)),
    ];
    t.add(merged(looks, [...posts, ...frame], 'steel'));
    const l = lamp(looks, 2);
    t.add(at(l.group, 33, 0, 65.4));
    this.beacon = l;

    this.group.add(this.truck);
    this.x = park[0];
    this.y = park[1];
    this.z = park[2];
    this.render(0);
  }

  get busy(): boolean { return this.state !== 'idle'; }

  /** The dock moved (relayout). A parked forklift moves with it; a trip in progress reads the new spots as it goes. */
  setDock(park: Vec3, door: Vec3): void {
    this.park = [...park];
    this.door = [...door];
    this.z = park[2];
    if (this.state === 'idle') { this.x = park[0]; this.y = park[1]; this.yaw = 0; this.render(0); }
  }

  /**
   * Fetch one plank. `target()` is the plank's +x end at its top (read every frame until the lift, because planks glide);
   * null = gone, so go home. At lift time `onLift()` hands over the plank and its products; null = abort. Ignored while busy.
   */
  fetch(target: () => Vec3 | null, onLift: () => Load | null): void {
    if (this.state !== 'idle') return;
    this.target = target;
    this.onLift = onLift;
    this.state = 'go';
    this.blinkT = 0;
    this.motor();
  }

  /** `speed` scales driving, turning and lifting (a long queue of rows makes it hurry); beeps and the beacon stay in real time. */
  update(dt: number, speed: number): void {
    if (this.state === 'idle') {
      if (this.beaconOn) { this.beaconOn = false; this.beacon.set(false); }
      return;
    }
    this.rdt = dt;
    this.blinkT += dt;
    let left = dt * speed;
    for (let guard = 0; guard < 8 && left >= 0 && this.busy; guard++) left = this.step(left);
    if (!this.load || this.state === 'return' || this.state === 'park') {
      this.cz += (this.czTo - this.cz) * (1 - Math.exp(-CARRIAGE_RATE * dt * speed));
    }
    this.render(dt);
  }

  /** The look changed: carried products belong to nobody else now. */
  restyle(): void {
    for (const h of this.load?.handles ?? []) h.restyle();
  }

  dispose(): void {
    this.shed();
    this.target = this.onLift = null;
    this.state = 'idle';
    disposeTree(this.group); // includes the seated driver's geometry
  }

  // ---- trip ----

  /** Run the current state for up to `dt`; returns the time left over once it finished (and moved on), else -1. */
  private step(dt: number): number {
    switch (this.state) {
      case 'go': {
        const t = this.read();
        if (!t) return this.abort(dt);
        this.czTo = t.z - APPROACH_Z; // forks up to just under the plank while driving over
        const left = this.drive(t.x + AHEAD, t.y, dt, false, null, 1);
        if (left < 0) return -1;
        this.state = 'insert';
        return left;
      }
      case 'insert': {
        const t = this.read();
        if (!t) return this.abort(dt);
        this.czTo = t.z - APPROACH_Z;
        const left = this.drive(t.x + TUCK, t.y, dt, false, 0, CREEP);
        if (left < 0) return -1;
        this.cz0 = this.cz = this.czTo;
        this.render(0);
        const load = this.onLift!();
        if (!load) return this.abort(left);
        this.load = load;
        this.forks.attach(load.group); // world transform kept: the plank now rides the carriage
        this.state = 'lift';
        this.st = 0;
        return left;
      }
      case 'lift': {
        this.st += dt;
        this.cz = this.cz0 + LIFT * smooth(this.st / LIFT_T);
        if (this.st < LIFT_T) return -1;
        this.cz = this.czTo = this.cz0 + LIFT;
        this.state = 'back';
        this.backX = this.x + BACK;
        this.beepT = 0;
        return this.st - LIFT_T;
      }
      case 'back': {
        const left = this.drive(this.backX, this.y, dt, true, 0, 1);
        this.beep();
        if (this.load) this.cz = this.czTo = this.cz0 + LIFT + (TRAVEL - LIFT) * smooth(1 - (this.backX - this.x) / BACK);
        if (left < 0) return -1;
        this.state = this.load ? 'out' : 'return'; // no load: this was an abort backing out of the row
        this.st = 0; // out: leg 0 = to the door, 1 = beyond it
        this.ox = this.x;
        this.oy = this.y;
        this.motor();
        return left;
      }
      case 'out': {
        const d = this.door;
        let left = dt;
        if (this.st === 0) {
          left = this.drive(d[0], d[1], left, false, null, 1);
          const moved = Math.hypot(this.x - this.ox, this.y - this.oy);
          this.cz = this.czTo = this.cz0 + TRAVEL - (TRAVEL - LIFT) * smooth(left < 0 ? moved / OUT_LOWER : 1);
          if (left < 0) return -1;
          this.st = 1;
        }
        left = this.drive(d[0] + BEYOND, d[1], left, false, null, 1);
        if (left < 0) return -1;
        this.shed();
        this.czTo = REST_Z;
        this.state = 'return';
        this.motor();
        return left;
      }
      case 'return': {
        const p = this.park;
        const left = this.drive(p[0], p[1], dt, false, null, 1);
        if (left < 0) return -1;
        this.state = 'park';
        return left;
      }
      case 'park': {
        const err = wrap(-this.yaw);
        const m = TURN * dt;
        if (Math.abs(err) > m) { this.yaw += Math.sign(err) * m; return -1; }
        this.yaw = 0;
        this.state = 'idle';
        this.target = this.onLift = null;
        return dt - Math.abs(err) / TURN;
      }
      default:
        return dt;
    }
  }

  /** The plank is gone or the lift was refused: back out of the row if the forks are in it, then home. Returns the time left. */
  private abort(left: number): number {
    this.target = this.onLift = null;
    this.czTo = REST_Z;
    if (this.state === 'insert') {
      this.state = 'back';
      this.backX = this.x + AHEAD - TUCK;
      this.beepT = 0;
    } else {
      this.state = 'return';
      this.motor();
    }
    return left;
  }

  /**
   * Drive toward (tx, ty) facing the way it goes (`yawWant` overrides; `rev` = backing up), turning at TURN and
   * slowing until it faces right. On arrival returns the time left over from `dt` (>= 0), else -1.
   */
  private drive(tx: number, ty: number, dt: number, rev: boolean, yawWant: number | null, vmul: number): number {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const want = yawWant ?? (d > 1e-6 ? Math.atan2(dy, dx) + (rev ? 0 : Math.PI) : this.yaw);
    const err = wrap(want - this.yaw);
    const turn = Math.min(Math.abs(err), TURN * dt);
    this.yaw += Math.sign(err) * turn;
    const step = SPEED * vmul * dt * Math.max(0, 1 - (Math.abs(err) - turn) / ALIGN);
    if (d <= step || d < 1e-9) {
      this.x = tx;
      this.y = ty;
      this.roll += rev ? -d : d;
      return step > 0 ? dt * (1 - d / step) : dt;
    }
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    this.roll += rev ? -step : step;
    return -1;
  }

  private read(): THREE.Vector3 | null {
    const t = this.target?.();
    return t ? this.tgt.set(t[0], t[1], t[2]) : null;
  }

  /** Dispose the carried plank and products (handles first: they are detached before the plank's geometry goes). */
  private shed(): void {
    const load = this.load;
    if (!load) return;
    this.load = null;
    for (const h of load.handles) { h.dispose(); h.root.removeFromParent(); }
    disposeTree(load.group);
  }

  private motor(): void { this.audio.play('forklift-motor', { x: this.x }); }

  private beep(): void {
    this.beepT -= this.rdt;
    if (this.beepT <= 0) { this.beepT += BEEP_T; this.audio.play('forklift-beep', { x: this.x }); }
  }

  private render(dt: number): void {
    this.truck.position.set(this.x, this.y, this.z);
    this.truck.rotation.z = this.yaw;
    this.carriage.position.z = this.cz;
    for (const w of this.wheels) w.spin.rotation.y = -this.roll / w.r;
    if (dt > 0) {
      const rate = wrap(this.yaw - this.lastYaw) / dt;
      this.steerA += (Math.max(-2.4, Math.min(2.4, rate * 0.7)) - this.steerA) * (1 - Math.exp(-10 * dt));
      this.steer.rotation.z = this.steerA;
    }
    this.lastYaw = this.yaw;
    const on = this.state !== 'idle' && Math.floor(this.blinkT * BLINK_HZ * 2) % 2 === 0;
    if (on !== this.beaconOn) { this.beaconOn = on; this.beacon.set(on); }
  }
}
