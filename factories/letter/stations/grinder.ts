import * as THREE from 'three';
import type { StationDef, StationInstance } from '../../../engine/station';
import { beam, column, housing, lathe, panel, piston } from '../../shared/parts';
import { LETTER_R, PALLET_T } from '../product';
import { FLOOR, ease, floorZ, ss, stationBase, teardown, world } from './common';

const COL_X = 50;
const COL_Y = 38;
const RAIL_Z = 72;
const WHEEL_R = 12;
/** Wheel bottom on the flat letter's top while grinding. */
const CONTACT_Z = PALLET_T + 2 * LETTER_R + 0.5;
const MOTOR_R = 8;
/** The rod clamps onto the motor top, so the rod end sits one motor radius above the wheel axis. */
const ROD_DOWN = CONTACT_Z + WHEEL_R + MOTOR_R;
const ROD_UP = ROD_DOWN + 22; // parked: wheel bottom ~30, clear of incoming sprues
/** Slide cylinder: long enough that the retracted rod stays inside the barrel (the brief's len 20 / stroke 50 pokes the rod out of the cap). */
const STROKE = 26;
const BODY_LEN = 32;
const MOUNT = ROD_DOWN + STROKE; // full stroke = wheel on the letter
const ROD_Y = 15; // over the motor's mid-length (motor spans y 4..26)
const X0 = -14;
const SPAN = 28;
const SPIN = 40;

const tri = (u: number) => (u < 0.5 ? 2 * u : 2 - 2 * u);

/**
 * Station 5: surface grinder. A carriage runs on a cross rail between two back columns; its cantilever holds
 * a vertical slide cylinder that lowers a motor-driven abrasive wheel (under a half guard) onto the flat letter,
 * then traverses two passes across it, grinding the sprue and flash off in a shower of sparks.
 */
export const grinder: StationDef = {
  id: 'letter-grinder',
  label: 'Grinder',
  footprint: [120, 100],
  height: 110,
  duration: 1.5,
  spaceDuration: 0.3,
  outputStage: 'ground',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    // Frame: two back columns on feet, a cross rail between them.
    for (const s of [-1, 1]) {
      group.add(beam(looks, [s * COL_X, COL_Y, FLOOR], [s * COL_X, COL_Y, 80], 8));
      const foot = housing(looks, 16, 16, 2, 'steel', 0.5);
      foot.position.set(s * COL_X, COL_Y, FLOOR);
      group.add(foot);
    }
    group.add(beam(looks, [-COL_X - 6, COL_Y, RAIL_Z], [COL_X + 6, COL_Y, RAIL_Z], 6));

    // Head: carriage on the rail, cantilever to the slide cylinder.
    const head = new THREE.Group();
    const carriage = housing(looks, 20, 20, 14, 'paint', 2);
    carriage.position.set(0, COL_Y, RAIL_Z - 7);
    const cantilever = housing(looks, 14, 24, 10, 'paint', 2);
    cantilever.position.set(0, ROD_Y + 5, MOUNT + 6);
    const slideCyl = piston(looks, { body: 6, rod: 3, len: BODY_LEN, stroke: STROKE, role: 'paint-accent' });
    slideCyl.group.position.set(0, ROD_Y, MOUNT);
    head.add(carriage, cantilever, slideCyl.group);
    group.add(head);

    // Slide: motor along y, saddle under the rod end, wheel on the front of the shaft under a half guard.
    const slide = new THREE.Group();
    const motor = column(looks, MOTOR_R, 22, 'paint', 24);
    motor.rotation.x = -Math.PI / 2; // axis → +y
    motor.position.set(0, 4, -MOTOR_R);
    const saddle = housing(looks, 10, 10, 3, 'steel', 1);
    saddle.position.set(0, ROD_Y, -1.5);
    const guard = lathe(looks, [[6, -4.5], [14.5, -4.5], [14.5, 4.5], [6, 4.5], [6, 3.5], [13.5, 3.5], [13.5, -3.5], [6, -3.5], [6, -4.5]], 'paint-accent', 24, [-Math.PI / 2, Math.PI]);
    guard.rotation.x = -Math.PI / 2; // lathe axis → y, the arc over the top half
    guard.position.z = -MOTOR_R;
    const spinner = new THREE.Group();
    spinner.position.z = -MOTOR_R;
    const wheel = looks.part(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 5, 32), 'concrete'); // axis y
    const shaft = column(looks, 2, 8, 'steel', 12);
    shaft.rotation.x = -Math.PI / 2;
    shaft.position.y = -4;
    const nut = column(looks, 3.5, 1.5, 'steel', 6); // hex, so the spin reads
    nut.rotation.x = -Math.PI / 2;
    nut.position.y = -4;
    spinner.add(wheel, shaft, nut);
    slide.add(motor, saddle, guard, spinner);
    head.add(slide);

    const ctl = panel(looks, 18, 34);
    ctl.group.position.set(46, -42, FLOOR);
    group.add(ctl.group);

    let x = X0;
    let rod = ROD_UP;
    let spin = 6;
    const inst: StationInstance = {
      begin(job) {
        if (!job.isSpace) ctx.audio.play('motor-whir', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        if (live) {
          x = X0 + SPAN * tri(Math.min(1, Math.max(0, (t - 0.2) / 0.65))); // constant traverse speed: there and back
          rod = ROD_UP + (ROD_DOWN - ROD_UP) * ss(0, 0.2, t) * (1 - ss(0.85, 1, t));
        } else {
          x = ease(x, X0, dt, 4);
          rod = ease(rod, ROD_UP, dt, 4);
        }
        head.position.x = x;
        slideCyl.set((MOUNT - rod) / STROKE);
        slide.position.z = rod;
        spin = ease(spin, live ? SPIN : 6, dt, 3);
        spinner.rotation.y += spin * dt;

        if (job) product?.shape('ground', ss(0.2, 0.85, t));
        if (live && t >= 0.2 && t <= 0.85) {
          ctx.particles.emit('spark', { pos: world(ctx, x, 0, CONTACT_Z), count: 3, vel: [0, -60, 40], spread: 3, floor: floorZ(ctx) });
        }
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
