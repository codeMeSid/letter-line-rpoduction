import * as THREE from 'three';
import type { AudioBus } from '../audio/bus';
import type { Looks } from '../engine/looks';
import type { ProductHandle } from '../engine/product';
import type { Vec3 } from '../engine/types';
import { box, column, disposeTree, housing, lamp } from '../factories/shared/parts';

export interface HoistAnchors { chuteTop: Vec3; chuteBottom: Vec3; binPos: Vec3; ceil: number }

// real seconds
const APPROACH = 0.5;
const LOWER = 0.3;
const GRIP = 0.1;
const LIFT = 0.3;
const CARRY = 0.6;
const SLIDE = 0.6;
const HOME_T = 0.6;       // the claw rises back while the product is still on its way
const GRAVITY = 380;
const CLEAR = 8;          // the product is let go this far above the chute floor
const FALL = Math.sqrt((2 * CLEAR) / GRAVITY);
const U0 = 0.12;          // where on the chute the product lands, clear of the end wall
const SPIN = 0.5;         // yaw turned on the way down the chute
const TRAVEL_UP = 120;    // travel height above the product top (never below TRAVEL_MIN)
const TRAVEL_MIN = 200;
const GRAB = 4;           // the grip point rests this far above the product top
const HOME_UP = 160;
const CABLE_UP = 800;     // the cable runs this far above the ceiling, out of frame
const OPEN = (35 * Math.PI) / 180;
const BIN_CAP = 6;
const BIN_FLOOR = 11;     // bin floor top above binPos z (factories/shared/building.ts); products land on or above it
const BLOCK_TOP = 31;     // rig-local: top of the cable socket
const BLINK = 4;          // lamp flashes per second

type State = 'idle' | 'approach' | 'lower' | 'grip' | 'lift' | 'carry' | 'fall' | 'slide' | 'hop';
interface Job {
  h: ProductHandle;
  onDone?: () => void;
  /** where it lands in the bin, relative to binPos, and how it lies */
  land: { off: Vec3; rot: Vec3 };
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const smooth = (t: number) => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };

// scratch (no per-frame allocation)
const _a = new THREE.Vector3();
const _box = new THREE.Box3();
const _part = new THREE.Box3();

/**
 * The reject claw: a hoist block on a cable that runs up out of frame. It flies to a product on the line,
 * lowers, grips it, lifts it over the reject chute, lets go; the product drops onto the chute, slides down it and
 * hops into the wheeled bin. Rejects queue. `group` must sit under an identity transform (positions are world coordinates).
 */
export class Hoist {
  readonly group = new THREE.Group();
  /** Products that have landed in the bin (the newest 6). */
  readonly bin = new THREE.Group();
  private rig = new THREE.Group();          // origin = the grip point (fingertips)
  private cable: THREE.Mesh;
  private hinges: THREE.Group[] = [];
  private beacon: { set(on: boolean): void };
  private blinkOn = false;
  private blinkT = 0;
  private finger = 0;
  private fingerTo = 0;

  private state: State = 'idle';
  private t = 0;
  private queue: Job[] = [];
  private cur: Job | null = null;
  private binned: ProductHandle[] = [];

  private pos = new THREE.Vector3();         // grip point
  private from = new THREE.Vector3();
  private grab = new THREE.Vector3();        // where the fingers meet the product top
  private above = new THREE.Vector3();       // grab point at travel height
  private hang = new THREE.Vector3();        // product root relative to the grip point while held
  private homeFrom = new THREE.Vector3();
  private homeT = -1;                        // >= 0 while the claw rises back to its home
  private rootFrom = new THREE.Vector3();
  private rotFrom: Vec3 = [0, 0, 0];
  private hopFrom = new THREE.Vector3();
  private hopT = 0;
  private hopA = 0;                          // downward speed leaving the chute
  private hopLandZ = 0;

  constructor(looks: Looks, private audio: Pick<AudioBus, 'play'>, private a: HoistAnchors) {
    this.group.add(this.bin);
    const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.position.set(x, y, z); return o; };
    const rig = this.rig;

    // grapple: a steel hub with three hinged fingers whose tips curl inward
    rig.add(at(housing(looks, 11, 11, 5, 'steel', 1.5), 0, 0, 6));
    for (let k = 0; k < 3; k++) {
      const az = new THREE.Group();
      az.rotation.z = (k * 2 * Math.PI) / 3;
      const hinge = new THREE.Group();
      hinge.position.set(4.5, 0, 6.5);
      const pin = new THREE.Group();
      pin.rotation.x = Math.PI / 2;
      pin.add(at(column(looks, 1.3, 2.8, 'steel', 10), 0, 0, -1.4));
      const arm = at(box(looks, 1.6, 1.6, 9, 'steel'), 0, 0, -9);
      const tip = new THREE.Group();
      tip.position.set(0, 0, -9);
      tip.rotation.y = 0.6; // positive about y swings the lower end toward the axis
      tip.add(at(box(looks, 1.4, 1.4, 5, 'steel'), 0, 0, -5));
      hinge.add(pin, arm, tip);
      az.add(hinge);
      rig.add(az);
      this.hinges.push(hinge);
    }
    // neck, hoist block with two sheaves, cable socket, blinking lamp
    rig.add(at(column(looks, 2.2, 3, 'steel', 12), 0, 0, 11));
    rig.add(at(housing(looks, 16, 16, 14, 'paint-accent', 2), 0, 0, 14));
    for (const sx of [-1, 1]) {
      const sheave = new THREE.Group();
      sheave.rotation.y = Math.PI / 2;
      sheave.add(at(column(looks, 5, 2.4, 'steel', 16), 0, 0, -1.2));
      rig.add(at(sheave, sx * 9.2, 0, 21));
    }
    rig.add(at(column(looks, 1.6, 3, 'steel', 10), 0, 0, 28));
    const lampPart = lamp(looks, 1.8);
    rig.add(at(lampPart.group, 5, 5, 30.2));
    this.beacon = lampPart;
    this.cable = column(looks, 0.7, 1, 'steel', 6); // unit height: scaled in z every frame
    this.cable.castShadow = false; // an 1100-high cable would draw a long streak across the floor
    this.group.add(rig, this.cable);

    this.pos.copy(this.home());
    this.render();
  }

  get busy(): boolean { return this.state !== 'idle' || this.queue.length > 0 || this.homeT >= 0; }

  setAnchors(a: HoistAnchors): void {
    // the bin (and everything binned) moves with the building: its children are stored relative to it
    this.bin.position.x += a.binPos[0] - this.a.binPos[0];
    this.bin.position.y += a.binPos[1] - this.a.binPos[1];
    this.bin.position.z += a.binPos[2] - this.a.binPos[2];
    this.a = a;
    if (!this.busy) { this.pos.copy(this.home()); this.render(); } // a mid-trip claw reads the anchors as it goes
  }

  /** Queue a product (already released by its host) to be gripped, carried to the chute and binned. `onDone` fires when it lands. */
  reject(h: ProductHandle, onDone?: () => void): void {
    h.root.updateWorldMatrix(true, false);
    this.group.attach(h.root);
    this.queue.push({
      h, onDone,
      land: { off: [rnd(-14, 14), rnd(-10, 10), BIN_FLOOR + rnd(1, 11)], rot: [rnd(-0.35, 0.35), rnd(-0.35, 0.35), rnd(-1.2, 1.2)] },
    });
    if (this.state === 'idle') this.begin();
  }

  update(dt: number): void {
    const active = this.state !== 'idle' || this.homeT >= 0;
    if (this.homeT >= 0) {
      this.homeT += dt;
      this.pos.lerpVectors(this.homeFrom, this.home(), smooth(this.homeT / HOME_T));
      if (this.homeT >= HOME_T) this.homeT = -1;
    }
    if (this.state !== 'idle') {
      this.t += dt;
      this.advance();
    }
    const settled = Math.abs(this.fingerTo - this.finger) < 1e-3;
    if (!active && settled) return;
    this.finger = settled ? this.fingerTo : this.finger + (this.fingerTo - this.finger) * (1 - Math.exp(-dt * 18));
    for (const hinge of this.hinges) hinge.rotation.y = -this.finger; // negative about y swings the lower end outward
    this.blinkT += dt;
    const on = (this.state !== 'idle' || this.homeT >= 0) && Math.floor(this.blinkT * BLINK * 2) % 2 === 0;
    if (on !== this.blinkOn) { this.blinkOn = on; this.beacon.set(on); }
    this.render();
  }

  /** Look changed: carried, queued and binned products are owned here, not by a host or shelf. */
  restyle(): void {
    if (this.cur) this.cur.h.restyle();
    for (const j of this.queue) j.h.restyle();
    for (const h of this.binned) h.restyle();
  }

  dispose(): void {
    if (this.cur) this.drop(this.cur.h);
    for (const j of this.queue) this.drop(j.h);
    for (const h of this.binned) this.drop(h);
    this.cur = null;
    this.queue.length = 0;
    this.binned.length = 0;
    disposeTree(this.group);
  }

  // ---- state machine ----

  private duration(): number {
    switch (this.state) {
      case 'approach': return APPROACH;
      case 'lower': return LOWER;
      case 'grip': return GRIP;
      case 'lift': return LIFT;
      case 'carry': return CARRY;
      case 'fall': return FALL;
      case 'slide': return SLIDE;
      case 'hop': return this.hopT;
      default: return Infinity;
    }
  }

  /** Run transitions (carrying leftover time so frame rate does not stretch the sequence), then pose the product. */
  private advance(): void {
    while (this.state !== 'idle' && this.t >= this.duration()) {
      this.t -= this.duration();
      this.next();
    }
    if (this.state !== 'idle') this.pose();
  }

  private next(): void {
    switch (this.state) {
      case 'approach': this.go('lower'); break;
      case 'lower': this.go('grip'); break;
      case 'grip': this.go('lift'); break;
      case 'lift': this.go('carry'); break;
      case 'carry': this.go('fall'); break;
      case 'fall': this.go('slide'); break;
      case 'slide': this.go('hop'); break;
      case 'hop': this.land(); break;
    }
  }

  private go(s: State): void {
    this.state = s;
    const root = this.cur!.h.root;
    switch (s) {
      case 'approach':
        this.homeT = -1; // a new job cancels the climb home; it starts from wherever the claw is
        this.from.copy(this.pos);
        this.fingerTo = OPEN;
        break;
      case 'grip':
        this.fingerTo = 0;
        this.pos.copy(this.grab);
        this.hang.copy(root.position).sub(this.pos);
        this.audio.play('reject-kick', { x: this.pos.x });
        break;
      case 'carry':
        this.from.copy(this.pos);
        break;
      case 'fall': // let go: the claw opens and climbs home while the product drops
        this.fingerTo = OPEN;
        this.homeFrom.copy(this.pos);
        this.homeT = 0;
        this.rootFrom.copy(root.position);
        this.rotFrom = [root.rotation.x, root.rotation.y, root.rotation.z];
        break;
      case 'slide':
        this.fingerTo = 0;
        break;
      case 'hop': {
        // leaves the chute end with the slide velocity and lands exactly on its spot in the bin
        const { chuteTop: t, chuteBottom: b, binPos: p } = this.a;
        this.hopFrom.set(b[0], b[1], b[2]);
        this.hopA = ((1 - U0) * (t[2] - b[2])) / SLIDE;
        this.hopLandZ = p[2] + this.cur!.land.off[2];
        const dz = Math.max(0, b[2] - this.hopLandZ);
        this.hopT = (-this.hopA + Math.sqrt(this.hopA * this.hopA + 2 * GRAVITY * dz)) / GRAVITY;
        this.rotFrom = [0, this.slope(), SPIN];
        break;
      }
    }
  }

  private begin(): void {
    const job = this.queue.shift()!;
    this.cur = job;
    const root = job.h.root;
    // the visible part of the product: what the fingers actually meet
    _box.makeEmpty();
    root.updateWorldMatrix(true, true);
    root.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      _box.union(_part.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld));
    });
    if (_box.isEmpty()) _box.set(root.position, new THREE.Vector3().copy(root.position).setZ(root.position.z + 32)); // nothing visible to measure
    const cx = (_box.min.x + _box.max.x) / 2;
    const cy = (_box.min.y + _box.max.y) / 2;
    this.grab.set(cx, cy, _box.max.z + GRAB);
    this.above.set(cx, cy, Math.max(_box.max.z + TRAVEL_UP, TRAVEL_MIN));
    this.t = 0;
    this.go('approach');
    this.pose();
  }

  private land(): void {
    const job = this.cur!;
    this.cur = null;
    const root = job.h.root;
    const { binPos: p } = this.a;
    root.position.set(p[0] + job.land.off[0], p[1] + job.land.off[1], p[2] + job.land.off[2]);
    root.rotation.set(...job.land.rot);
    this.bin.attach(root);
    this.binned.push(job.h);
    while (this.binned.length > BIN_CAP) this.drop(this.binned.shift()!);
    job.onDone?.();
    if (this.queue.length) this.begin();
    else { this.state = 'idle'; this.t = 0; }
  }

  /** Product (and claw) pose for the current state at time `t`. */
  private pose(): void {
    const job = this.cur!;
    const root = job.h.root;
    const d = this.duration();
    const k = d > 0 ? Math.min(1, this.t / d) : 1;
    const e = smooth(k);
    switch (this.state) {
      case 'approach': this.pos.lerpVectors(this.from, this.above, e); break;
      case 'lower': this.pos.lerpVectors(this.above, this.grab, e); break;
      case 'grip': this.pos.copy(this.grab); break;
      case 'lift': this.pos.lerpVectors(this.grab, this.above, e); break;
      case 'carry': this.pos.lerpVectors(this.from, this.dropPoint(_a), e); break;
      case 'fall': {
        // free fall from the claw: z follows 1 - k² (ballistic for a fixed chute), xy settles over the chute
        const s = this.chuteAt(U0, _a);
        root.position.set(
          this.rootFrom.x + (s.x - this.rootFrom.x) * k,
          this.rootFrom.y + (s.y - this.rootFrom.y) * k,
          this.rootFrom.z - (this.rootFrom.z - s.z) * k * k,
        );
        this.blend(this.rotFrom, 0, this.slope(), 0, k);
        break;
      }
      case 'slide': {
        this.chuteAt(U0 + (1 - U0) * k, _a);
        root.position.copy(_a);
        root.rotation.set(0, this.slope(), SPIN * k);
        break;
      }
      case 'hop': {
        const { binPos: p } = this.a;
        const t = this.t;
        root.position.set(
          this.hopFrom.x + (p[0] + job.land.off[0] - this.hopFrom.x) * k,
          this.hopFrom.y + (p[1] + job.land.off[1] - this.hopFrom.y) * k,
          this.hopFrom.z - this.hopA * t - 0.5 * GRAVITY * t * t + (p[2] + job.land.off[2] - this.hopLandZ) * k,
        );
        this.blend(this.rotFrom, job.land.rot[0], job.land.rot[1], job.land.rot[2], k);
        break;
      }
    }
    if (this.state === 'grip' || this.state === 'lift' || this.state === 'carry') root.position.copy(this.pos).add(this.hang);
  }

  // ---- helpers ----

  private home(): THREE.Vector3 {
    const [x, y, z] = this.a.chuteTop;
    return _a.set(x, y, z + HOME_UP);
  }

  /** Where the grip point must be for the held product to hang `CLEAR` above the chute landing spot. */
  private dropPoint(out: THREE.Vector3): THREE.Vector3 {
    const s = this.chuteAt(U0, out);
    return out.set(s.x - this.hang.x, s.y - this.hang.y, s.z - this.hang.z + CLEAR);
  }

  private chuteAt(u: number, out: THREE.Vector3): THREE.Vector3 {
    const { chuteTop: t, chuteBottom: b } = this.a;
    return out.set(t[0] + (b[0] - t[0]) * u, t[1] + (b[1] - t[1]) * u, t[2] + (b[2] - t[2]) * u);
  }

  private slope(): number {
    const { chuteTop: t, chuteBottom: b } = this.a;
    return Math.atan2(t[2] - b[2], b[0] - t[0]);
  }

  private blend(from: Vec3, x: number, y: number, z: number, k: number): void {
    this.cur!.h.root.rotation.set(from[0] + (x - from[0]) * k, from[1] + (y - from[1]) * k, from[2] + (z - from[2]) * k);
  }

  /** Rig at the grip point; the cable stretches from the block's socket up past the ceiling. */
  private render(): void {
    this.rig.position.copy(this.pos);
    const top = this.pos.z + BLOCK_TOP;
    this.cable.position.set(this.pos.x, this.pos.y, top);
    this.cable.scale.z = Math.max(1, this.a.ceil + CABLE_UP - top);
  }

  private drop(h: ProductHandle): void {
    h.dispose();
    h.root.removeFromParent();
  }
}
