import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, flange, housing, pipe } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { controls } from './kit';

const HEAD_Z = 118;
const SHAFT = 70;
const LOW = 5;      // blade bottom when dipped into the tub
const HIGH = 40;    // blade bottom at rest

/**
 * Station 2: blunger. A back C-frame carries a motor and a shaft with a two-blade propeller that dips into the tub and
 * stirs the clay and water into cream slip; a water line with a valve feeds the tub.
 */
export const blunger: StationDef = {
  id: 'mug-blunger',
  label: 'Blunger',
  footprint: [120, 120],
  height: 150,
  duration: 1.8,
  spaceDuration: 0.3,
  outputStage: 'slip',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const x of [-30, 30]) group.add(beam(looks, [x, 44, FLOOR], [x, 44, HEAD_Z], 8, 'paint'));
    const head = housing(looks, 76, 66, 10, 'paint', 2);
    head.position.set(0, 14, HEAD_Z);
    const motor = column(looks, 9, 22, 'paint-accent', 20);
    motor.position.set(0, 0, HEAD_Z + 10);
    group.add(head, motor);
    // Rotating shaft + propeller blades.
    const stir = new THREE.Group();
    const shaft = column(looks, 2.6, SHAFT, 'steel', 12);
    shaft.position.z = 3;
    stir.add(shaft);
    for (const s of [-1, 1]) {
      const blade = housing(looks, 12, 3, 3, 'steel', 0.5);
      blade.position.set(s * 6, 0, 0);
      blade.rotation.y = s * 0.45;
      stir.add(blade);
    }
    stir.position.z = HIGH;
    group.add(stir);
    // Water line with valve.
    group.add(pipe(looks, [[30, 44, 90], [30, 20, 96], [14, 8, 74]], 2.2, 'steel'));
    const valve = flange(looks, 5, 6);
    valve.position.set(30, 30, 94);
    group.add(valve);
    const tick = controls(ctx, group, [30, 44, HEAD_Z + 6]);

    const shots = oneShots();
    let spin = 0;
    let z = HIGH;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const down = live && t > 0.08 && t < 0.88;
        z = ease(z, down ? LOW : HIGH, dt, 9);
        stir.position.z = z;
        spin += dt * (down ? 14 : 0);
        stir.rotation.z = spin;
        if (live && t >= 0.08 && shots.once('churn')) ctx.audio.play('mixer-churn', { x: ctx.origin[0] });
        if (down && t < 0.4) ctx.particles.emit('liquid', { pos: world(ctx, 14, 8, 72), count: 1, vel: [0, 0, -4], spread: 1.5, floor: world(ctx, 0, 0, 0)[2] });
        if (job) product?.shape('slip', ss(0.15, 0.9, t));
        tick(live);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
