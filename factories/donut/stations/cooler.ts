import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, box, gauge, housing, lamp, lathe, panel } from '../../shared/parts';
import { FLOOR, stationBase, teardown, world } from '../../shared/stationKit';

const HOOD_Z = 74;

/** Station 6: cooling tunnel. A hood with two big axial fans blowing down on the fried ring; warm steam is carried off. */
export const cooler: StationDef = {
  id: 'donut-cooler',
  label: 'Cooling tunnel',
  footprint: [110, 120],
  height: 100,
  duration: 1.4,
  spaceDuration: 0.3,
  outputStage: 'cooled',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const hood = housing(looks, 100, 62, 10, 'paint', 3);
    hood.position.set(0, 0, HOOD_Z);
    group.add(hood);
    for (const x of [-46, 46]) for (const y of [-28, 28]) group.add(beam(looks, [x, y, FLOOR], [x, y, HOOD_Z], 5, 'steel'));
    const fans = [-22, 22].map((x) => {
      const shroud = lathe(looks, [[19, 0], [22, 0], [22, 10], [19, 10]], 'steel', 32);
      shroud.position.set(x, 0, HOOD_Z - 10);
      const rotor = new THREE.Group();
      rotor.position.set(x, 0, HOOD_Z - 6);
      for (let i = 0; i < 5; i++) {
        const blade = box(looks, 16, 6, 0.8, 'steel');
        blade.position.x = 10;
        const arm = new THREE.Group();
        arm.rotation.z = (i / 5) * Math.PI * 2;
        arm.add(blade);
        blade.rotation.x = 0.35;
        rotor.add(arm);
      }
      rotor.add(lathe(looks, [[0, -2], [3.5, -2], [3.5, 2], [0, 2]], 'copper', 16));
      group.add(shroud, rotor);
      return rotor;
    });
    const dial = gauge(looks, 5);
    dial.group.position.set(30, 36, HOOD_Z + 2);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(48, -42, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(-40, 34, HOOD_Z + 14);
    group.add(dial.group, ctl.group, beacon.group);

    let spin = 0;
    let on: boolean | null = null;
    return {
      begin(job) { if (!job.isSpace) ctx.audio.play('motor-whir', { x: ctx.origin[0] }); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        spin += dt * (live ? 25 : 2);
        for (const f of fans) f.rotation.z = spin;
        if (live && t > 0.05 && t < 0.95) ctx.particles.emit('steam', { pos: world(ctx, 0, 0, 22), count: 1, vel: [4, 0, 6], spread: 4, floor: world(ctx, 0, 0, 0)[2] });
        if (job) product?.shape('cooled', t);
        dial.set(0.7 - 0.4 * t);
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
