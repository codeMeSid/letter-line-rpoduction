import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, housing, lamp, lathe, panel, pipe } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';

const MOUTH_Y = 42;      // doghouse opening faces the belt
const MOUTH_Z = 34;
const TIP = -1.95;       // tub tilt about x (negative leans toward +y)

/**
 * Station 3: glass melting tank furnace with a doghouse charger, regenerator chambers, a stack, steel buckstays and
 * burner ports. The tub is lifted to the doghouse, tips its batch into the mouth, and comes back empty.
 */
export const furnace: StationDef = {
  id: 'bottle-furnace',
  label: 'Glass furnace',
  footprint: [190, 150],
  height: 140,
  duration: 2.2,
  spaceDuration: 0.3,
  outputStage: 'melted',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    // Melting tank (refractory block with a crown) and doghouse.
    const tank = housing(looks, 150, 58, 62 - FLOOR, 'concrete', 3);
    tank.position.set(0, MOUTH_Y + 29 + 6, FLOOR);
    const doghouse = housing(looks, 46, 24, 40, 'concrete', 2);
    doghouse.position.set(0, MOUTH_Y + 6, MOUTH_Z - 20);
    const mouth = housing(looks, 28, 2, 18, 'molten', 0.5);
    mouth.position.set(0, MOUTH_Y - 6.2, MOUTH_Z - 12);
    const lintel = housing(looks, 36, 5, 4, 'steel', 1);
    lintel.position.set(0, MOUTH_Y - 6.5, MOUTH_Z + 6);
    const hood = housing(looks, 34, 18, 4, 'steel', 1);
    hood.position.set(0, MOUTH_Y - 1, MOUTH_Z + 6.5);
    group.add(tank, doghouse, mouth, lintel, hood);
    // Buckstays: vertical steel straps with a top tie beam.
    for (let x = -68; x <= 68; x += 17) group.add(beam(looks, [x, MOUTH_Y + 6, FLOOR], [x, MOUTH_Y + 6, 64], 4, 'steel'));
    group.add(beam(looks, [-72, MOUTH_Y - 24, 66], [72, MOUTH_Y - 24, 66], 3, 'paint-accent'));

    // Regenerator chambers (checker brick stacks) either side, flue to the stack.
    const regen = (x: number) => {
      const r = housing(looks, 30, 50, 90 - FLOOR, 'concrete', 2);
      r.position.set(x, MOUTH_Y + 82, FLOOR);
      const cap = housing(looks, 34, 54, 3, 'steel', 1);
      cap.position.set(x, MOUTH_Y + 82, 90);
      group.add(r, cap);
    };
    regen(-50);
    regen(50);
    const stack = column(looks, 9, 128 - FLOOR, 'concrete', 20);
    stack.position.set(0, MOUTH_Y + 112, FLOOR);
    const stackRim = column(looks, 10.5, 4, 'steel', 20);
    stackRim.position.set(0, MOUTH_Y + 112, 124);
    group.add(stack, stackRim, pipe(looks, [[-50, MOUTH_Y + 82, 86], [-30, MOUTH_Y + 112, 70], [0, MOUTH_Y + 112, 60]], 5, 'steel'), pipe(looks, [[50, MOUTH_Y + 82, 86], [30, MOUTH_Y + 112, 70], [0, MOUTH_Y + 112, 60]], 5, 'steel'));

    // Burner ports along the front: a gas pipe, a burner block and a flickering flame cone each.
    const flames: THREE.Mesh[] = [];
    for (const x of [-56, -36, 36, 56]) {
      const block = housing(looks, 10, 8, 12, 'steel', 1);
      block.position.set(x, MOUTH_Y + 2, 44);
      const flame = lathe(looks, [[0, 0], [3.5, 1], [2, 8], [0, 15]], 'molten', 10);
      flame.position.set(x, MOUTH_Y - 1.5, 50);
      flame.rotation.x = -Math.PI / 2; // points +y, into the port
      flames.push(flame);
      group.add(block, flame, pipe(looks, [[x, MOUTH_Y + 2, 50], [x, MOUTH_Y - 12, 62], [x, MOUTH_Y - 26, 62]], 1.5, 'copper'));
    }
    group.add(pipe(looks, [[-60, MOUTH_Y - 26, 62], [60, MOUTH_Y - 26, 62]], 2.5, 'copper'));
    const ctl = panel(looks, 22, 34);
    ctl.group.position.set(-80, -30, FLOOR);
    const beacon = lamp(looks, 2.6);
    beacon.group.position.set(64, MOUTH_Y - 24, 72);
    group.add(ctl.group, beacon.group);

    const roar = ctx.audio.loop('furnace-roar', { x: ctx.origin[0], gain: 0.35 });
    const shots = oneShots();
    let on: boolean | null = null;
    return {
      begin() { shots.reset(); },
      update(_dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const now = ctx.now();
        // The product root is carried to the mouth, tilted, then lowered again.
        const carry = live ? ss(0.12, 0.4, t) * (1 - ss(0.78, 0.98, t)) : 0;
        const tilt = live ? ss(0.4, 0.62, t) * (1 - ss(0.68, 0.8, t)) : 0;
        if (job && product) {
          product.root.position.y += 22 * carry;
          product.root.position.z += 14 * carry;
          product.root.rotation.x = TIP * tilt;
          product.root.position.z += 18 * tilt;
          product.root.position.y += 4 * tilt;
          product.shape('melted', ss(0.45, 0.72, t));
        }
        if (live && t > 0.45 && t < 0.78) {
          if (shots.once('rumble')) ctx.audio.play('furnace-roar', { x: ctx.origin[0] });
          ctx.particles.emit('ember', { pos: world(ctx, 0, MOUTH_Y - 4, MOUTH_Z + 4), count: 2, vel: [0, -10, 20], spread: 4, floor: world(ctx, 0, 0, 0)[2] });
          ctx.particles.emit('glow', { pos: world(ctx, 0, MOUTH_Y - 4, MOUTH_Z), count: 1, spread: 5, floor: world(ctx, 0, 0, 0)[2] });
        }
        // Ambient: flame flicker.
        flames.forEach((f, i) => {
          const k = 0.85 + 0.15 * Math.sin(now * 0.02 + i * 2.1) + 0.05 * Math.sin(now * 0.053 + i);
          f.scale.set(k, k, (live ? 1.25 : 1) * k);
        });
        ctl.update(now);
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() {
        roar.stop();
        teardown(group);
      },
    };
  },
};
