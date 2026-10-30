import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, gauge, housing, lamp, lathe, panel, piston } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';

const ORIFICE_Z = 92;    // underside of the orifice ring
const SHEAR_Z = 84;
const LAND_Z = 14;       // gob centre when sitting on the puck (belt top 0)
const FALL = [0.22, 0.4] as const;

/**
 * Station 4: gob feeder. A forehearth channel (glowing glass) from the furnace ends in an orifice bowl over the belt;
 * a plunger rams the gob out, two blades cut it and the gob falls onto the puck.
 */
export const gobShear: StationDef = {
  id: 'bottle-gobshear',
  label: 'Gob feeder & shear',
  footprint: [110, 130],
  height: 170,
  duration: 1.5,
  spaceDuration: 0.3,
  outputStage: 'gob',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    // Forehearth: refractory channel on a stand running from the back to the orifice, glowing glass in its trough.
    const stand = housing(looks, 40, 70, 106 - FLOOR, 'concrete', 2);
    stand.position.set(0, 52, FLOOR);
    const trough = housing(looks, 24, 78, 6, 'molten', 1);
    trough.position.set(0, 52, 106);
    const wall = housing(looks, 30, 80, 5, 'steel', 1);
    wall.position.set(0, 52, 112);
    const lid = housing(looks, 30, 60, 4, 'concrete', 1);
    lid.position.set(0, 56, 118);
    group.add(stand, trough, wall, lid);
    const bowl = lathe(looks, [[3.5, ORIFICE_Z], [5.5, ORIFICE_Z], [14, 106], [14, 112], [0, 112]], 'steel');
    const ring = lathe(looks, [[3.2, ORIFICE_Z - 4], [7, ORIFICE_Z - 4], [7, ORIFICE_Z], [3.2, ORIFICE_Z]], 'copper');
    group.add(bowl, ring);

    // Plunger ram above the bowl.
    for (const [x, y] of [[-16, -12], [16, -12]]) group.add(beam(looks, [x, y, FLOOR], [x, y, 156], 5, 'paint'));
    const headBeam = housing(looks, 52, 20, 8, 'paint', 2);
    headBeam.position.set(0, -12, 156);
    group.add(headBeam);
    const ram = piston(looks, { body: 7, rod: 2.6, len: 30, stroke: 24, role: 'steel' });
    ram.group.position.set(0, 0, 150);
    const plunger = lathe(looks, [[0, 0], [2.4, 0], [2.4, -22], [0, -26]], 'concrete', 12);
    ram.rodEnd.add(plunger);
    group.add(ram.group, beam(looks, [0, -12, 150], [0, 0, 150], 5, 'paint'));

    // Shear blades: two thin plates on horizontal cylinders, closing in y just under the orifice.
    const blades = [-1, 1].map((s) => {
      const bladeG = new THREE.Group();
      bladeG.position.set(0, s * 20, SHEAR_Z);
      bladeG.add(housing(looks, 24, 12, 1.5, 'steel', 0.3), beam(looks, [0, s * 6, -2], [0, s * 26, -2], 2.4, 'steel'));
      const cyl = column(looks, 3.5, 22, 'steel', 12);
      cyl.rotation.x = -s * Math.PI / 2; // lies along y, away from the belt
      cyl.position.set(0, s * 30, SHEAR_Z - 2);
      group.add(bladeG, cyl);
      return bladeG;
    });
    const dial = gauge(looks, 5);
    dial.group.position.set(24, -26, 110);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(-46, -36, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(-16, -12, 164);
    group.add(dial.group, ctl.group, beacon.group);

    // The falling gob (a glowing blob that shortens as it accelerates).
    const gob = looks.part(new THREE.SphereGeometry(6.5, 14, 10), 'molten', false);
    gob.visible = false;
    group.add(gob);

    const shots = oneShots();
    let ext = 0;
    let cut = 0;
    let on: boolean | null = null;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const now = ctx.now();
        ext = ease(ext, live ? Math.sin(Math.PI * Math.min(1, t / 0.3)) : 0, dt, 18);
        ram.set(ext);
        cut = ease(cut, live && t > 0.2 && t < 0.3 ? 1 : 0, dt, 25);
        blades.forEach((b, i) => { b.position.y = (i ? 1 : -1) * (20 - 14 * cut); });
        if (live && t >= 0.2 && shots.once('shear')) ctx.audio.play('gob-shear', { x: ctx.origin[0] });
        const falling = live && t >= FALL[0] && t < FALL[1];
        gob.visible = falling || (live && t >= 0.12 && t < FALL[0]);
        if (gob.visible) {
          const f = Math.min(1, Math.max(0, (t - FALL[0]) / (FALL[1] - FALL[0])));
          const z = ORIFICE_Z - 6 - (ORIFICE_Z - 6 - LAND_Z) * f * f;
          gob.position.set(0, 0, z);
          gob.scale.set(1, 1, 1 + 0.8 * f);
          if (falling) ctx.particles.emit('ember', { pos: world(ctx, 0, 0, z), count: 1, spread: 2, floor: world(ctx, 0, 0, 0)[2] });
        }
        if (live && t >= FALL[1] && shots.once('land')) ctx.particles.emit('glow', { pos: world(ctx, 0, 0, 12), count: 3, spread: 3, floor: world(ctx, 0, 0, 0)[2] });
        if (job) product?.shape('gob', t);
        dial.set(0.5 + 0.1 * Math.sin(now / 500));
        ctl.update(now);
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
