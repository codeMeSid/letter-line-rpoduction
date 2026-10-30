import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, housing, lathe } from '../../shared/parts';
import { FLOOR, ease, oneShots, stationBase, teardown, world } from '../../shared/stationKit';
import { controls } from './kit';

const ARM_Z = 64;

/**
 * Station 7: bisque inspection. A ring light and camera on a gantry look at the biscuit and a tap hammer rings the rim
 * (a crack makes it dull); a diverter paddle kicks a defective mug toward the reject chute (verdict = `job.defect`).
 */
export const inspection: StationDef = {
  id: 'mug-inspection',
  label: 'Inspection',
  footprint: [110, 120],
  height: 100,
  duration: 1.2,
  spaceDuration: 0.3,
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const y of [-34, 34]) group.add(beam(looks, [0, y, FLOOR], [0, y, ARM_Z], 7, 'paint'));
    group.add(beam(looks, [0, -34, ARM_Z], [0, 34, ARM_Z], 7, 'paint'));
    // Camera over the mug with a ring light of glow tube.
    const cam = new THREE.Group();
    cam.position.set(0, 0, ARM_Z - 6);
    cam.add(housing(looks, 14, 14, 12, 'rubber', 2), lathe(looks, [[0, -4], [4.2, -4], [4.2, 0], [0, 0]], 'glass', 14));
    const ringGeom = new THREE.TorusGeometry(10, 1.1, 8, 28);
    const ring = looks.part(ringGeom, 'glow', false);
    ring.position.z = -6;
    ring.visible = false;
    cam.add(ring);
    group.add(cam);
    // Tap hammer: pivot arm on the front post, head swings to the rim.
    const pivot = new THREE.Group();
    pivot.position.set(-9, -34, 46);
    const arm = beam(looks, [0, 0, 0], [0, 26, 0], 3, 'steel');
    const head = column(looks, 2.4, 5, 'rubber', 10);
    head.position.set(0, 27, -2);
    pivot.add(arm, head);
    group.add(pivot);
    // Diverter paddle + ram.
    const divert = new THREE.Group();
    divert.position.set(20, 30, 10);
    const paddle = housing(looks, 3, 34, 16, 'paint-accent', 1);
    paddle.position.y = -17;
    divert.add(paddle);
    group.add(divert, beam(looks, [20, 52, 8], [20, 30, 8], 5, 'steel'));
    const tick = controls(ctx, group, [0, 34, ARM_Z + 8]);

    const shots = oneShots();
    let tap = 0;
    let kick = 0;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        ring.visible = live && t > 0.1 && t < 0.6;
        if (live && t >= 0.3 && shots.once('flash')) {
          ctx.audio.play('camera-flash', { x: ctx.origin[0] });
          ctx.particles.emit('flash', { pos: world(ctx, 0, 0, ARM_Z - 12), count: 1, floor: world(ctx, 0, 0, 0)[2] });
        }
        const striking = live && t > 0.55 && t < 0.7;
        tap = ease(tap, striking ? 1 : 0, dt, 30);
        pivot.rotation.x = 0.1 - 0.82 * tap;
        if (live && t >= 0.58 && shots.once('tap')) ctx.audio.play('ding', { x: ctx.origin[0], gain: 0.5 });
        const kicking = !!job?.defect && t > 0.75;
        if (kicking && shots.once('kick')) ctx.audio.play('reject-kick', { x: ctx.origin[0] });
        kick = ease(kick, kicking ? 1 : 0, dt, 14);
        divert.rotation.z = -0.9 * kick;
        if (job) product?.shape('bisque', 1);
        tick(live);
      },
      finish: (job) => (job.defect ? 'reject' : 'pass'),
      destroy() { teardown(group); },
    };
  },
};
