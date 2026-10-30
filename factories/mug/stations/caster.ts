import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, flange, housing, lathe, pipe } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { controls } from './kit';

const SPOUT_Z = 56;
const OPEN = 30;     // each mould half slides this far out

/**
 * Station 3: slip-casting bench. A feed spout pours slip, two plaster mould halves on clamp rams close around the
 * foot, the plaster draws water from the slip so a wall builds up, and the surplus drains away.
 */
export const caster: StationDef = {
  id: 'mug-caster',
  label: 'Slip casting',
  footprint: [150, 120],
  height: 110,
  duration: 2.2,
  spaceDuration: 0.3,
  outputStage: 'cast',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    // Mould halves (plaster ring, open to the top) on clamp rams.
    const halves = [0, 1].map((i) => {
      const s = i === 0 ? 1 : -1;
      const g = new THREE.Group();
      g.add(lathe(looks, [[13.5, 0], [21, 0], [21, 11], [13.5, 11], [13.5, 0]], 'concrete', 20, [i * Math.PI, Math.PI]));
      const ram = column(looks, 2.6, 46, 'steel', 10);
      ram.rotation.y = s * Math.PI / 2;
      ram.position.set(s * 21, 0, 5.5);
      g.add(ram);
      const cyl = housing(looks, 22, 14, 14, 'paint', 2);
      cyl.position.set(s * 78, 0, -2);
      group.add(cyl);
      return { g, s };
    });
    for (const h of halves) group.add(h.g);
    // Feed: C-frame, pipe and spout over the tub.
    group.add(beam(looks, [0, 44, FLOOR], [0, 44, SPOUT_Z + 18], 7, 'paint'));
    group.add(pipe(looks, [[0, 44, SPOUT_Z + 18], [0, 10, SPOUT_Z + 18], [0, 0, SPOUT_Z + 8]], 3, 'steel'));
    const nozzle = column(looks, 3.5, 6, 'copper', 12);
    nozzle.position.z = SPOUT_Z;
    const valve = flange(looks, 6, 6);
    valve.position.set(0, 26, SPOUT_Z + 18);
    const stream = column(looks, 1.6, 1, 'sand', 10);
    stream.visible = false;
    group.add(nozzle, valve, stream);
    const tick = controls(ctx, group, [0, 44, SPOUT_Z + 24], 1);

    const shots = oneShots();
    let open = 1;
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('filler-pour', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const pouring = live && t > 0.05 && t < 0.4;
        stream.visible = pouring;
        if (pouring) {
          const surf = 14;
          stream.position.z = surf;
          stream.scale.set(1, 1, Math.max(0.01, SPOUT_Z - surf));
          ctx.particles.emit('liquid', { pos: world(ctx, 0, 0, surf + 2), count: 1, vel: [0, 0, 10], spread: 3, floor: world(ctx, 0, 0, 0)[2] });
        }
        const shut = live && t > 0.45 && t < 0.92;
        if (shut && shots.once('clamp')) ctx.audio.play('mould-clamp', { x: ctx.origin[0] });
        open = ease(open, shut ? 0 : 1, dt, 12);
        for (const h of halves) h.g.position.x = h.s * OPEN * open;
        if (live && t > 0.6 && t < 0.85) ctx.particles.emit('droplet', { pos: world(ctx, 0, 10, 8), count: 1, vel: [0, 6, 4], spread: 2, floor: world(ctx, 0, 0, 0)[2] });
        if (job) product?.shape('cast', ss(0, 1, t));
        tick(live);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
