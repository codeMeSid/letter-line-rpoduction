import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, gauge, housing, lamp, lathe, panel, pipe, piston } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';

const HEAD_Z = 56;       // crown seat height (puck 3 + neck top 52 + 1)
const MOUNT = 112;       // rod end at rest; the chuck bottom hangs 16 below it
const STROKE = 39;       // at full stroke the chuck bottom sits on the crown seat (z 57)

/**
 * Station 10: crown capper. A vibratory cap bowl feeds crowns down a chute to a pneumatic crimping head with a cone chuck
 * that picks a crown, descends over the neck and crimps it.
 */
export const capper: StationDef = {
  id: 'bottle-capper',
  label: 'Capper',
  footprint: [110, 120],
  height: 150,
  duration: 1.4,
  spaceDuration: 0.3,
  outputStage: 'capped',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    // Cap hopper (vibratory bowl) with a spiral track and a chute to the pick position.
    const bowl = lathe(looks, [[0, 0], [16, 0], [20, 14], [22, 30], [0, 30]], 'steel');
    bowl.position.set(-38, 52, FLOOR);
    const bowlBase = housing(looks, 36, 36, 12, 'paint', 3);
    bowlBase.position.set(-38, 52, FLOOR);
    const track = lathe(looks, [[12, 4], [21, 18], [21, 20], [12, 6]], 'copper', 20);
    track.position.set(-38, 52, FLOOR + 12);
    group.add(bowl, bowlBase, track, pipe(looks, [[-38, 52, 14], [-34, 36, 38], [-26, 10, 70], [-14, 0, HEAD_Z + 6]], 2.4, 'steel'));
    // Portal + pneumatic cylinder carrying the crimping head.
    for (const x of [-18, 18]) group.add(beam(looks, [x, 30, FLOOR], [x, 30, MOUNT + 12], 6, 'paint'));
    const bridge = housing(looks, 54, 22, 8, 'paint', 2);
    bridge.position.set(0, 24, MOUNT + 12);
    group.add(bridge, beam(looks, [0, 30, MOUNT + 8], [0, 0, MOUNT + 8], 6, 'paint'));
    const press = piston(looks, { body: 8, rod: 3.4, len: STROKE + 6, stroke: STROKE, role: 'steel' });
    press.group.position.set(0, 0, MOUNT);
    group.add(press.group);
    const chuck = lathe(looks, [[0, 0], [6.5, 0], [6.5, -8], [4.6, -12], [0, -12]], 'copper', 18);
    const collar = housing(looks, 14, 14, 6, 'steel', 1.5);
    collar.position.z = -3;
    press.rodEnd.add(collar, chuck);
    chuck.position.z = -4;

    // Held crown (visible while the head carries it), slides along the chute then rides the head.
    const crown = looks.part(new THREE.CylinderGeometry(4.8, 5.3, 1.8, 18).rotateX(Math.PI / 2), 'copper');
    crown.visible = false;
    group.add(crown);
    const dial = gauge(looks, 5);
    dial.group.position.set(24, 28, MOUNT - 14);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(48, -42, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(-18, 30, MOUNT + 20);
    group.add(dial.group, ctl.group, beacon.group);

    const shots = oneShots();
    let ext = 0;
    let shake = 0;
    let on: boolean | null = null;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const now = ctx.now();
        // Head: parked up, drops over the neck at 0.35, crimps, returns.
        const target = live ? ss(0.3, 0.55, t) * (1 - ss(0.75, 0.95, t)) : 0;
        ext = ease(ext, target, dt, 28);
        press.set(ext);
        const headZ = MOUNT - STROKE * ext;           // rod end height
        // The crown rides the chute to the pick point, then the head carries it down onto the neck.
        crown.visible = live && t > 0.02 && t < 0.58;
        crown.position.set(-14 * (1 - ss(0.05, 0.3, t)), 0, Math.min(HEAD_Z + 6, headZ - 17));
        shake = live ? Math.sin(now * 0.08) * 0.6 : 0;
        bowl.position.x = -38 + shake * 0.3;
        if (live && t >= 0.55 && shots.once('crimp')) {
          ctx.audio.play('cap-press', { x: ctx.origin[0] });
          ctx.particles.emit('spark', { pos: world(ctx, 0, 0, 54), count: 4, spread: 6, vel: [0, 0, 6], floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('capped', t >= 0.58 ? 1 : 0); // the held crown seats exactly where the product crown starts
        ctl.update(now);
        dial.set(0.45 + 0.4 * ext);
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
