import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, gauge, housing, lamp, lathe, panel } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';

const R_ARCH = 62;
const ARCH_Z = 4;       // arch springs from just above the belt edge

/**
 * Station 7: inspection arch. Four cameras on a steel arch, a swept glow scan ring and a flash; a diverter paddle
 * kicks a defective bottle toward the reject chute (verdict = `job.defect`).
 */
export const inspection: StationDef = {
  id: 'bottle-inspection',
  label: 'Inspection',
  footprint: [100, 110],
  height: 110,
  duration: 1.2,
  spaceDuration: 0.3,
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    const arch = (r: number, tube: number, role: 'paint' | 'glow') => {
      const g = new THREE.TorusGeometry(r, tube, 8, 36, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
      return looks.part(g, role, role !== 'glow');
    };
    for (const dx of [-8, 8]) {
      const a = arch(R_ARCH, 3, 'paint');
      a.position.set(dx, 0, ARCH_Z);
      group.add(a);
    }
    for (const y of [-R_ARCH, R_ARCH]) group.add(beam(looks, [0, y, FLOOR], [0, y, ARCH_Z], 8, 'paint'));
    group.add(beam(looks, [-8, 0, ARCH_Z + R_ARCH], [8, 0, ARCH_Z + R_ARCH], 5, 'steel'));
    // Cameras on the arch pointing at the product axis, with glass lenses.
    const cams: THREE.Group[] = [];
    for (const deg of [50, 80, 100, 130]) {
      const a = (deg * Math.PI) / 180;
      const cam = new THREE.Group();
      const y = Math.cos(a) * R_ARCH;
      const z = ARCH_Z + Math.sin(a) * R_ARCH;
      cam.position.set(0, y, z);
      cam.rotation.x = a + Math.PI / 2; // local +z (lens) points to the centre
      cam.add(housing(looks, 10, 8, 10, 'rubber', 1));
      const lens = lathe(looks, [[0, 10], [3.4, 10], [3.4, 13], [2.4, 14], [0, 14]], 'glass', 14);
      cam.add(lens);
      cams.push(cam);
      group.add(cam);
    }
    const scan = arch(R_ARCH - 6, 0.6, 'glow');
    scan.visible = false;
    group.add(scan);
    // Diverter paddle on the front rail, pivoting about its rear end.
    const pivot = new THREE.Group();
    pivot.position.set(20, 30, 10);
    const paddle = housing(looks, 3, 34, 16, 'paint-accent', 1);
    paddle.position.y = -17;
    pivot.add(paddle);
    group.add(pivot);
    const kickCyl = beam(looks, [20, 52, 8], [20, 30, 8], 5, 'steel');
    group.add(kickCyl);
    const dial = gauge(looks, 5);
    dial.group.position.set(-34, 42, 40);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(-54, -44, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(0, -R_ARCH, ARCH_Z + 8);
    group.add(dial.group, ctl.group, beacon.group);

    const shots = oneShots();
    let swing = 0;
    let on: boolean | null = null;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        scan.visible = live && t > 0.15 && t < 0.7;
        if (scan.visible) scan.position.x = -10 + 20 * ss(0.15, 0.7, t);
        if (live && t >= 0.4 && shots.once('flash')) {
          ctx.audio.play('camera-flash', { x: ctx.origin[0] });
          for (const c of cams) ctx.particles.emit('flash', { pos: world(ctx, 0, c.position.y * 0.6, c.position.z * 0.7), count: 1, floor: world(ctx, 0, 0, 0)[2] });
        }
        const kick = !!job?.defect && t > 0.75;
        if (kick && shots.once('kick')) ctx.audio.play('reject-kick', { x: ctx.origin[0] });
        swing = ease(swing, kick ? 1 : 0, dt, 14);
        pivot.rotation.z = -0.9 * swing;
        if (job) product?.shape('bottle', 1);
        ctl.update(ctx.now());
        dial.set(0.5 + 0.05 * Math.sin(ctx.now() / 400));
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: (job) => (job.defect ? 'reject' : 'pass'),
      destroy() { teardown(group); },
    };
  },
};
