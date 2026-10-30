import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, gauge, housing, lamp, panel, pipe } from '../../shared/parts';
import { FLOOR, helix, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';

const ARM_Z = 74;
const UP = 20;       // extra hook height while raised

/**
 * Station 2: planetary dough mixer. A column carries a motor head over the bowl; a spiral dough hook lowers into the
 * bowl, orbits and spins while the layers blend into dough, then lifts out.
 */
export const mixer: StationDef = {
  id: 'cookie-mixer',
  label: 'Dough mixer',
  footprint: [100, 110],
  height: 120,
  duration: 2.2,
  spaceDuration: 0.3,
  outputStage: 'dough',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const stand = column(looks, 9, ARM_Z - FLOOR - 4, 'paint', 24);
    stand.position.set(0, 40, FLOOR);
    const headBase = housing(looks, 30, 70, 14, 'paint', 3);
    headBase.position.set(0, 12, ARM_Z - 14);
    const motor = column(looks, 11, 22, 'paint-accent', 24);
    motor.position.set(0, 0, ARM_Z);
    group.add(stand, headBase, motor, beam(looks, [0, 40, ARM_Z - 14], [0, 0, ARM_Z - 14], 8, 'steel'));

    // Orbiting assembly: shaft + spiral hook; spins about its own axis inside an orbiting carrier.
    const carrier = new THREE.Group();
    const hook = new THREE.Group();
    const shaft = column(looks, 1.6, ARM_Z - 8 - 12, 'steel', 12);
    shaft.position.z = 12;
    const spiral = pipe(looks, helix(3.2, 1.6, 12, 4, 0, 0, 10), 1.1, 'steel', 8);
    hook.add(shaft, spiral);
    carrier.add(hook);
    group.add(carrier);

    const dial = gauge(looks, 5);
    dial.group.position.set(-20, 40, 36);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(46, -44, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(0, 38, ARM_Z + 4);
    group.add(dial.group, ctl.group, beacon.group);

    const shots = oneShots();
    let orbit = 0;
    let down = 0;
    let on: boolean | null = null;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        down = live ? ss(0, 0.15, t) * (1 - ss(0.88, 1, t)) : down * Math.exp(-6 * dt);
        orbit += dt * (live ? 7 : 0);
        carrier.position.set(Math.cos(orbit) * 3.2 * down, Math.sin(orbit) * 3.2 * down, (1 - down) * UP);
        hook.rotation.z = -orbit * 3;
        if (job) product?.shape('dough', t);
        if (live && shots.once('churn')) ctx.audio.play('mixer-churn', { x: ctx.origin[0] });
        if (live && t < 0.25) ctx.particles.emit('powder', { pos: world(ctx, 0, 0, 18), count: 1, vel: [3, 0, 12], spread: 3, floor: world(ctx, 0, 0, 2)[2] });
        dial.set(live ? 0.4 + 0.3 * Math.sin(orbit) : 0.2);
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
