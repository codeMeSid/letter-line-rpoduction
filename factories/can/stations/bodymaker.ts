import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { column, gear, housing, lathe } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { controls, portal } from './controls';

const PUNCH_L = 40;
const RING_Z = [22, 30, 38];
const OPEN = 14;      // each ring half slides this far out of the belt to let the cup in and the can out

/**
 * Station 4: bodymaker (draw and iron). A long punch carries the cup down through three ironing dies (split rings that
 * close around the line), thinning and stretching the wall until the tall can stands on the belt; a coolant manifold floods the dies.
 */
export const bodymaker: StationDef = {
  id: 'can-bodymaker',
  label: 'Bodymaker',
  footprint: [110, 130],
  height: 220,
  duration: 2.4,
  spaceDuration: 0.3,
  outputStage: 'body',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const press = portal(ctx, 118, PUNCH_L, 3, 9);
    const punch = column(looks, 9, PUNCH_L, 'copper', 28);
    punch.position.z = -PUNCH_L;
    press.ram.rodEnd.add(punch);
    // Split ironing dies: two half rings per level that close (y) round the can, driven by rods from the posts.
    const halves = [-1, 1].map((side) => {
      const g = new THREE.Group();
      for (const z of RING_Z) {
        const arc: [number, number] = side > 0 ? [Math.PI / 2, Math.PI] : [-Math.PI / 2, Math.PI];
        g.add(lathe(looks, [[12.6, z], [19, z], [19, z + 5], [12.6, z + 5]], z === RING_Z[1] ? 'copper' : 'steel', 28, arc));
      }
      group.add(g);
      return g;
    });
    const rods = [-1, 1].flatMap((side) => RING_Z.map((z) => {
      const r = column(looks, 1.8, 1, 'steel', 10);
      r.rotation.x = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      r.position.set(0, 33 * side, z + 2.5);
      group.add(r);
      return { r };
    }));
    // Coolant manifold and pump.
    const tank = housing(looks, 28, 22, 30, 'paint-accent', 3);
    tank.position.set(-34, -52, FLOOR);
    const pump = gear(looks, 9, 12, 4, 'steel');
    pump.rotation.x = Math.PI / 2;
    pump.position.set(-34, -40, FLOOR + 18);
    group.add(tank, pump);
    const ui = controls(ctx, [-50, 50], [-36, -34, 92], [36, -34, 214]);

    const shots = oneShots();
    let ext = 0;
    let closed = 0;
    let spin = 0;
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('motor-whir', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        closed = ease(closed, live ? ss(0.04, 0.16, t) * (1 - ss(0.82, 0.92, t)) : 0, dt, 18);
        const off = OPEN * (1 - closed);
        halves[0].position.y = -off;
        halves[1].position.y = off;
        for (const { r } of rods) r.scale.z = Math.max(0.5, 14 - off);
        ext = ease(ext, live ? ss(0.18, 0.8, t) * (1 - ss(0.86, 1, t)) : 0, dt, 26);
        press.ram.set(ext);
        spin += dt * (live ? 6 : 0.4);
        pump.rotation.z = spin;
        if (live && t >= 0.25 && shots.once('draw')) ctx.audio.play('press-thump', { x: ctx.origin[0] });
        if (live && t > 0.3 && t < 0.8) {
          ctx.particles.emit('water', { pos: world(ctx, 0, 14, 36), count: 1, vel: [0, -6, 2], spread: 2, floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('body', ss(0.18, 0.8, t));
        ui.tick(live, ext);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
