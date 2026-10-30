import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, box, column, housing } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { mugVisual } from '../visual';
import { controls } from './kit';
import { HANDLE_Z, PUCK_T } from '../product';

const TIP0 = 19.5 + 12;   // pusher face when the handle has not moved in yet (handle outer edge + slide)

/**
 * Station 4: handle attacher. A magazine rack of pulled handles on the back side feeds a chute; a pneumatic pusher
 * presses the handle onto the slip-wet mug while a pair of holding pads clamps the other side.
 */
export const handler: StationDef = {
  id: 'mug-handler',
  label: 'Handle attacher',
  footprint: [150, 120],
  height: 80,
  duration: 1.6,
  spaceDuration: 0.3,
  outputStage: 'handled',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    // Pneumatic pusher on the +x side: cylinder body, rod, shoe.
    const body = housing(looks, 34, 16, 18, 'paint', 2);
    body.position.set(76, 0, 3);
    const rod = column(looks, 2.6, 60, 'steel', 10);
    rod.rotation.y = Math.PI / 2;
    const shoe = housing(looks, 3, 12, 12, 'paint-accent', 1);
    const post = beam(looks, [76, 0, FLOOR], [76, 0, 3], 14, 'paint');
    group.add(body, rod, shoe, post);
    // Holding pads on -x.
    for (const y of [-7, 7]) {
      const pad = column(looks, 3, 6, 'rubber', 12);
      pad.rotation.y = -Math.PI / 2;
      pad.position.set(-13, y, (HANDLE_Z + PUCK_T));
      group.add(pad, beam(looks, [-16, y, (HANDLE_Z + PUCK_T)], [-48, y, (HANDLE_Z + PUCK_T)], 3.5, 'steel'));
    }
    group.add(housing(looks, 8, 22, 18, 'paint', 2).translateX(-52).translateZ(3));
    // Magazine: rack with a stack of handles waiting, chute to the pusher.
    group.add(beam(looks, [48, 40, FLOOR], [48, 40, 30], 5, 'paint'), beam(looks, [24, 40, FLOOR], [24, 40, 30], 5, 'paint'));
    group.add(box(looks, 34, 14, 3, 'paint').translateX(36).translateY(40).translateZ(30));
    for (let i = 0; i < 4; i++) {
      const h = looks.part(new THREE.TorusGeometry(5, 1.4, 8, 16, Math.PI).rotateZ(-Math.PI / 2), 'sand', false);
      h.position.set(28 + i * 5, 40, 40);
      h.rotation.x = Math.PI / 2;
      group.add(h);
    }
    group.add(beam(looks, [40, 40, 34], [34, 12, 22], 3, 'steel'));
    const tick = controls(ctx, group, [76, 0, 20], 1);

    const shots = oneShots();
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const tt = ss(0, 1, t);
        const pushing = live ? mugVisual('handled', tt).handle : 0;
        const tip = live ? TIP0 - 12 * pushing : TIP0 + 14;
        shoe.position.set(tip + 1.5, 0, (HANDLE_Z + PUCK_T));
        rod.position.set(tip + 3, 0, (HANDLE_Z + PUCK_T));
        if (live && t >= 0.55 && shots.once('press')) {
          ctx.audio.play('press-thump', { x: ctx.origin[0] });
          ctx.particles.emit('crumb', { pos: world(ctx, 14, 0, 14), count: 4, vel: [6, 0, 8], spread: 4, floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('handled', tt);
        tick(live);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
