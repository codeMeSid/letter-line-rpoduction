import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, housing, piston } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { panelKit } from './panelKit';

const MOUNT = 100;   // rod end at rest
const STROKE = 60;   // lowers the glowing plate to just over the heap

/** Station 2: infra-red melter. A piston lowers a hot plate with glowing quartz rods over the pellets until they slump into a puddle. */
export const heater: StationDef = {
  id: 'car-heater',
  label: 'IR melter',
  footprint: [110, 110],
  height: 140,
  duration: 2.0,
  spaceDuration: 0.3,
  outputStage: 'melted',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const x of [-26, 26]) group.add(beam(looks, [x, 34, FLOOR], [x, 34, MOUNT + 14], 6, 'paint'));
    const bridge = housing(looks, 66, 20, 8, 'paint', 2);
    bridge.position.set(0, 34, MOUNT + 14);
    group.add(bridge, beam(looks, [0, 34, MOUNT + 10], [0, 0, MOUNT + 10], 6, 'paint'));
    const ram = piston(looks, { body: 8, rod: 3.4, len: STROKE + 8, stroke: STROKE, role: 'steel' });
    ram.group.position.set(0, 0, MOUNT);
    group.add(ram.group);
    const plate = housing(looks, 34, 26, 5, 'steel', 1.5);
    plate.position.z = -5;
    ram.rodEnd.add(plate);
    const rods = [-10, -3.3, 3.3, 10].map((x) => {
      const r = looks.part(new THREE.CylinderGeometry(1, 1, 24, 10).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), 'glow');
      r.position.set(0, x * 0.9, -7);
      r.rotation.set(0, 0, 0);
      ram.rodEnd.add(r);
      return r;
    });
    const ui = panelKit(ctx, group, [50, -40], 80);

    const shots = oneShots();
    let ext = 0;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        ext = ease(ext, live ? ss(0.1, 0.35, t) * (1 - ss(0.85, 1, t)) : 0, dt, 20);
        ram.set(ext);
        rods.forEach((r) => { r.visible = ext > 0.05 || !live; });
        if (live && t > 0.3 && t < 0.9) {
          if (shots.once('hiss')) ctx.audio.play('hiss', { x: ctx.origin[0] });
          ctx.particles.emit('steam', { pos: world(ctx, 0, 0, 12), count: 1, vel: [0, 0, 14], spread: 6, floor: world(ctx, 0, 0, 3)[2] });
        }
        if (job) product?.shape('melted', t);
        ui.tick(live, ext);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
