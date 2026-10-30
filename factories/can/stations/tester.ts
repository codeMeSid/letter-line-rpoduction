import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, housing, lathe } from '../../shared/parts';
import { FLOOR, ease, oneShots, stationBase, teardown, world } from '../../shared/stationKit';
import { controls } from './controls';

const GANTRY_Z = 96;

/**
 * Station 9: inspection gantry. A vision head and ring light look down into the open can, two side cameras check the neck and
 * wall; a defective can (verdict = `job.defect`) is kicked off by the diverter paddle.
 */
export const tester: StationDef = {
  id: 'can-tester',
  label: 'Can inspection',
  footprint: [100, 110],
  height: 120,
  duration: 1.2,
  spaceDuration: 0.3,
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const y of [-38, 38]) group.add(beam(looks, [0, y, FLOOR], [0, y, GANTRY_Z], 7, 'paint'));
    group.add(beam(looks, [0, -38, GANTRY_Z], [0, 38, GANTRY_Z], 7, 'paint'));
    // Vision head over the open end with a ring light.
    const head = new THREE.Group();
    head.add(housing(looks, 14, 14, 16, 'rubber', 1.5), lathe(looks, [[0, 0], [4.4, 0], [4.4, -6], [3, -8], [0, -8]], 'glass', 16));
    group.add(head, beam(looks, [0, 0, GANTRY_Z - 4], [0, 0, GANTRY_Z - 8], 3, 'steel'));
    head.position.z = GANTRY_Z - 24;
    const ring = lathe(looks, [[9, 0], [14, 0], [14, 3], [9, 3]], 'glow', 24);
    ring.position.z = 62;
    ring.visible = false;
    group.add(ring);
    // Side cameras on short arms, aimed at the neck.
    for (const y of [-1, 1]) {
      const cam = new THREE.Group();
      cam.position.set(0, 34 * y, 52);
      cam.rotation.x = y * Math.PI / 2 * 0.9;
      cam.add(housing(looks, 9, 8, 10, 'rubber', 1), lathe(looks, [[0, 10], [3.2, 10], [3.2, 13], [2.2, 14], [0, 14]], 'glass', 14));
      group.add(cam, beam(looks, [0, 38 * y, 44], [0, 38 * y, 56], 4, 'steel'));
    }
    // Diverter paddle on its pivot, kicked by a cylinder.
    const pivot = new THREE.Group();
    pivot.position.set(20, 30, 10);
    const paddle = housing(looks, 3, 34, 16, 'paint-accent', 1);
    paddle.position.y = -17;
    pivot.add(paddle);
    group.add(pivot, beam(looks, [20, 52, 8], [20, 30, 8], 5, 'steel'));
    const ui = controls(ctx, [-52, 46], [-30, -38, 80], [30, -38, GANTRY_Z + 8]);

    const shots = oneShots();
    let swing = 0;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const flash = live && t > 0.4 && t < 0.62;
        ring.visible = flash;
        if (live && t >= 0.4 && shots.once('flash')) {
          ctx.audio.play('camera-flash', { x: ctx.origin[0] });
          ctx.particles.emit('flash', { pos: world(ctx, 0, 0, 62), count: 1, floor: world(ctx, 0, 0, 0)[2] });
        }
        const kick = !!job?.defect && t > 0.75;
        if (kick && shots.once('kick')) ctx.audio.play('reject-kick', { x: ctx.origin[0] });
        swing = ease(swing, kick ? 1 : 0, dt, 14);
        pivot.rotation.z = -0.9 * swing;
        if (job) product?.shape('necked', 1);
        ui.tick(live, flash ? 1 : 0.3);
      },
      finish: (job) => (job.defect ? 'reject' : 'pass'),
      destroy() { teardown(group); },
    };
  },
};
