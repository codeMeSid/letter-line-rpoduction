import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, gauge, gear, housing, lamp, lathe, panel, piston } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown } from '../../shared/stationKit';

const CONTACT_Y = 10.4;  // label surface at the pressure pad
const LABEL_Z = 24;      // pad height on the straight body wall
const REEL = [0, 62, 60] as const;
const TOP_Z = 110;

/**
 * Station 11: wrap-around labeler. A label reel and glue roller feed a strip to a pressure pad behind the bottle; a centring bell
 * from above spins the bottle one full turn so the label wraps by angle 0 → 2π, then the glyph shows on the front.
 */
export const labeler: StationDef = {
  id: 'bottle-labeler',
  label: 'Labeler',
  footprint: [110, 130],
  height: 140,
  duration: 2.0,
  spaceDuration: 0.3,
  outputStage: 'labelled',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    // Label web: reel, guide rollers, glue roller, strip to the pad.
    const plate = housing(looks, 70, 8, 100, 'paint', 2);
    plate.position.set(0, 86, FLOOR + 12);
    group.add(plate);
    const reel = new THREE.Group();
    reel.position.set(REEL[0], REEL[1] + 20, REEL[2]);
    const roll = lathe(looks, [[3, -5], [20, -5], [20, 5], [3, 5]], 'sand');
    roll.rotation.x = Math.PI / 2;
    const spoke = gear(looks, 8, 6, 2, 'steel');
    spoke.rotation.x = Math.PI / 2;
    spoke.position.y = -6;
    reel.add(roll, spoke);
    group.add(reel);
    const guides = [[-16, 70, 44], [14, 54, 34], [0, 30, 28]].map(([x, y, z]) => {
      const g = column(looks, 2.6, 14, 'steel', 12);
      g.rotation.x = Math.PI / 2;
      g.position.set(x, y + 7, z);
      group.add(g);
      return g;
    });
    const glue = lathe(looks, [[0, -6], [3.8, -6], [3.8, 6], [0, 6]], 'copper', 14);
    glue.rotation.x = Math.PI / 2;
    glue.position.set(14, 51, 34);
    group.add(glue);
    group.add(beam(looks, [0, 70, 44], [0, 30, 28], 4, 'sand'), beam(looks, [0, 30, 28], [0, CONTACT_Y + 1, LABEL_Z], 4, 'sand'));

    // Pressure pad on a pneumatic cylinder behind the bottle: group rotated so the rod points at −y.
    const padCyl = piston(looks, { body: 5, rod: 2.2, len: 24, stroke: 14, role: 'steel' });
    padCyl.group.rotation.x = -Math.PI / 2;
    padCyl.group.position.set(0, CONTACT_Y + 17, LABEL_Z); // rod end at rest here, at full stroke the pad sits on the label
    padCyl.rodEnd.add(lathe(looks, [[0, -3], [4, -3], [4, 0], [0, 0]], 'rubber', 12));
    group.add(padCyl.group);

    // Centring bell from above (spins with the bottle), column and arm.
    const post = beam(looks, [0, 40, FLOOR], [0, 40, TOP_Z + 10], 7, 'paint');
    const arm = housing(looks, 14, 46, 8, 'paint', 2);
    arm.position.set(0, 20, TOP_Z + 6);
    const bell = new THREE.Group();
    bell.position.set(0, 0, TOP_Z);
    bell.add(lathe(looks, [[0, 0], [7, -2], [8, -6], [0, -6]], 'steel', 16), column(looks, 2.5, 8, 'steel', 8));
    group.add(post, arm, bell);
    const dial = gauge(looks, 5);
    dial.group.position.set(-32, 44, 90);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(-50, -42, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(24, 40, TOP_Z + 8);
    group.add(dial.group, ctl.group, beacon.group);

    const shots = oneShots();
    let down = 0;
    let padK = 0;
    let spin = 0;
    let on: boolean | null = null;
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('labeler-wrap', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const f = Math.min(1, Math.max(0, (t - 0.12) / 0.8));
        down = ease(down, live ? ss(0.02, 0.12, t) * (1 - ss(0.94, 1, t)) : 0, dt, 18);
        bell.position.z = TOP_Z - (TOP_Z - 59) * down;
        padK = ease(padK, live && t > 0.08 && t < 0.96 ? 1 : 0, dt, 20);
        padCyl.set(padK);
        spin = live ? -2 * Math.PI * f : ease(spin, 0, dt, 6);
        bell.rotation.z = spin;
        reel.rotation.y = -f * 6 * (live ? 1 : 0);
        if (live) glue.rotation.y += dt * 9;
        guides.forEach((g) => { g.rotation.y = f * 10; });
        if (job && product) {
          product.root.rotation.z = -2 * Math.PI * f;
          product.shape('labelled', f);
        }
        dial.set(0.5 + 0.2 * Math.sin(ctx.now() / 700));
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
