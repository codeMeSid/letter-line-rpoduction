import * as THREE from 'three';
import type { StationDef, StationInstance } from '../../../engine/station';
import { beam, column, flange, gear, housing, lathe, merged, pipe } from '../../shared/parts';
import { PALLET_T } from '../product';
import { FLOOR, ease, floorZ, oneShots, ss, stationBase, teardown, world } from './common';

const PED_X = 52;
const PED_Y = 40;
const PIVOT_Z = 30;
/** Radial-arm style: the arm rides up its column before swinging, so the buff clears the letter (top 7.6) as it sweeps over it. */
const LIFT = 8;
/** Nominal letter end; each job feeds the buffs in (or out) to its real half-width. */
const CONTACT_X = 12;
const BUFF_R = 11;
const BUFF_T = 6;
const BUFF_Z = PALLET_T + BUFF_R + 0.5; // buff bottom just clears the pallet
const CONTACT_Z = 6;
const MOTOR_L = 12;
const SHAFT_GAP = 2; // visible spindle between motor face and buff
/** The quill hangs over the motor, outboard of the buff (the buff rim would hit a quill above its centre). */
const QUILL_X = CONTACT_X + BUFF_T + SHAFT_GAP + MOTOR_L / 2;
const ARM_L = Math.hypot(PED_X - QUILL_X, PED_Y);
/** Swung out, each buff stands clear of the belt (|y| ≥ 27) on its own side, so the two never meet. */
const SWING_OUT = (55 * Math.PI) / 180;
const OSC = 8;
const SPIN = 30;
const NOZZLE_Z = 40;

/**
 * Station 6: buffing and plating. Two cotton buffs on swing arms (pedestals at opposite corners, so each swings
 * out to its own side of the belt) close on the letter's ends, oscillate along them and polish it to chrome
 * while an overhead boom sprays a plating mist.
 */
export const polish: StationDef = {
  id: 'letter-polish',
  label: 'Buff & plate',
  footprint: [120, 100],
  height: 100,
  duration: 1.6,
  spaceDuration: 0.3,
  outputStage: 'polished',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    // s = -1: back-left pedestal, buff on the letter's left end; s = +1: front-right, right end.
    const heads = [-1, 1].map((s) => {
      const px = s * PED_X;
      const py = -s * PED_Y;
      const d = -s; // spindle direction toward the letter
      const base = flange(looks, 10, 6);
      base.position.set(px, py, FLOOR);
      const pedestal = column(looks, 6, PIVOT_Z + LIFT + 10 - FLOOR, 'paint', 24);
      pedestal.position.set(px, py, FLOOR);
      const cap = column(looks, 7, 2, 'steel', 24);
      cap.position.set(px, py, PIVOT_Z + LIFT + 10);
      group.add(base, pedestal, cap);

      const arm = new THREE.Group();
      arm.position.set(px, py, PIVOT_Z);
      const slew = gear(looks, 9, 18, 2.5); // slewing ring turns with the arm
      slew.position.z = -2.5;
      const hub = column(looks, 7.5, 8, 'steel', 20);
      arm.add(slew, hub, beam(looks, [0, 0, 4], [ARM_L, 0, 4], 6, 'paint-accent'));

      // Head: world-aligned (counter-rotated), a cross-slide plate under the arm end and the buff unit on it.
      const head = new THREE.Group();
      head.position.x = ARM_L;
      const plate = housing(looks, 22, 22, 2, 'steel', 0.6);
      plate.position.z = -1;
      const unit = new THREE.Group();
      const block = housing(looks, 8, 8, 3, 'steel', 1);
      block.position.z = -4;
      const quill = column(looks, 2.5, PIVOT_Z - 4 - (BUFF_Z + 5), 'steel', 12);
      quill.position.z = BUFF_Z + 5 - PIVOT_Z;
      const motor = column(looks, 5, MOTOR_L, 'paint', 20);
      motor.rotation.y = Math.PI / 2; // axis → x
      motor.position.set(-MOTOR_L / 2, 0, BUFF_Z - PIVOT_Z);
      // Spindle (spins about x) from the motor's inner face: shaft, buff, stitch ribs on both buff faces so the spin reads.
      const spindle = new THREE.Group();
      spindle.position.set(d * (MOTOR_L / 2), 0, BUFF_Z - PIVOT_Z);
      const reach = SHAFT_GAP + BUFF_T + 1;
      const shaft = column(looks, 1.5, reach, 'steel', 10);
      shaft.rotation.y = Math.PI / 2;
      shaft.position.x = d > 0 ? 0 : -reach;
      const buff = lathe(looks, [[0, 0], [BUFF_R - 1.5, 0], [BUFF_R, 1.5], [BUFF_R, BUFF_T - 1.5], [BUFF_R - 1.5, BUFF_T], [0, BUFF_T]], 'sand');
      buff.rotation.y = Math.PI / 2;
      buff.position.x = d > 0 ? SHAFT_GAP : -SHAFT_GAP - BUFF_T;
      const ribs: THREE.BufferGeometry[] = [];
      for (const x of [d * (SHAFT_GAP - 0.3), d * (SHAFT_GAP + BUFF_T + 0.3)]) {
        for (let k = 0; k < 3; k++) {
          ribs.push(new THREE.BoxGeometry(0.6, 1, BUFF_R - 4).translate(0, 0, (BUFF_R - 4) / 2 + 2).rotateX((k * Math.PI * 2) / 3).translate(x, 0, 0));
        }
      }
      spindle.add(shaft, buff, merged(looks, ribs, 'rubber'));
      unit.add(block, quill, motor, spindle);
      head.add(plate, unit);
      arm.add(head);
      group.add(arm);
      const yawIn = Math.atan2(-py, s * QUILL_X - px);
      return { s, arm, head, unit, spindle, yawIn };
    });

    // Plating boom: riser at the back right, over the top to a nozzle above the letter.
    const riserFoot = flange(looks, 6, 4);
    riserFoot.position.set(34, 46, FLOOR);
    const boom = pipe(looks, [[34, 46, FLOOR + 2], [34, 46, 52], [30, 40, 58], [4, 4, 58], [0, 0, 54]], 2, 'steel');
    const valve = housing(looks, 7, 7, 6, 'paint-accent', 1);
    valve.position.set(34, 46, 36);
    const nozzle = lathe(looks, [[0, 0], [1.2, 0], [3.5, 9], [3.5, 14], [0, 14]], 'steel', 20);
    nozzle.position.z = NOZZLE_Z;
    group.add(riserFoot, boom, valve, nozzle);

    const shots = oneShots();
    let swing = 0;
    let lower = 0;
    let half = CONTACT_X;
    let spin = 4;
    const inst: StationInstance = {
      begin(job, product) {
        shots.reset();
        const letter = product?.root.getObjectByName('letter');
        half = letter ? new THREE.Box3().setFromObject(letter).getSize(new THREE.Vector3()).x / 2 : CONTACT_X;
        if (!job.isSpace) ctx.audio.play('motor-whir', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        // Swing in raised, drop onto the ends; lift off, swing out.
        swing = live ? ss(0, 0.13, t) * (1 - ss(0.87, 1, t)) : ease(swing, 0, dt, 4);
        lower = live ? ss(0.12, 0.2, t) * (1 - ss(0.8, 0.88, t)) : ease(lower, 0, dt, 6);
        const env = live ? ss(0.2, 0.25, t) * (1 - ss(0.75, 0.8, t)) : 0;
        const osc = OSC * env * Math.sin(((t - 0.2) / 0.6) * Math.PI * 2 * 3);
        spin = ease(spin, live ? SPIN : 4, dt, 3);
        for (const h of heads) {
          const yaw = h.yawIn + SWING_OUT * (1 - swing);
          h.arm.rotation.z = yaw;
          h.arm.position.z = PIVOT_Z + LIFT * (1 - lower);
          h.head.rotation.z = -yaw;
          h.unit.position.set(-h.s * (CONTACT_X - half) * lower, osc, 0);
          h.spindle.rotation.x += spin * dt;
        }

        if (job) product?.shape('polished', ss(0.2, 0.85, t));
        if (live && t >= 0.2 && t <= 0.8) {
          for (const s of [-1, 1]) ctx.particles.emit('powder', { pos: world(ctx, s * half, osc, CONTACT_Z), count: 2, vel: [s * 10, 0, 6], spread: 1.5, floor: floorZ(ctx) });
        }
        if (live && t >= 0.45 && shots.once('hiss')) ctx.audio.play('hiss', { x: ctx.origin[0] });
        if (live && t >= 0.45 && t <= 0.6) {
          ctx.particles.emit('steam', { pos: world(ctx, 0, 0, NOZZLE_Z), count: 2, vel: [0, 0, -40], spread: 2, floor: floorZ(ctx) });
        }
      },
      finish: () => 'pass',
      destroy() {
        teardown(group);
      },
    };
    inst.update(0, null, 0, null); // initial pose
    return inst;
  },
};
