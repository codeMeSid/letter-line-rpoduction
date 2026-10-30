import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, housing, piston, column } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { panelKit } from './panelKit';

const MOUNT = 100;
const STROKE = 60;
const XY: [number, number][] = [[-10, -9.2], [10, -9.2], [-10, 9.2], [10, 9.2]];

/** Station 7: wheel mounter. Four magazine tubes hold rubber tyres over the four axle ends; a press plate drives each down onto its hub. */
export const wheeler: StationDef = {
  id: 'car-wheeler',
  label: 'Wheel mounter',
  footprint: [110, 110],
  height: 130,
  duration: 1.8,
  spaceDuration: 0.3,
  outputStage: 'wheeled',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    // Magazine tubes with a spare tyre waiting in each, over the four axle ends.
    const stacks = XY.map(([x, y]) => {
      const tube = column(looks, 4.4, 31, 'glass', 14);
      tube.position.set(x, y, 9);
      const tyre = looks.part(new THREE.CylinderGeometry(3.2, 3.2, 2.4, 18).rotateX(Math.PI / 2), 'rubber');
      tyre.position.set(x, y, 12);
      group.add(tube, tyre);
      return tyre;
    });
    group.add(beam(looks, [-24, 30, FLOOR], [-24, 30, MOUNT + 10], 5, 'paint'), beam(looks, [24, 30, FLOOR], [24, 30, MOUNT + 10], 5, 'paint'));
    const bridge = housing(looks, 54, 16, 8, 'paint', 2);
    bridge.position.set(0, 30, MOUNT + 10);
    group.add(bridge, beam(looks, [0, 30, MOUNT + 6], [0, 0, MOUNT + 6], 6, 'paint'));
    const ram = piston(looks, { body: 8, rod: 3.4, len: STROKE + 6, stroke: STROKE, role: 'steel' });
    ram.group.position.set(0, 0, MOUNT);
    // Cross head with four plungers that enter the tubes.
    const head = housing(looks, 30, 30, 4, 'steel', 1);
    head.position.z = -6;
    ram.rodEnd.add(head);
    for (const [x, y] of XY) { const p = column(looks, 1.8, 24, 'copper', 10); p.position.set(x, y, -30); ram.rodEnd.add(p); }
    group.add(ram.group);
    const ui = panelKit(ctx, group, [50, -44], 70);

    const shots = oneShots();
    let ext = 0;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        ext = ease(ext, live ? ss(0.45, 0.75, t) * (1 - ss(0.82, 0.98, t)) : 0, dt, 24);
        ram.set(ext);
        stacks.forEach((s) => { s.visible = !live || t < 0.45; });
        if (live && t >= 0.7 && shots.once('press')) {
          ctx.audio.play('press-thump', { x: ctx.origin[0] });
          for (const [x, y] of XY) ctx.particles.emit('spark', { pos: world(ctx, x, y, 8), count: 1, vel: [0, 0, 5], spread: 3, floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('wheeled', ss(0.45, 0.9, t));
        ui.tick(live, ext);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
