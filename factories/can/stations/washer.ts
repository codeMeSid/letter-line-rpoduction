import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, gear, housing, pipe } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { controls } from './controls';

const ROOF_Z = 58;
const ARM_Z = 54;

/**
 * Station 6: washer. A spray tunnel over the belt: rotating arm and side manifolds flush the drawing lubricant off the mill finish,
 * a hot-air blower dries the bright can.
 */
export const washer: StationDef = {
  id: 'can-washer',
  label: 'Washer',
  footprint: [110, 110],
  height: 100,
  duration: 2.0,
  spaceDuration: 0.3,
  outputStage: 'washed',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    // Tunnel: roof slab and low side walls (open ends so the line runs through).
    const roof = housing(looks, 84, 80, 5, 'paint', 2);
    roof.position.z = ROOF_Z;
    group.add(roof);
    for (const y of [-38, 38]) {
      const wall = housing(looks, 84, 4, 20 - FLOOR, 'paint-accent', 1);
      wall.position.set(0, y, FLOOR);
      group.add(wall);
    }
    for (const x of [-40, 40]) for (const y of [-38, 38]) group.add(beam(looks, [x, y, FLOOR], [x, y, ROOF_Z], 5, 'steel'));
    // Side manifolds with downcomer nozzles.
    for (const y of [-26, 26]) {
      group.add(pipe(looks, [[-36, y, ARM_Z - 2], [36, y, ARM_Z - 2]], 1.6, 'copper', 8));
      for (let i = 0; i < 6; i++) {
        const n = column(looks, 0.9, 5, 'steel', 8);
        n.position.set(-30 + i * 12, y * 0.55, ARM_Z - 4);
        group.add(n, beam(looks, [-30 + i * 12, y, ARM_Z - 2], [-30 + i * 12, y * 0.55, ARM_Z - 2], 1.4, 'copper'));
      }
    }
    // Rotating spray arm over the can.
    const arm = new THREE.Group();
    arm.position.z = ARM_Z;
    arm.add(beam(looks, [-16, 0, 0], [16, 0, 0], 2.4, 'steel'));
    for (const x of [-14, -7, 7, 14]) {
      const n = column(looks, 1, 3, 'copper', 8);
      n.position.set(x, 0, -3);
      arm.add(n);
    }
    const hub = column(looks, 2.4, ROOF_Z - ARM_Z, 'steel', 10);
    hub.position.z = ARM_Z;
    group.add(arm, hub);
    // Wash tank, pump and the blower on the drying side.
    const tank = housing(looks, 34, 20, 26, 'paint-accent', 3);
    tank.position.set(-30, -58, FLOOR);
    const blower = housing(looks, 24, 20, 24, 'paint', 3);
    blower.position.set(32, -58, FLOOR);
    const fan = gear(looks, 8, 10, 3, 'steel');
    fan.rotation.x = Math.PI / 2;
    fan.position.set(32, -47, FLOOR + 12);
    group.add(tank, blower, fan, pipe(looks, [[32, -58, FLOOR + 24], [32, -50, 30], [28, -30, 44], [24, -14, 48]], 3, 'steel', 10));
    const ui = controls(ctx, [-56, 40], [-44, -40, 80], [44, 38, 66]);

    const shots = oneShots();
    let spin = 0;
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('water-jet', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        spin += dt * (live ? 8 : 0.6);
        arm.rotation.z = spin;
        fan.rotation.z = spin * 1.5;
        const floor = world(ctx, 0, 0, 0)[2];
        if (live && t > 0.1 && t < 0.75) {
          for (const x of [-14, 14]) {
            const a = arm.rotation.z;
            ctx.particles.emit('water', { pos: world(ctx, x * Math.cos(a), x * Math.sin(a), ARM_Z - 4), count: 1, vel: [0, 0, -14], spread: 1.5, floor });
          }
        }
        if (live && t > 0.75) ctx.particles.emit('steam', { pos: world(ctx, 0, 0, 52), count: 1, vel: [0, 0, 6], spread: 8, floor });
        if (job) product?.shape('washed', ss(0.1, 0.85, t));
        ui.tick(live, 0.5 + 0.3 * Math.sin(ctx.now() / 500));
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
