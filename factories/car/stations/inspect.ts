import type { StationDef } from '../../../engine/station';
import { beam, housing, lathe } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { panelKit } from './panelKit';

const CAM_Z = 58;

/** Station 10: vision check. A gantry with a ring light and camera swings over the car, flashes and rejects flawed cars (job.defect). */
export const inspect: StationDef = {
  id: 'car-inspect',
  label: 'Vision check',
  footprint: [100, 110],
  height: 110,
  duration: 1.2,
  spaceDuration: 0.3,
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const y of [-26, 26]) group.add(beam(looks, [0, y, FLOOR], [0, y, CAM_Z + 14], 5, 'paint'));
    const arch = housing(looks, 14, 62, 6, 'paint', 2);
    arch.position.set(0, 0, CAM_Z + 14);
    group.add(arch);
    const head = housing(looks, 14, 14, 12, 'steel', 2);
    const lens = lathe(looks, [[0, 0], [4, 0], [4, 6], [0, 6]], 'glass', 16);
    lens.rotation.x = Math.PI;
    lens.position.z = 0;
    const ring = lathe(looks, [[6, 0], [9, 0], [9, 2], [6, 2]], 'glow', 24);
    ring.position.z = -2;
    head.add(lens, ring);
    head.position.set(0, 0, CAM_Z);
    group.add(head);
    const ui = panelKit(ctx, group, [44, -46], 70);

    const shots = oneShots();
    let swing = 0;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        swing = ease(swing, live ? Math.sin(ss(0, 1, t) * Math.PI) : 0, dt, 24);
        head.position.y = -14 * Math.sin(swing * Math.PI) * (live ? Math.sin(t * Math.PI * 2) : 0);
        head.position.z = CAM_Z - 22 * swing;
        ring.visible = live;
        if (live && t >= 0.5 && shots.once('flash')) {
          ctx.audio.play('camera-flash', { x: ctx.origin[0] });
          ctx.particles.emit('flash', { pos: world(ctx, 0, 0, 24), count: 1, vel: [0, 0, 0], spread: 0.5, floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('printed', 1);
        ui.tick(live, swing);
      },
      finish: (job) => (job.defect ? 'reject' : 'pass'),
      destroy() { teardown(group); },
    };
  },
};
