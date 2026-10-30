import type { StationDef } from '../../../engine/station';
import { beam, gauge, housing, lamp, lathe, panel, pipe, piston } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';

const MID = 30;         // bottle centre height above the belt (puck 3 + half of 54)
const LIFT = 22;        // extra rise while inverted, clears the nozzle
const MOUNT = 84;
const STROKE = 56;
const NOZZLE_Z = 17;

/**
 * Station 8: bottle rinser. A flipper clamps the bottle on a hydraulic lift, turns it neck-down over a water-jet nozzle,
 * jets rinse it out, then turns it back upright.
 */
export const rinser: StationDef = {
  id: 'bottle-rinser',
  label: 'Rinser',
  footprint: [100, 110],
  height: 150,
  duration: 1.8,
  spaceDuration: 0.3,
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    // Water nozzle: a manifold at the back, a riser pipe curving over to a jet head under the inverted neck.
    const tank = lathe(looks, [[0, 0], [16, 0], [16, 30], [12, 36], [0, 38]], 'steel');
    tank.position.set(-38, 56, FLOOR);
    const nozzle = lathe(looks, [[0, 0], [3, 0], [3, 3], [1.4, 3], [1.4, 5], [0, 5]], 'copper', 12);
    nozzle.position.set(0, 0, NOZZLE_Z - 5);
    group.add(tank, nozzle, pipe(looks, [[-38, 56, FLOOR + 36], [-30, 40, -10], [0, 20, 0], [0, 0, NOZZLE_Z - 6]], 2.2, 'copper'));
    const pump = housing(looks, 20, 14, 16, 'paint', 2);
    pump.position.set(-8, 62, FLOOR);
    group.add(pump, pipe(looks, [[-22, 62, FLOOR + 8], [-36, 58, FLOOR + 8]], 2.5, 'steel'));

    // Portal with the lift; the rod end carries the flipper (a rotary actuator, a cross bar and two grip pads).
    for (const x of [-30, 30]) group.add(beam(looks, [x, 36, FLOOR], [x, 36, MOUNT + 66], 6, 'paint'));
    const head = housing(looks, 74, 44, 8, 'paint', 2);
    head.position.set(0, 14, MOUNT + 66);
    group.add(head);
    const lift = piston(looks, { body: 8, rod: 3.5, len: STROKE + 6, stroke: STROKE, role: 'steel' });
    lift.group.position.set(0, 0, MOUNT); // body stands on the mount line up to the head
    group.add(lift.group);
    const flipper = lift.rodEnd;
    const motor = housing(looks, 14, 14, 14, 'paint-accent', 2);
    motor.position.set(0, -34, -7);
    flipper.add(motor, beam(looks, [0, -28, 0], [0, -12, 0], 4, 'steel'), beam(looks, [0, 12, 0], [0, 28, 0], 4, 'steel'));
    for (const s of [-1, 1]) {
      const pad = housing(looks, 6, 3, 18, 'rubber', 1);
      pad.position.set(0, s * 11.5, -9);
      flipper.add(pad);
    }
    const dial = gauge(looks, 5);
    dial.group.position.set(34, 20, 70);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(44, -44, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(-30, 36, MOUNT + 78);
    group.add(dial.group, ctl.group, beacon.group);

    const shots = oneShots();
    let inv = 0;
    let on: boolean | null = null;
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('water-jet', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        inv = live ? ss(0.12, 0.38, t) * (1 - ss(0.68, 0.92, t)) : ease(inv, 0, dt, 6);
        const phi = Math.PI * inv;
        const lift_ = LIFT * inv;
        if (job && product) {
          product.root.rotation.y = phi; // about the pad axis (y): the bottle swings in the x-z plane
          product.root.position.x -= MID * Math.sin(phi);
          product.root.position.z += MID * (1 - Math.cos(phi)) + lift_;
          product.shape('bottle', 1);
        }
        const zc = MID + lift_;
        lift.set((MOUNT - zc) / STROKE);
        flipper.rotation.y = phi;
        if (live && inv > 0.97) {
          ctx.particles.emit('water', { pos: world(ctx, 0, 0, NOZZLE_Z), count: 3, vel: [0, 0, 70], spread: 2, floor: world(ctx, 0, 0, 0)[2] });
          ctx.particles.emit('droplet', { pos: world(ctx, 0, 0, NOZZLE_Z + 8), count: 1, vel: [0, 0, -10], spread: 6, floor: world(ctx, 0, 0, 0)[2] });
        }
        ctl.update(ctx.now());
        dial.set(0.5 + 0.2 * inv);
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
