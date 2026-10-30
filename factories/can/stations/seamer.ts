import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { column, gauge, housing, lathe, pipe } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { controls, portal } from './controls';

const TOOL = 10;
const SEAT = 49.6;     // chuck bottom at full stroke = top of the seated lid
const ROLL_Z = -11.6;  // seaming roll centre under the chuck's rod end, at the flange height

/**
 * Station 11: double seamer. A lid drops from the magazine onto the open can; the chuck presses on it and two seaming rolls orbit the
 * rim, first rolling the lid hook into the flange and then ironing the seam flat.
 */
export const seamer: StationDef = {
  id: 'can-seamer',
  label: 'Double seamer',
  footprint: [110, 130],
  height: 160,
  duration: 1.8,
  spaceDuration: 0.3,
  outputStage: 'seamed',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const press = portal(ctx, 124, TOOL, SEAT);
    const spinner = new THREE.Group();
    const chuck = column(looks, 9.5, TOOL, 'steel', 24);
    chuck.position.z = -TOOL;
    const carrier = lathe(looks, [[0, 0], [20, 0], [20, 2], [0, 2]], 'paint-accent', 28);
    carrier.position.z = ROLL_Z + 6;
    spinner.add(chuck, carrier);
    const rolls = [0, Math.PI].map((a) => {
      const r = column(looks, 3, 10, 'copper', 14);
      r.position.z = ROLL_Z - 4;
      spinner.add(r);
      return { r, a };
    });
    press.ram.rodEnd.add(spinner);
    // Lid magazine: a tube of stacked ends with a chute to the pick-up point above the line.
    const tube = column(looks, 11, 40, 'steel', 20);
    tube.position.set(-40, 32, FLOOR);
    const stack = lathe(looks, [[0, 0], [10, 0], [10, 36], [0, 36]], 'paint', 20);
    stack.position.set(-40, 32, FLOOR + 40);
    const feeder = housing(looks, 28, 28, 22, 'paint-accent', 3);
    feeder.position.set(-40, 32, FLOOR);
    group.add(tube, stack, feeder, pipe(looks, [[-40, 32, 94], [-30, 24, 82], [-14, 8, 70], [-4, 0, 66]], 2.4, 'steel', 8));
    const dial = gauge(looks, 5);
    dial.group.position.set(30, -36, 100);
    group.add(dial.group);
    const ui = controls(ctx, [-52, -50], [-30, -38, 90], [34, -38, 168]);

    const shots = oneShots();
    let ext = 0;
    let spin = 0;
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('cap-press', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        ext = ease(ext, live ? ss(0.45, 0.6, t) * (1 - ss(0.86, 1, t)) : 0, dt, 28);
        press.ram.set(ext);
        const seaming = live && t > 0.6 && t < 0.85;
        spin += dt * (seaming ? 24 : 0.5);
        spinner.rotation.z = spin;
        const close = ss(0.6, 0.72, t) * (1 - ss(0.8, 0.86, t));
        for (const { r, a } of rolls) {
          const rr = 19 - 4.6 * (seaming ? close : 0);
          r.position.x = Math.cos(a) * rr;
          r.position.y = Math.sin(a) * rr;
        }
        if (seaming) ctx.particles.emit('spark', { pos: world(ctx, 0, 0, 50), count: 1, spread: 5, vel: [0, 0, 5], floor: world(ctx, 0, 0, 0)[2] });
        if (job) product?.shape('seamed', ss(0.15, 0.5, t));
        ui.tick(live, ext);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
