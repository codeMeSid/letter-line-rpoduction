import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, flange, lathe, pipe } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { controls } from './controls';

const TANK_Z = 92;
const NOZZLE_Z = 60;
const BOWL_Y = 60;
const BOWL_R = 24;

/**
 * Station 10: can filler. A rotary bowl of beverage on a central column with a ring of filling valves and a pipe to the fixed
 * nozzle over the open can; the stream pours, the level climbs and a foam head builds.
 */
export const filler: StationDef = {
  id: 'can-filler',
  label: 'Can filler',
  footprint: [120, 160],
  height: 140,
  duration: 2.2,
  spaceDuration: 0.3,
  outputStage: 'filled',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const carousel = new THREE.Group();
    carousel.position.set(0, BOWL_Y, 0);
    const trunk = column(looks, 11, TANK_Z - FLOOR, 'steel', 20);
    trunk.position.z = FLOOR;
    const bowl = lathe(looks, [[0, 38], [BOWL_R + 4, 38], [BOWL_R + 4, 58], [BOWL_R, 62], [BOWL_R, TANK_Z], [0, TANK_Z]], 'paint-accent');
    const liquid = lathe(looks, [[0, TANK_Z], [BOWL_R - 1, TANK_Z], [BOWL_R - 1, TANK_Z + 4], [0, TANK_Z + 4]], 'liquid');
    const rim = lathe(looks, [[BOWL_R, TANK_Z], [BOWL_R + 2, TANK_Z], [BOWL_R + 2, TANK_Z + 5], [BOWL_R - 1, TANK_Z + 5]], 'steel');
    carousel.add(trunk, bowl, liquid, rim);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const valve = column(looks, 2.4, 22, 'steel', 10);
      valve.position.set(Math.cos(a) * (BOWL_R + 1), Math.sin(a) * (BOWL_R + 1), 38);
      const head = column(looks, 3.4, 4, 'copper', 10);
      head.position.copy(valve.position).setZ(60);
      carousel.add(valve, head);
    }
    const star = lathe(looks, [[BOWL_R + 4, 8], [BOWL_R + 14, 8], [BOWL_R + 14, 12], [BOWL_R + 4, 12]], 'paint', 8);
    carousel.add(star);
    group.add(carousel);
    // Fixed filling station: nozzle over the can, supply pipe from the bowl, pillar and cross-beam.
    const nozzle = column(looks, 4, 6, 'copper', 12);
    nozzle.position.set(0, 0, NOZZLE_Z + 4);
    const nozzleFlange = flange(looks, 7, 6);
    nozzleFlange.position.set(0, 0, NOZZLE_Z + 14);
    group.add(nozzle, nozzleFlange, pipe(looks, [[0, BOWL_Y, TANK_Z + 4], [0, 40, TANK_Z + 14], [0, 8, NOZZLE_Z + 24], [0, 0, NOZZLE_Z + 14]], 3, 'steel'));
    group.add(beam(looks, [34, 0, FLOOR], [34, 0, NOZZLE_Z + 30], 6, 'paint'), beam(looks, [34, 0, NOZZLE_Z + 28], [0, 0, NOZZLE_Z + 28], 5, 'paint'));
    const stream = column(looks, 1.6, 1, 'liquid', 10);
    stream.visible = false;
    group.add(stream);
    const ui = controls(ctx, [-56, -56], [-36, -30, 70], [34, 0, NOZZLE_Z + 36]);

    const shots = oneShots();
    let spin = 0;
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('filler-pour', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        spin += dt * (live ? 1.2 : 0.15);
        carousel.rotation.z = spin;
        const pouring = live && t > 0.1 && t < 0.92;
        stream.visible = pouring;
        if (pouring) {
          // Stream from the nozzle to the rising surface (liquid z 2.5 + 40 * level), foam spills at the end.
          const surf = 2.5 + 38 * ss(0, 0.9, (t - 0.1) / 0.8) + 3;
          const wob = 1 + 0.1 * Math.sin(ctx.now() * 0.03);
          stream.position.set(0, 0, surf);
          stream.scale.set(wob, wob, Math.max(0.01, NOZZLE_Z + 2 - surf));
          ctx.particles.emit('liquid', { pos: world(ctx, 0, 0, surf + 2), count: 1, vel: [0, 0, 12], spread: 3, floor: world(ctx, 0, 0, 0)[2] });
          if (t > 0.6) ctx.particles.emit('foam', { pos: world(ctx, 0, 0, surf + 4), count: 1, vel: [0, 0, 8], spread: 4, floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('filled', ss(0.1, 0.95, t));
        liquid.position.z = -1.5 * Math.sin(ctx.now() / 700);
        ui.tick(live, 0.5 + 0.3 * Math.sin(ctx.now() / 900));
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
