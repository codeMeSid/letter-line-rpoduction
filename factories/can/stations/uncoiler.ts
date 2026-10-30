import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, housing, lathe, pipe, piston } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { controls } from './controls';

const COIL_X = -30;
const COIL_Y = 58;
const COIL_Z = 32;
const FEED_Z = 62;   // feed rolls clear the 50 high cans passing underneath

/**
 * Station 1: uncoiler. A heavy aluminium coil on a driven mandrel pays out a strip over a loop pit through the feed rolls;
 * a flying shear drops on the strip and cuts the sheet the product follows.
 */
export const uncoiler: StationDef = {
  id: 'can-uncoiler',
  label: 'Uncoiler',
  footprint: [110, 130],
  height: 160,
  duration: 2.0,
  spaceDuration: 0.3,
  outputStage: 'strip',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    // Mandrel stand and the coil itself (axis along x), banded with straps.
    for (const x of [COIL_X - 22, COIL_X + 22]) {
      group.add(beam(looks, [x, COIL_Y - 12, FLOOR], [x, COIL_Y, COIL_Z], 7, 'paint'), beam(looks, [x, COIL_Y + 12, FLOOR], [x, COIL_Y, COIL_Z], 7, 'paint'));
    }
    const mandrel = column(looks, 4, 60, 'steel', 14);
    mandrel.rotation.y = Math.PI / 2;
    mandrel.position.set(COIL_X - 30, COIL_Y, COIL_Z);
    const tilt = new THREE.Group();
    tilt.position.set(COIL_X - 12, COIL_Y, COIL_Z);
    tilt.rotation.y = Math.PI / 2;
    const spin = new THREE.Group();
    spin.add(lathe(looks, [[4.5, 0], [22, 0], [22, 24], [4.5, 24], [4.5, 0]], 'steel', 40));
    for (const z of [6, 18]) spin.add(lathe(looks, [[22, z], [22.6, z], [22.6, z + 1.4], [22, z + 1.4]], 'paint-accent', 40));
    const cheek = lathe(looks, [[4, 0], [10, 0], [10, 2], [4, 2]], 'steel', 20);
    cheek.position.z = -2;
    spin.add(cheek);
    tilt.add(spin);
    group.add(mandrel, tilt);
    // Strip path: off the coil, down into the loop pit, up through the feed rolls over the belt.
    group.add(pipe(looks, [[COIL_X, COIL_Y, COIL_Z + 22], [COIL_X, COIL_Y - 12, COIL_Z + 34], [COIL_X, 38, FEED_Z - 4], [COIL_X + 6, 14, FEED_Z - 2], [-6, 0, FEED_Z - 2]], 0.9, 'steel', 6));
    const roll = (z: number) => {
      const r = column(looks, 4.5, 40, 'steel', 18);
      r.rotation.x = Math.PI / 2;
      r.position.set(-6, 20, z);
      return r;
    };
    const rolls = [roll(FEED_Z - 6), roll(FEED_Z + 3)];
    const frame = housing(looks, 14, 10, 24, 'paint', 2);
    frame.position.set(-6, 32, FEED_Z - 12);
    group.add(...rolls, frame);
    // Flying shear.
    for (const y of [-34, 34]) group.add(beam(looks, [10, y, FLOOR], [10, y, 152], 7, 'paint'));
    group.add(beam(looks, [10, -34, 150], [10, 34, 150], 7, 'paint'));
    const shear = piston(looks, { body: 6, rod: 2.6, len: 67, stroke: 59, role: 'steel' });
    shear.group.position.set(10, 0, 76);
    const blade = housing(looks, 3, 30, 14, 'copper', 0.6);
    blade.position.z = -14;
    shear.rodEnd.add(blade);
    group.add(shear.group);
    const ui = controls(ctx, [-56, -50], [-32, -34, 78], [40, -34, 158]);

    const shots = oneShots();
    let ext = 0;
    let rot = 0;
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('motor-whir', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const speed = live && t < 0.7 ? 2.2 : 0.2;
        rot += dt * speed;
        spin.rotation.z = rot;
        for (const r of rolls) r.rotation.y = rot * 2;
        const cut = live && t > 0.72 && t < 0.9;
        ext = ease(ext, cut ? 1 : 0, dt, 30);
        shear.set(ext);
        if (live && t >= 0.8 && shots.once('cut')) {
          ctx.audio.play('press-thump', { x: ctx.origin[0] });
          ctx.particles.emit('spark', { pos: world(ctx, 10, 0, 4), count: 4, spread: 6, vel: [0, 0, 8], floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('strip', ss(0, 1, t));
        ui.tick(live, ext);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
