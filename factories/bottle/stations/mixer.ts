import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, gauge, housing, legs, lathe, lamp, panel, pipe, piston } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';

const MOUNT = 92;     // piston mount line (rod end at rest)
const STROKE = 62;
const SHAFT = 20;     // shaft length under the rod end: paddle bottom 72 at rest, 10 at full stroke

/**
 * Station 2: weigh hopper on load cells beside the line, and a paddle mixer: a back C-frame carries a hydraulic lift
 * with a motor and shaft that lowers a two-blade paddle into the tub and stirs the layers into one batch.
 */
export const mixer: StationDef = {
  id: 'bottle-mixer',
  label: 'Weigh hopper & mixer',
  footprint: [120, 120],
  height: 170,
  duration: 1.8,
  spaceDuration: 0.3,
  outputStage: 'mixed',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    // C-frame: two back columns, a web and a cantilevered head carrying the lift.
    for (const x of [-34, 34]) group.add(beam(looks, [x, 44, FLOOR], [x, 44, MOUNT + 66], 8, 'paint'));
    const head = housing(looks, 84, 66, 10, 'paint', 2);
    head.position.set(0, 14, MOUNT + 66);
    const web = housing(looks, 76, 4, 90, 'paint', 1);
    web.position.set(0, 44, MOUNT - 20);
    group.add(head, web);
    const lift = piston(looks, { body: 8, rod: 3.5, len: STROKE + 6, stroke: STROKE, role: 'steel' });
    lift.group.position.set(0, 0, MOUNT);
    group.add(lift.group);
    // Rod end carries the motor, shaft and paddles.
    const motor = column(looks, 8, 20, 'paint-accent', 20);
    motor.position.set(11, 0, -14);
    const gearbox = housing(looks, 14, 14, 8, 'steel', 2);
    gearbox.position.z = -8;
    const shaft = column(looks, 2.2, SHAFT, 'steel', 12);
    shaft.position.z = -SHAFT;
    const paddles = new THREE.Group();
    paddles.position.z = -SHAFT;
    for (const a of [0, Math.PI / 2]) {
      const blade = housing(looks, 16, 2.5, 7, 'steel', 0.8);
      blade.position.z = 1;
      blade.rotation.set(0, 0, a);
      paddles.add(blade);
    }
    lift.rodEnd.add(gearbox, motor, shaft, paddles);

    // Weigh hopper hanging from four load cells on a stand, discharge pipe aimed toward the tub.
    const hx = -52;
    const hy = 40;
    const stand = legs(looks, 34, 34, 64 - FLOOR, 4);
    stand.position.set(hx, hy, FLOOR);
    const hopper = lathe(looks, [[3, 54], [18, 78], [18, 100], [0, 100]], 'steel');
    hopper.position.set(hx, hy, 0);
    const lip = lathe(looks, [[17.5, 98], [20, 98], [20, 102], [17.5, 102]], 'paint-accent');
    lip.position.set(hx, hy, 0);
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cell = housing(looks, 5, 5, 6, 'paint-accent', 1);
      cell.position.set(hx + cx * 17, hy + cy * 17, 62);
      group.add(cell);
    }
    group.add(stand, hopper, lip, pipe(looks, [[hx, hy, 54], [hx, hy - 10, 46], [-24, 22, 42]], 3, 'steel'));
    const dial = gauge(looks, 5);
    dial.group.position.set(hx + 21, hy - 20, 84);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(48, -42, FLOOR);
    const beacon = lamp(looks, 2.4);
    beacon.group.position.set(40, 40, MOUNT + 80);
    group.add(dial.group, ctl.group, beacon.group);

    const shots = oneShots();
    let ext = 0;
    let spin = 0;
    let on: boolean | null = null;
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('mixer-churn', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const target = live ? ss(0.08, 0.25, t) * (1 - ss(0.88, 1, t)) : 0;
        ext = ease(ext, target, dt, live ? 30 : 5);
        lift.set(ext);
        const stirring = live && ext > 0.9;
        spin += dt * (stirring ? 14 : 0);
        paddles.rotation.z = spin;
        shaft.rotation.z = spin;
        if (stirring) ctx.particles.emit('powder', { pos: world(ctx, 0, 0, 20), count: 1, vel: [0, 0, 14], spread: 5, floor: world(ctx, 0, 0, 12)[2] });
        if (job) product?.shape('mixed', ss(0.22, 0.88, t));
        dial.set(0.45 + 0.1 * Math.sin(ctx.now() / 650) + 0.3 * ext);
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
