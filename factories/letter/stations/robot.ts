import * as THREE from 'three';
import type { StationDef, StationInstance } from '../../../engine/station';
import type { Vec3 } from '../../../engine/types';
import { beam, box, housing, panel } from '../../shared/parts';
import { RobotArm } from '../../shared/robotArm';
import { LETTER_H, LETTER_R, PALLET_T } from '../product';
import { FLOOR, ease, ss, stationBase, teardown } from './common';

const GAUGE = 14;               // rails at y ±14 under the carriage
const RAIL = 5;
const RAIL_Z = FLOOR + 3;       // rail centre line
const DECK_Z = RAIL_Z + RAIL / 2;
const DECK_H = 8;
const BASE_Z = DECK_Z + DECK_H; // arm base on the carriage top
const CARRIAGE_HALF = 24;
/** Tip height over the product root: just above the flat letter, and above the upright one. */
const FLAT_GRIP = PALLET_T + 2 * LETTER_R + 2;
const UPRIGHT_GRIP = LETTER_H + 2 * LETTER_R;
/**
 * Placing arcs cross the whole line in 0.8 s (peak ~1100 u/s in the snake layout). The brief's rate 4 carriage /
 * rate 10 joints trail that by 100+ units, so the gripper would chase the letter instead of carrying it; while
 * placing the carriage and joints are stiff (finite, so a new target never teleports the arm).
 */
const CARRY_RATE = 40;
const CARRY_ARM_RATE = 60;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Station 7: 6-axis robot on a linear rail between the line and the shelf. It picks each finished letter
 * off the belt and carries it along the director's placement arc, standing it upright on the shelf.
 */
export const robot: StationDef = {
  id: 'letter-robot',
  label: 'Rail robot',
  footprint: [90, 80],
  height: 60,
  duration: 1.1,
  spaceDuration: 0.3,
  create(ctx) {
    const { group, looks } = ctx;
    const [ox, oy, oz] = ctx.origin;
    group.add(stationBase(looks, 48, 44));

    // Rail along the shelf front (world x range covers the shelf and this station), built in station-local coords.
    const span = ctx.shelfSpan();
    const railY = span.y + 60;
    const lo = Math.min(span.x0, ox) - 30;
    const hi = Math.max(span.x1, ox) + 30;
    const rig = new THREE.Group();
    rig.position.y = railY - oy;
    for (const s of [-1, 1]) rig.add(beam(looks, [lo - ox, s * GAUGE, RAIL_Z], [hi - ox, s * GAUGE, RAIL_Z], RAIL));
    for (let x = lo; x <= hi; x += 40) {
      const sleeper = box(looks, 6, 2 * GAUGE + 12, 1.5, 'rubber');
      sleeper.position.set(x - ox, 0, FLOOR);
      rig.add(sleeper);
    }
    for (const x of [lo, hi]) {
      const stop = housing(looks, 4, 2 * GAUGE + 10, 9, 'paint-accent', 1);
      stop.position.set(x - ox, 0, FLOOR);
      rig.add(stop);
    }
    const ctl = panel(looks, 22, 36); // robot controller cabinet beside the rail end
    ctl.group.position.set(hi - ox + 18, 0, FLOOR);
    rig.add(ctl.group);

    const carriage = new THREE.Group();
    const deck = housing(looks, 2 * CARRIAGE_HALF, 40, DECK_H, 'paint', 2);
    deck.position.z = DECK_Z;
    const arm = new RobotArm(looks);
    arm.tip.name = 'robot-tip';
    arm.group.position.z = BASE_Z;
    carriage.add(deck, arm.group);
    rig.add(carriage);
    group.add(rig);
    // The rig stands in front of the line, like the shelf: the cutaway section never slices it.
    rig.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.userData.cut = false; });

    const clampX = (x: number) => Math.min(hi - CARRIAGE_HALF, Math.max(lo + CARRIAGE_HALF, x));
    let cx = clampX(ox);
    let grip = 0;
    const inst: StationInstance = {
      begin(job) {
        if (!job.isSpace) ctx.audio.play('robot-servo', { x: ox });
      },
      update(dt, job, t) {
        const p = ctx.placing().find((j) => !j.isSpace); // oldest letter in flight (a space is a bare pallet: nothing to carry)
        let target: Vec3;
        let closed = 0;
        let goal = cx;
        let rate = 4;
        let armRate = 10;
        if (p) {
          target = [p.pos[0], p.pos[1], p.pos[2] + lerp(FLAT_GRIP, UPRIGHT_GRIP, ss(0, 1, p.progress))];
          closed = 1;
          goal = p.pos[0];
          rate = CARRY_RATE;
          armRate = CARRY_ARM_RATE;
        } else if (job && !job.isSpace) {
          target = [job.pos[0], job.pos[1], job.pos[2] + lerp(30, FLAT_GRIP, ss(0.5, 0.8, t))];
          closed = ss(0.7, 0.9, t);
          goal = job.pos[0];
        } else {
          target = [cx, railY - 20, 90];
        }
        cx = ease(cx, clampX(goal), dt, rate);
        carriage.position.x = cx - ox;
        // world → arm-local: subtract the arm base's world position
        arm.reach([target[0] - cx, target[1] - railY, target[2] - (oz + BASE_Z)], dt, armRate);
        grip = ease(grip, closed, dt, 12);
        arm.grip(grip);
        ctl.update(ctx.now());
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
