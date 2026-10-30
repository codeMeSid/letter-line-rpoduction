import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { DON_TOP } from '../product';
import { beam, column, gauge, housing, lamp, lathe, panel, pipe } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';

const VAT_Y = 54;       // oil vat centre, beside the belt
const OIL_Z = 12;       // oil surface
const TRAVEL_Z = 28;    // carried height
const DIP_Z = 3;        // product root height while frying (ring centre at the oil surface)
const RAIL_Z = 90;

/** Station 5: deep fryer. A hanger on an overhead rail lifts the tray, swings it over the oil vat, lowers the dough ring into the oil to fry and brings it back. */
export const fryer: StationDef = {
  id: 'donut-fryer',
  label: 'Fryer',
  footprint: [130, 170],
  height: 130,
  duration: 2.2,
  spaceDuration: 0.3,
  outputStage: 'fried',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    // Round open pot: the tray (r 22) is lowered inside it.
    const vat = lathe(looks, [[0, 0], [27, 0], [27, OIL_Z + 2 - FLOOR], [25.5, OIL_Z + 2 - FLOOR], [25.5, 22], [0, 22]], 'paint');
    vat.position.set(0, VAT_Y, FLOOR);
    const surface = looks.part(new THREE.CylinderGeometry(25.5, 25.5, 0.4, 32).rotateX(Math.PI / 2), 'liquid', false);
    surface.position.set(0, VAT_Y, OIL_Z + 1.6);
    group.add(vat, surface);
    for (const s of [-1, 1]) group.add(pipe(looks, [[s * 28, VAT_Y - 10, FLOOR + 14], [s * 38, VAT_Y - 10, FLOOR + 14], [s * 38, VAT_Y + 10, FLOOR + 14], [s * 28, VAT_Y + 10, FLOOR + 14]], 2, 'copper'));
    // Overhead rail along y with a carriage and a hanger rod that follows the tray.
    for (const x of [-30, 30]) {
      const post = column(looks, 3, RAIL_Z - FLOOR, 'steel');
      post.position.set(x, 80, FLOOR);
      group.add(post, beam(looks, [x, 80, RAIL_Z], [x, -20, RAIL_Z], 4, 'paint'));
    }
    const carriage = housing(looks, 66, 14, 8, 'paint-accent', 2);
    carriage.position.z = RAIL_Z;
    const hanger = column(looks, 1.6, 1, 'steel', 8);
    group.add(carriage, hanger);
    const dial = gauge(looks, 5);
    dial.group.position.set(-40, 80, 40);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(48, -42, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(34, 80, OIL_Z + 20);
    group.add(dial.group, ctl.group, beacon.group);

    const shots = oneShots();
    let on: boolean | null = null;
    return {
      begin(job) { shots.reset(); if (!job.isSpace) ctx.audio.play('kiln-roar', { x: ctx.origin[0] }); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const lift = live ? TRAVEL_Z * ss(0, 0.12, t) * (1 - ss(0.92, 1, t)) : 0;
        const dip = live ? (TRAVEL_Z - DIP_Z) * (ss(0.4, 0.5, t) - ss(0.7, 0.8, t)) : 0;
        const y = live ? VAT_Y * (ss(0.12, 0.4, t) - ss(0.8, 0.95, t)) : 0;
        const z = lift - dip;
        if (product) { product.root.position.y += y; product.root.position.z += z; }
        carriage.position.y = y;
        const top = z + DON_TOP;
        hanger.position.set(0, y, top);
        hanger.scale.z = Math.max(1, RAIL_Z - top);
        hanger.visible = live;
        const frying = live && t > 0.45 && t < 0.78;
        if (frying) {
          ctx.particles.emit('foam', { pos: world(ctx, 0, VAT_Y, OIL_Z + 2), count: 2, vel: [0, 0, 8], spread: 8, floor: world(ctx, 0, VAT_Y, OIL_Z)[2] });
          ctx.particles.emit('steam', { pos: world(ctx, 0, VAT_Y, OIL_Z + 4), count: 1, vel: [0, 0, 12], spread: 6, floor: world(ctx, 0, VAT_Y, OIL_Z)[2] });
        }
        if (job) product?.shape('fried', t);
        dial.set(0.7 + 0.1 * Math.sin(ctx.now() / 300));
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
            destroy() { teardown(group); },
    };
  },
};
