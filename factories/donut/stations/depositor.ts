import type { StationDef } from '../../../engine/station';
import { DON_R } from '../product';
import { donutVisual } from '../visual';
import { beam, gauge, housing, lamp, lathe, panel, piston } from '../../shared/parts';
import { FLOOR, ease, ss, stationBase, teardown, world } from '../../shared/stationKit';

const MOUNT = 100;   // plunger rod end at rest
const NOZZLE_Z = 40; // nozzle tip height over the belt

/** Station 4: donut depositor. A dough hopper with a plunger feeds an annular nozzle; the tray turns under it so the dough ring is extruded around the full circle. */
export const depositor: StationDef = {
  id: 'donut-depositor',
  label: 'Depositor',
  footprint: [110, 120],
  height: 150,
  duration: 1.5,
  spaceDuration: 0.3,
  outputStage: 'ring',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const x of [-24, 24]) group.add(beam(looks, [x, 36, FLOOR], [x, 36, MOUNT + 40], 6, 'paint'));
    const bridge = housing(looks, 60, 22, 8, 'paint', 2);
    bridge.position.set(0, 36, MOUNT + 38);
    const hopper = lathe(looks, [[0, 0], [5, 0], [20, 30], [20, 52], [0, 52]], 'steel');
    hopper.position.set(DON_R, 36, NOZZLE_Z + 8);
    const nozzle = lathe(looks, [[1.5, 0], [4, 0], [4, 8], [1.5, 8]], 'copper', 20);
    nozzle.position.set(DON_R, 0, NOZZLE_Z);
    const feed = beam(looks, [DON_R, 36, NOZZLE_Z + 10], [DON_R, 0, NOZZLE_Z + 8], 5, 'steel');
    group.add(bridge, hopper, nozzle, feed);
    const plunger = piston(looks, { body: 7, rod: 3.4, len: 40, stroke: 30, role: 'steel' });
    plunger.group.position.set(DON_R, 36, MOUNT);
    group.add(plunger.group);
    const dial = gauge(looks, 5);
    dial.group.position.set(-24, 24, MOUNT - 20);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(48, -42, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(24, 30, MOUNT + 46);
    group.add(dial.group, ctl.group, beacon.group);

    let ext = 0;
    let on: boolean | null = null;
    return {
      begin(job) { if (!job.isSpace) ctx.audio.play('press-thump', { x: ctx.origin[0] }); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const ring = donutVisual('ring', t).ring;
        ext = ease(ext, live ? ss(0.1, 1, t) : 0, dt, 20);
        plunger.set(ext);
        if (job) product?.shape('ring', t);
        // The tray turns so the freshly drawn end of the ring stays under the nozzle.
        if (product) product.root.rotation.z = live && t < 1 ? -ring * Math.PI * 2 : 0;
        if (live && ring > 0.01 && ring < 1) {
          ctx.particles.emit('crumb', { pos: world(ctx, DON_R, 0, NOZZLE_Z - 2), count: 1, vel: [0, 0, -6], spread: 0.8, floor: world(ctx, 0, 0, 10)[2] });
        }
        dial.set(0.4 + 0.4 * ext);
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
