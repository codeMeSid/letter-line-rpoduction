import type { StationDef } from '../../../engine/station';
import { donutVisual } from '../visual';
import { beam, gauge, lamp, lathe, panel, pipe, piston } from '../../shared/parts';
import { FLOOR, ease, ss, stationBase, teardown, world } from '../../shared/stationKit';

const RAIL_Z = 80;
const STROKE = 36;     // tip bottom is 24 below the rod end; at full stroke it sits 20 over the belt, just above the glaze crown

/** Station 9: chocolate letter piper. A gantry (x carriage on a y beam) with an icing cartridge draws the typed character across the top of the donut. */
export const piper: StationDef = {
  id: 'donut-piper',
  label: 'Icing piper',
  footprint: [110, 120],
  height: 110,
  duration: 1.5,
  spaceDuration: 0.3,
  outputStage: 'lettered',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const x of [-40, 40]) {
      group.add(beam(looks, [x, 34, FLOOR], [x, 34, RAIL_Z], 5, 'paint'));
      group.add(beam(looks, [x, 34, RAIL_Z], [x, -28, RAIL_Z], 4, 'steel'));
    }
    const bridge = beam(looks, [-40, 0, RAIL_Z + 3], [40, 0, RAIL_Z + 3], 5, 'paint');
    // Head: z-slide piston under the carriage, cartridge + nozzle tip on its rod end.
    const head = piston(looks, { body: 6, rod: 2.6, len: 40, stroke: STROKE, role: 'steel' });
    head.group.position.z = RAIL_Z;
    const cartridge = lathe(looks, [[0, -16], [3.5, -16], [3.5, 0], [0, 0]], 'steel', 16);
    const tip = lathe(looks, [[0, -24], [0.9, -24], [3, -16], [0, -16]], 'copper', 12);
    head.rodEnd.add(cartridge, tip);
    group.add(bridge, head.group);
    group.add(pipe(looks, [[40, 34, RAIL_Z - 14], [40, 20, RAIL_Z - 14], [0, 10, RAIL_Z - 6]], 1.6, 'copper'));
    const dial = gauge(looks, 5);
    dial.group.position.set(-24, 34, 70);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(48, -42, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(40, 34, RAIL_Z + 10);
    group.add(dial.group, ctl.group, beacon.group);

    let px = 0;
    let py = 0;
    let pz = 0;
    let on: boolean | null = null;
    return {
      begin(job) { if (!job.isSpace) ctx.audio.play('coder-tick', { x: ctx.origin[0] }); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const ice = donutVisual('lettered', t).icing;
        // Nozzle sweeps left to right along the piped letter while it zig-zags across the glyph height.
        px = ease(px, live ? -8 + 16 * ice : 0, dt, 24);
        py = ease(py, live ? 5 * Math.sin(ice * 14) : 0, dt, 24);
        pz = ease(pz, live ? ss(0.0, 0.12, t) * (1 - ss(0.9, 1, t)) : 0, dt, 20);
        head.group.position.set(px, py, RAIL_Z);
        head.set(pz);
        if (live && t > 0.1 && t < 0.92) ctx.particles.emit('droplet', { pos: world(ctx, px, py, 21), count: 1, vel: [0, 0, -4], spread: 0.6, floor: world(ctx, 0, 0, 14)[2] });
        if (job) product?.shape('lettered', t);
        dial.set(0.5 + 0.3 * pz);
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
