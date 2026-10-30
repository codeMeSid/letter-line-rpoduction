import type { StationDef } from '../../../engine/station';
import { beam, gauge, gear, housing, legs, lathe, panel, pipe } from '../../shared/parts';
import { FLOOR, floorZ, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';

const XS = [-48, -16, 16, 48];
const SY = 58;            // silo row sits behind the belt
const BODY_Z = 66;        // cone tip
const COLLECTOR_Z = 56;
const SPOUT_Z = 44;
const TUB_TOP = 19;       // puck 3 + tub 16

/**
 * Station 1: four batch silos (sand, soda ash, limestone, cullet) on legs with slide gates; a collector screw
 * conveyor runs to a spout over the tub. Each gate opens in turn and its layer drops into the tub.
 */
export const silos: StationDef = {
  id: 'bottle-silos',
  label: 'Batch silos',
  footprint: [150, 130],
  height: 140,
  duration: 2.0,
  spaceDuration: 0.3,
  outputStage: 'batch',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    const handwheels = XS.map((x, i) => {
      const silo = lathe(looks, [[3, BODY_Z], [14, BODY_Z + 18], [14, BODY_Z + 64], [10, BODY_Z + 72], [0, BODY_Z + 74]], i % 2 ? 'steel' : 'paint');
      silo.position.set(x, SY, 0);
      const band = lathe(looks, [[14, BODY_Z + 40], [14.8, BODY_Z + 40], [14.8, BODY_Z + 46], [14, BODY_Z + 46]], 'paint-accent');
      band.position.set(x, SY, 0);
      const frame = legs(looks, 24, 24, BODY_Z - FLOOR - 10, 3);
      frame.position.set(x, SY, FLOOR);
      const ring = lathe(looks, [[10, BODY_Z + 72], [11, BODY_Z + 72], [11, BODY_Z + 75], [10, BODY_Z + 75]], 'steel');
      ring.position.set(x, SY, 0);
      const gate = housing(looks, 10, 10, 5, 'steel', 1);
      gate.position.set(x, SY, BODY_Z - 6);
      const wheel = gear(looks, 4.5, 10, 1.5, 'paint-accent');
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, SY - 7, BODY_Z - 3.5);
      group.add(silo, band, frame, ring, gate, wheel);
      return wheel;
    });
    // ladder-side catwalk rail and collector
    group.add(beam(looks, [-62, SY - 20, BODY_Z + 40], [62, SY - 20, BODY_Z + 40], 2));
    group.add(beam(looks, [-48, SY, COLLECTOR_Z], [48, SY, COLLECTOR_Z], 7, 'paint'));
    group.add(pipe(looks, [[0, SY, COLLECTOR_Z], [0, 24, COLLECTOR_Z - 4], [0, 0, SPOUT_Z + 6], [0, 0, SPOUT_Z]], 4, 'steel'));
    const dial = gauge(looks, 5);
    dial.group.position.set(-66, SY - 15, BODY_Z + 20);
    const ctl = panel(looks, 22, 34);
    ctl.group.position.set(70, -40, FLOOR);
    group.add(dial.group, ctl.group);

    const shots = oneShots();
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('pour-sand', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const open = live ? Math.min(3, Math.floor(t * 4)) : -1;
        handwheels.forEach((w, i) => { w.rotation.z += i === open ? dt * 6 : 0; });
        if (live && t < 0.97) {
          ctx.particles.emit('sand', { pos: world(ctx, XS[open], SY, BODY_Z - 8), count: 2, vel: [0, 0, -20], spread: 1.5, floor: world(ctx, 0, 0, COLLECTOR_Z + 4)[2] });
          ctx.particles.emit('sand', { pos: world(ctx, 0, 0, SPOUT_Z - 2), count: 2, vel: [0, 0, -30], spread: 1.2, floor: world(ctx, 0, 0, TUB_TOP - 6 * (1 - t))[2] });
        }
        if (job) product?.shape('batch', t);
        dial.set(0.5 + 0.2 * Math.sin(ctx.now() / 600));
        ctl.update(ctx.now());
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
