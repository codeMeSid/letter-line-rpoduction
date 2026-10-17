import * as THREE from 'three';
import type { SoundName } from '../audio/types';
import type { Looks } from '../engine/looks';
import type { ParticleSystem } from '../engine/particles';
import type { Vec3 } from '../engine/types';
import { box, column, disposeTree, housing, lathe } from '../factories/shared/parts';

// real seconds
const DROP = 0.35;    // hangs in from above
const MOVE = 0.25;    // slides to the next target
const RACK = 0.25;    // pump back and forward
const TRAVEL = 0.05;  // fire -> hit
const RECOVER = 0.2;  // recoil settles
const IDLE = 1.5;     // waits for another shot
const LIFT = 0.4;     // rises out of frame
const HEIGHT = 600;   // drop / lift distance, and the hanger rod length
const RECOIL = 4;
const PUMP_TRAVEL = 5;
const SHELL_CAP = 8;
const SHELL_LIFE = 3;
const GRAVITY = 380;

/** The gun's position relative to the point it aims at (keeps it off the camera's +x side). */
const OFFSET: Vec3 = [-60, -35, 45];
/** Gun-local (+x = barrel): receiver centre is the pivot. */
const MUZZLE: Vec3 = [32.5, 0, 1.6];
const PORT: Vec3 = [1, -2.3, 1.2]; // ejection port, gun's right (-y)

type State = 'away' | 'drop' | 'move' | 'rack' | 'travel' | 'recover' | 'idle' | 'lift';
interface Shot { target: Vec3; floor: number; onHit: () => void }
interface Shell { g: THREE.Group; v: THREE.Vector3; axis: THREE.Vector3; rate: number; age: number; floor: number }

export interface ShotgunDeps {
  looks: Looks;
  particles: ParticleSystem;
  audio: { play(n: SoundName, o?: { x?: number }): void };
  flash(pos: Vec3): void;
  shake(mag: number): void;
}

const ease = (t: number) => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };
const easeOut = (t: number) => { const k = Math.min(1, Math.max(0, t)); return 1 - (1 - k) ** 3; };

// scratch (no per-frame allocation)
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * A pump shotgun hung from a vertical rod: drops in from above, racks the pump, fires at a point (muzzle flash,
 * sparks, recoil, camera kick, ejected shell), calls `onHit`, and leaves after 1.5 s idle. Shots queue.
 * `group` and `shells` must share a parent with an identity transform (positions are world coordinates).
 */
export class Shotgun {
  readonly group = new THREE.Group();
  /** Spent shells live here, not under `group`, so they stay visible after the gun lifts away. */
  readonly shells = new THREE.Group();
  /** Aims the gun; the hanger rod is outside it and stays vertical. Origin = receiver centre. */
  readonly gimbal = new THREE.Group();
  readonly muzzle = new THREE.Object3D();
  private pump = new THREE.Group();
  private state: State = 'away';
  private t = 0;
  private queue: Shot[] = [];
  private cur: Shot | null = null;
  private pos = new THREE.Vector3();
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private aim = new THREE.Vector3(1, 0, 0);
  private pitch = 0;
  private recoil = 0;
  private live: Shell[] = [];

  constructor(private d: ShotgunDeps) {
    this.group.visible = false;
    this.gimbal.rotation.order = 'ZYX'; // yaw about world z, then pitch about the yawed y
    this.muzzle.position.set(...MUZZLE);
    this.gimbal.add(this.muzzle);
    this.build();
    this.group.add(this.gimbal);
  }

  get busy(): boolean { return this.state !== 'away'; }

  shoot(target: Vec3, floor: number, onHit: () => void): void {
    this.queue.push({ target, floor, onHit });
    if (this.state === 'away') this.next('drop');
    else if (this.state === 'idle' || this.state === 'lift') this.next('move'); // reverses mid-lift
  }

  update(dt: number): void {
    this.updateShells(dt);
    if (this.state === 'away') return;
    this.t += dt;
    const t = this.t;
    switch (this.state) {
      case 'drop':
        this.pos.lerpVectors(this.from, this.to, easeOut(t / DROP));
        if (t >= DROP) this.rack(t - DROP);
        break;
      case 'move':
        this.pos.lerpVectors(this.from, this.to, ease(t / MOVE));
        if (t >= MOVE) this.rack(t - MOVE);
        break;
      case 'rack':
        this.pump.position.x = -PUMP_TRAVEL * (1 - Math.abs(1 - 2 * Math.min(1, t / RACK)));
        if (t >= RACK) { this.pump.position.x = 0; this.go('travel', t - RACK); this.fire(); }
        break;
      case 'travel':
        if (t >= TRAVEL) {
          const shot = this.cur!;
          this.cur = null;
          this.go('recover', t - TRAVEL);
          shot.onHit();
        }
        break;
      case 'recover':
        this.recoil = 1 - ease(t / RECOVER);
        if (t >= RECOVER) {
          this.recoil = 0;
          if (this.queue.length) this.next('move');
          else this.go('idle', t - RECOVER);
        }
        break;
      case 'idle':
        if (t >= IDLE) { this.from.copy(this.pos); this.to.copy(this.pos).z += HEIGHT; this.go('lift', t - IDLE); }
        break;
      case 'lift':
        this.pos.lerpVectors(this.from, this.to, ease(t / LIFT));
        if (t >= LIFT) { this.state = 'away'; this.group.visible = false; }
        break;
    }
    this.render();
  }

  dispose(): void {
    for (const s of this.live) disposeTree(s.g);
    this.live.length = 0;
    disposeTree(this.group);
    this.shells.removeFromParent();
  }

  // ---- state machine ----

  private go(s: State, carry = 0): void {
    this.state = s;
    this.t = carry;
  }

  private rack(carry: number): void {
    this.go('rack', carry);
    this.d.audio.play('shotgun-rack', { x: this.pos.x });
  }

  /** Take the next queued shot: the gun hangs in (from away) or slides (from anywhere else) to its aim pose. */
  private next(s: 'drop' | 'move'): void {
    const shot = this.queue.shift()!;
    this.cur = shot;
    this.to.set(shot.target[0] + OFFSET[0], shot.target[1] + OFFSET[1], shot.target[2] + OFFSET[2]);
    if (s === 'drop') {
      this.from.copy(this.to).z += HEIGHT;
      this.group.visible = true;
    } else {
      this.from.copy(this.pos);
    }
    this.pos.copy(this.from);
    this.recoil = 0;
    this.setAim(shot.target);
    this.go(s);
    this.render();
  }

  /** Orient the gimbal from the gun's aim pose to the target: yaw = atan2, pitch = asin (positive pitch looks down). */
  private setAim(target: Vec3): void {
    this.aim.set(target[0] - this.to.x, target[1] - this.to.y, target[2] - this.to.z).normalize();
    const yaw = Math.atan2(this.aim.y, this.aim.x);
    this.pitch = -Math.asin(this.aim.z);
    this.gimbal.rotation.set(0, this.pitch, yaw);
  }

  private render(): void {
    this.group.position.copy(this.pos).addScaledVector(this.aim, -RECOIL * this.recoil);
    this.gimbal.rotation.y = this.pitch - 0.08 * this.recoil; // muzzle climbs on recoil
  }

  private fire(): void {
    const { audio, particles } = this.d;
    const shot = this.cur!;
    this.recoil = 1;
    this.render();
    const m = this.world(MUZZLE, [0, 0, 0]);
    audio.play('shotgun-blast', { x: m[0] });
    this.d.flash(m);
    this.d.shake(0.6);
    particles.emit('flash', { pos: m, count: 1, size: 10, floor: shot.floor });
    particles.emit('spark', { pos: m, count: 14, spread: 2, vel: [this.aim.x * 300, this.aim.y * 300, this.aim.z * 300], floor: shot.floor });
    this.eject(shot.floor);
  }

  // ---- shells ----

  /** Gun-local point -> world (the gun's parent is the world), allocation-free apart from the result. */
  private world(p: Vec3, out: Vec3): Vec3 {
    _v.set(p[0], p[1], p[2]).applyQuaternion(this.gimbal.quaternion).add(this.group.position);
    out[0] = _v.x; out[1] = _v.y; out[2] = _v.z;
    return out;
  }

  private eject(floor: number): void {
    const { looks } = this.d;
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.position.z = -1.75; // spin about the shell's middle
    const hull = column(looks, 1.1, 3.5, 'paint-accent', 10);
    const head = column(looks, 1.2, 0.8, 'copper', 10);
    inner.add(hull, head);
    g.add(inner);
    const p = this.world(PORT, [0, 0, 0]);
    g.position.set(p[0], p[1], p[2]);
    g.quaternion.copy(this.gimbal.quaternion);
    // sideways = the gun's right (aim x up), plus up and a little back
    const right = _v.set(this.aim.y, -this.aim.x, 0).normalize();
    const v = new THREE.Vector3().copy(right).multiplyScalar(60 + Math.random() * 30);
    v.addScaledVector(this.aim, -10 - Math.random() * 15);
    v.z += 70 + Math.random() * 40;
    this.live.push({
      g, v, axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      rate: 12 + Math.random() * 8, age: 0, floor,
    });
    this.shells.add(g);
    while (this.live.length > SHELL_CAP) disposeTree(this.live.shift()!.g); // spam: the oldest go early
  }

  private updateShells(dt: number): void {
    for (let i = 0; i < this.live.length; ) {
      const s = this.live[i];
      s.age += dt;
      if (s.age >= SHELL_LIFE) { disposeTree(s.g); this.live.splice(i, 1); continue; }
      s.v.z -= GRAVITY * dt;
      s.g.position.addScaledVector(s.v, dt);
      const rest = s.floor + 1.1; // lies on its side
      if (s.g.position.z < rest) {
        s.g.position.z = rest;
        s.v.z = s.v.z < -25 ? -s.v.z * 0.3 : 0;
        s.v.x *= 0.6;
        s.v.y *= 0.6;
        s.rate *= 0.6;
      }
      s.g.quaternion.premultiply(_q.setFromAxisAngle(s.axis, s.rate * dt));
      i++;
    }
  }

  // ---- model ----

  /**
   * Pump shotgun, local +x = barrel, receiver centre at the origin, ~57 long:
   * wood stock + rubber butt pad, steel receiver with ejection port and cross pins, barrel with collar, vent rib,
   * bead sight and muzzle ring, magazine tube + cap under it, sliding wood fore-end on an action bar,
   * trigger guard + trigger, and a hanger rod from the receiver top up out of frame.
   */
  private build(): void {
    const { looks } = this.d;
    const gun = this.gimbal;
    const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.position.set(x, y, z); return o; };
    const alongX = <T extends THREE.Object3D>(o: T): T => { o.rotation.y = Math.PI / 2; return o; }; // column z -> +x

    // stock: side profile (x, z) extruded across y; ~18 long, 6 tall at the butt tapering to 3.5 at the wrist
    const prof = new THREE.Shape();
    prof.moveTo(-5.5, 2.6);
    prof.lineTo(-13, 2.1);
    prof.lineTo(-23.6, 0.7);
    prof.lineTo(-24.2, -4.9);
    prof.lineTo(-18, -3.2);
    prof.lineTo(-12, -2.0);
    prof.lineTo(-9.6, -3.2);
    prof.lineTo(-7.2, -1.4);
    prof.lineTo(-5.5, -0.9);
    prof.closePath();
    const stockGeo = new THREE.ExtrudeGeometry(prof, { depth: 2.4, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 2 });
    stockGeo.rotateX(Math.PI / 2).translate(0, 1.2, 0); // shape y -> z; extrusion -> -y, then centre on y = 0
    gun.add(looks.part(stockGeo, 'wood'));
    gun.add(at(housing(looks, 1.2, 4, 6.2, 'rubber', 0.4), -24.6, 0, -5.3)); // butt pad

    // receiver
    gun.add(at(housing(looks, 12, 4.2, 6, 'steel', 0.8), 0, 0, -3));
    gun.add(at(box(looks, 5, 0.5, 1.9, 'rubber'), 0.8, -2.15, 0.7)); // ejection port, dark
    for (const x of [-4, 3.8]) {
      const pin = at(column(looks, 0.55, 4.6, 'steel', 8), x, 2.3, -1.4); // cross pins through the receiver
      pin.rotation.x = Math.PI / 2; // axis z -> -y
      gun.add(pin);
    }
    // trigger guard (lower half of a torus, in the x-z plane) and trigger
    const guardGeo = new THREE.TorusGeometry(2.2, 0.3, 8, 20, Math.PI).rotateZ(Math.PI).rotateX(Math.PI / 2);
    gun.add(at(looks.part(guardGeo, 'steel'), -2, 0, -3));
    const trigger = at(box(looks, 0.5, 0.5, 2, 'steel'), -2.4, 0, -4.7);
    trigger.rotation.y = 0.35;
    gun.add(trigger);

    // barrel group
    gun.add(at(alongX(column(looks, 1.25, 26, 'steel', 20)), 6, 0, 1.6));
    gun.add(at(alongX(column(looks, 1.7, 1.6, 'steel', 20)), 6, 0, 1.6)); // collar at the receiver
    gun.add(at(alongX(column(looks, 1.5, 1.2, 'steel', 20)), 31.4, 0, 1.6)); // muzzle ring
    gun.add(at(box(looks, 22, 0.7, 0.35, 'steel'), 18, 0, 1.6 + 1.25 + 0.1)); // vent rib
    gun.add(at(looks.part(new THREE.SphereGeometry(0.45, 10, 8), 'steel'), 30.4, 0, 1.6 + 1.25 + 0.5)); // bead sight

    // magazine tube + cap under the barrel
    gun.add(at(alongX(column(looks, 1.0, 21, 'steel', 14)), 6, 0, -1.0));
    gun.add(at(alongX(column(looks, 1.25, 1.4, 'steel', 14)), 26.2, 0, -1.0)); // mag cap

    // pump: ribbed wood fore-end around the tube, joined to the receiver by an action bar
    const foreend = lathe(looks, [
      [0, 0], [1.5, 0], [1.9, 0.5], [1.9, 2], [1.6, 2.2], [1.6, 2.6], [1.9, 2.8], [1.9, 4], [1.6, 4.2], [1.6, 4.6], [1.9, 4.8],
      [1.9, 6.4], [1.6, 6.6], [1.6, 7], [1.9, 7.2], [1.9, 8.5], [1.5, 9], [0, 9],
    ], 'wood', 20);
    this.pump.add(at(alongX(foreend), 12, 0, -1.0));
    this.pump.add(at(box(looks, 6, 0.8, 0.8, 'steel'), 9, 0, -1.0)); // action bar
    gun.add(this.pump);

    // hanger: bracket on the receiver top, rod straight up out of frame (outside the gimbal: stays vertical)
    const bracket = at(column(looks, 2.2, 1.2, 'steel', 12), 0, 0, 3);
    const rod = at(column(looks, 1.2, HEIGHT, 'steel', 10), 0, 0, 4.2);
    rod.castShadow = false; // a 600-high rod would draw a long streak across the floor
    this.group.add(bracket, rod);
  }
}
