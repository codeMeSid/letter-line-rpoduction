import type { StationDef } from '../../../engine/station';
import { box, gear, housing, pipe } from '../../shared/parts';
import { FLOOR, oneShots, stationBase, teardown, world } from '../../shared/stationKit';
import { panelKit } from './panelKit';

/** Station 4: cooling tunnel. Open-ended hood over the car, three roof fans blowing chilled air through louvres; the hot orange plastic fades to cold. */
export const chiller: StationDef = {
  id: 'car-chiller',
  label: 'Cooling tunnel',
  footprint: [100, 110],
  height: 100,
  duration: 1.8,
  spaceDuration: 0.3,
  outputStage: 'cooled',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const roof = housing(looks, 74, 40, 6, 'paint', 2);
    roof.position.z = 34;
    group.add(roof);
    for (const y of [-19, 19]) {
      const wall = box(looks, 74, 2, 38 - FLOOR - 22 + 22, 'glass');
      wall.position.set(0, y, 0);
      group.add(wall);
      for (const x of [-34, 34]) { const post = box(looks, 4, 4, 38 - FLOOR, 'paint'); post.position.set(x, y, FLOOR); group.add(post); }
    }
    const fans = [-22, 0, 22].map((x) => {
      const f = gear(looks, 7, 6, 2, 'steel');
      f.position.set(x, 0, 41);
      const cowl = housing(looks, 18, 18, 4, 'steel', 2);
      cowl.position.set(x, 0, 37);
      group.add(f, cowl);
      return f;
    });
    // Chilled-air supply duct along the back.
    group.add(pipe(looks, [[-44, 44, FLOOR + 8], [-44, 44, 52], [40, 44, 52], [40, 44, 44]], 4, 'steel'));
    const ui = panelKit(ctx, group, [48, -44], 60);

    const shots = oneShots();
    let spin = 0;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        spin += dt * (live ? 18 : 2);
        fans.forEach((f) => { f.rotation.z = spin; });
        if (live && shots.once('air')) ctx.audio.play('air-blow', { x: ctx.origin[0] });
        if (live && t < 0.9) ctx.particles.emit('steam', { pos: world(ctx, (Math.random() - 0.5) * 40, 0, 30), count: 1, vel: [0, 0, -10], spread: 3, floor: world(ctx, 0, 0, 4)[2] });
        if (job) product?.shape('cooled', t);
        ui.tick(live, live ? 1 - t : 0);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
