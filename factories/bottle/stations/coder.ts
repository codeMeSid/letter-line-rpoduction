import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, gauge, housing, lamp, lathe, panel, pipe } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';

const HEAD_Y = 52;
const CODE_Z = 40;       // batch-code line on the shoulder

/**
 * Station 12: laser coder. A laser tube on a stand with a scanning galvo head and a fume extractor; a red beam sweeps a dotted
 * line of spark points onto the bottle shoulder.
 */
export const coder: StationDef = {
  id: 'bottle-coder',
  label: 'Laser coder',
  footprint: [90, 120],
  height: 110,
  duration: 1.0,
  spaceDuration: 0.3,
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    const stand = housing(looks, 36, 30, 52 - FLOOR, 'paint', 2);
    stand.position.set(0, HEAD_Y + 10, FLOOR);
    const tube = lathe(looks, [[0, -26], [7, -26], [8, -20], [8, 20], [7, 26], [0, 26]], 'paint-accent', 18);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, HEAD_Y + 4, 66);
    const galvo = housing(looks, 16, 16, 14, 'steel', 2);
    galvo.position.set(0, HEAD_Y - 24, 60);
    const lens = lathe(looks, [[0, 0], [4.6, 0], [4.6, -4], [3, -6], [0, -6]], 'glass', 14);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, HEAD_Y - 32, CODE_Z + 16);
    const mirror = new THREE.Group();
    mirror.position.set(0, HEAD_Y - 24, CODE_Z + 16);
    mirror.add(housing(looks, 8, 2, 8, 'steel', 0.4));
    group.add(stand, tube, galvo, lens, mirror, beam(looks, [0, HEAD_Y - 16, 66], [0, HEAD_Y - 24, 66], 8, 'steel'));
    // Fume extractor: flexible hose to a hood beside the line.
    const hood = lathe(looks, [[2, 0], [9, 0], [9, 3], [2, 3]], 'steel', 14);
    hood.rotation.x = Math.PI / 2;
    hood.position.set(18, 14, CODE_Z);
    group.add(hood, pipe(looks, [[18, 14, CODE_Z], [30, 30, CODE_Z + 4], [34, 56, 30], [34, 70, FLOOR + 20]], 3.4, 'rubber'));
    const dial = gauge(looks, 5);
    dial.group.position.set(-26, HEAD_Y - 18, 30);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(-40, -40, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(18, HEAD_Y + 10, 56);
    group.add(dial.group, ctl.group, beacon.group);

    // The beam: a thin glowing cylinder along +y→−y, scaled to the distance to the spot.
    const ray = looks.part(new THREE.CylinderGeometry(0.35, 0.35, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5), 'glow', false);
    ray.visible = false;
    group.add(ray);

    const shots = oneShots();
    let on: boolean | null = null;
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('laser-zap', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        void dt;
        const lasing = live && t > 0.12 && t < 0.88;
        ray.visible = lasing;
        if (lasing) {
          // Sweep along x across the shoulder: a dotted line of 9 points, one every 1/9 of the sweep.
          const k = ss(0.12, 0.88, t);
          const x = -8 + 16 * k;
          const dots = Math.floor(k * 9);
          const sx = -8 + 16 * (dots / 9);
          const from = new THREE.Vector3(0, HEAD_Y - 24, CODE_Z + 16);
          const to = new THREE.Vector3(x, 7.2, CODE_Z);
          ray.position.copy(from);
          ray.lookAt(to);
          ray.scale.z = from.distanceTo(to);
          mirror.rotation.z = -x * 0.05;
          if (shots.once(`dot${dots}`)) ctx.particles.emit('spark', { pos: world(ctx, sx, 7.5, CODE_Z), count: 4, vel: [0, -14, 8], spread: 2, floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('labelled', 1);
        ctl.update(ctx.now());
        dial.set(0.5 + 0.1 * Math.sin(ctx.now() / 500));
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
