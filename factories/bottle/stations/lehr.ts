import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, gear, housing, lamp, panel, pipe } from '../../shared/parts';
import { FLOOR, oneShots, stationBase, teardown, world } from '../../shared/stationKit';

const HALF_X = 82;      // tunnel half length
const ROOF_Z = 82;
const FRONT_Y = -36;

/**
 * Station 6: annealing lehr. A long tunnel over the belt with a steel frame, louvred roof panels, three roof fans, heater
 * pipework, glowing element strips seen through a glass front window; the glass cools slowly from hot to clear.
 */
export const lehr: StationDef = {
  id: 'bottle-lehr',
  label: 'Annealing lehr',
  footprint: [210, 110],
  height: 120,
  duration: 2.2,
  spaceDuration: 0.3,
  outputStage: 'bottle',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    const roof = housing(looks, 2 * HALF_X, 80, 10, 'paint', 2);
    roof.position.set(0, 4, ROOF_Z);
    const back = housing(looks, 2 * HALF_X, 6, ROOF_Z - FLOOR, 'steel', 1);
    back.position.set(0, 40, FLOOR);
    group.add(roof, back);
    // End bulkheads with a tunnel mouth (posts either side of the belt).
    for (const x of [-HALF_X, HALF_X]) {
      for (const y of [-FRONT_Y + 0, FRONT_Y]) group.add(beam(looks, [x, y, FLOOR], [x, y, ROOF_Z], 8, 'paint'));
      const lintel = housing(looks, 8, 80, ROOF_Z - 66, 'paint', 1);
      lintel.position.set(x, 4, 66);
      group.add(lintel);
    }
    // Glass window along the front, steel mullions.
    const window = housing(looks, 2 * HALF_X - 16, 1.5, 60, 'glass', 0.3);
    window.position.set(0, FRONT_Y, 6);
    group.add(window);
    for (let x = -HALF_X + 14; x <= HALF_X - 14; x += 28) group.add(beam(looks, [x, FRONT_Y, 4], [x, FRONT_Y, 68], 3, 'steel'));
    group.add(beam(looks, [-HALF_X, FRONT_Y, 4], [HALF_X, FRONT_Y, 4], 3, 'steel'));
    group.add(beam(looks, [-HALF_X, FRONT_Y, 68], [HALF_X, FRONT_Y, 68], 3, 'steel'));

    // Heater element strips under the roof: glowing, dimmed by temperature along the tunnel.
    const strips: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const strip = housing(looks, 20, 4, 2, 'molten', 0.4);
      strip.position.set(-HALF_X + 18 + i * 29, -20, 62);
      strip.scale.y = 1;
      strips.push(strip);
      const rear = strip.clone();
      rear.position.y = 28;
      group.add(strip, rear);
    }
    // Roof louvres, fans and exhaust.
    for (let x = -HALF_X + 12; x <= HALF_X - 30; x += 6) {
      const slat = housing(looks, 2.2, 30, 3, 'steel', 0.3);
      slat.position.set(x, -26, ROOF_Z + 10);
      slat.rotation.y = 0.5;
      group.add(slat);
    }
    const fans = [-50, 0, 50].map((x) => {
      const shroud = column(looks, 15, 8, 'paint', 24);
      shroud.position.set(x, 24, ROOF_Z + 10);
      const rotor = gear(looks, 12, 6, 2, 'steel');
      rotor.position.set(x, 24, ROOF_Z + 12);
      group.add(shroud, rotor);
      return rotor;
    });
    group.add(pipe(looks, [[-HALF_X + 6, 52, ROOF_Z + 10], [HALF_X - 6, 52, ROOF_Z + 10]], 4, 'copper'));
    for (const x of [-50, 0, 50]) group.add(pipe(looks, [[x, 24, ROOF_Z + 18], [x, 52, ROOF_Z + 24]], 3, 'steel'));
    const ctl = panel(looks, 22, 34);
    ctl.group.position.set(HALF_X + 24, -40, FLOOR);
    const beacon = lamp(looks, 2.6);
    beacon.group.position.set(-HALF_X + 6, 36, ROOF_Z + 14);
    group.add(ctl.group, beacon.group);

    const hum = ctx.audio.loop('lehr-hum', { x: ctx.origin[0], gain: 0.25 });
    const shots = oneShots();
    let spin = 0;
    let on: boolean | null = null;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        spin += dt * (live ? 12 : 3);
        fans.forEach((f) => { f.rotation.z = spin; });
        if (job) product?.shape('bottle', t);
        strips.forEach((s, i) => { s.scale.z = live ? 1 + 0.2 * Math.sin(ctx.now() * 0.006 + i) : 1; });
        if (live && t > 0.85 && shots.once('vent')) ctx.audio.play('hiss', { x: ctx.origin[0] });
        if (live && t > 0.85) ctx.particles.emit('steam', { pos: world(ctx, HALF_X - 6, 0, 30), count: 1, vel: [10, 0, 14], spread: 4, floor: world(ctx, 0, 0, 0)[2] });
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() {
        hum.stop();
        teardown(group);
      },
    };
  },
};
