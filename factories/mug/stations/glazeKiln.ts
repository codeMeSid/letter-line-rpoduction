import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { column, flange, housing, lathe, pipe } from '../../shared/parts';
import { FLOOR, ease, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { controls } from './kit';

const BELL_UP = 60;
const BELL_DOWN = -2;

/**
 * Station 9: bell kiln. A lifting steel-and-brick bell (cut open toward the viewer) is lowered over the mug on four guide
 * rods and gas burners fire the glaze; the glaze melts to a glossy finish while the mug glows.
 */
export const glazeKiln: StationDef = {
  id: 'mug-glazekiln',
  label: 'Glaze kiln',
  footprint: [140, 130],
  height: 150,
  duration: 2.6,
  spaceDuration: 0.3,
  outputStage: 'fired',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 56, 50, [100, 90]));
    // Guide rods with a hoist on top.
    for (const x of [-46, 46]) for (const y of [-34, 34]) {
      const rod = column(looks, 2.6, 130 - FLOOR, 'steel', 8);
      rod.position.set(x, y, FLOOR);
      group.add(rod);
    }
    const cap = housing(looks, 100, 80, 6, 'paint', 2);
    cap.position.z = 112;
    group.add(cap);
    // The bell: shell lathe with the front cut away (toward −y), so the glowing mug shows through; hoisted on a rope.
    const bell = new THREE.Group();
    bell.add(lathe(looks, [[30, 0], [34, 0], [34, 28], [26, 40], [0, 44], [0, 41], [25, 37.5], [30, 28], [30, 0]], 'concrete', 32, [0.9, Math.PI * 2 - 1.8]));
    const rope = column(looks, 1.6, 1, 'steel', 8);
    group.add(bell, rope);
    // Gas burners fire inward through the bell's side; flames flicker while the glaze matures.
    const flames = [-1, 1].map((s) => {
      const nozzle = column(looks, 3.4, 12, 'copper', 12);
      nozzle.rotation.y = -s * Math.PI / 2;
      nozzle.position.set(s * 56, 0, 6);
      const flame = lathe(looks, [[0, 0], [2.6, 0], [1.2, 12], [0, 18]], 'glow', 10);
      flame.rotation.y = -s * Math.PI / 2;
      flame.position.set(s * 44, 0, 6);
      flame.visible = false;
      group.add(nozzle, flame, pipe(looks, [[s * 62, 0, 6], [s * 66, 0, FLOOR + 14], [s * 66, 30, FLOOR + 14]], 2.4, 'copper'));
      const fl = flange(looks, 5, 6);
      fl.position.set(s * 66, 30, FLOOR + 14);
      group.add(fl);
      return flame;
    });
    const stack = column(looks, 6, 18, 'steel', 12);
    stack.position.set(0, 0, 118);
    group.add(stack);
    const tick = controls(ctx, group, [46, 34, 118]);
    const roar = ctx.audio.loop('kiln-roar', { x: ctx.origin[0], gain: 0.2 });

    let z = BELL_UP;
    const place = () => {
      bell.position.z = z;
      rope.position.z = z + 44;
      rope.scale.z = Math.max(0.01, 112 - (z + 44));
    };
    place();
    return {
      begin(job) {
        if (!job.isSpace) ctx.audio.play('motor-whir', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const down = live && t > 0.06 && t < 0.92;
        z = ease(z, down ? BELL_DOWN : BELL_UP, dt, 7);
        place();
        const lit = down && z < 12;
        flames.forEach((f, i) => { f.visible = lit && Math.sin(ctx.now() * 0.015 + i * 2) > -0.7; });
        if (lit) ctx.particles.emit('ember', { pos: world(ctx, 0, 0, 18), count: 1, vel: [0, 0, 8], spread: 4, floor: world(ctx, 0, 0, 0)[2] });
        if (job) product?.shape('fired', ss(0, 1, t));
        tick(live);
      },
      finish: () => 'pass',
      destroy() { roar.stop(); teardown(group); },
    };
  },
};
