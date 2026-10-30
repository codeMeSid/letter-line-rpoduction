import type * as THREE from 'three';
import type { StationCtx } from '../../../engine/station';
import { gauge, lamp, panel } from '../../shared/parts';
import { FLOOR } from '../../shared/stationKit';

/** Control cabinet (flickering screen), pressure dial and beacon lamp on a station. `tick` every frame. */
export function panelKit(ctx: StationCtx, group: THREE.Group, at: [number, number], top = 60) {
  const { looks } = ctx;
  const ctl = panel(looks, 20, 32);
  ctl.group.position.set(at[0], at[1], FLOOR);
  const dial = gauge(looks, 5);
  dial.group.position.set(at[0] - 14, at[1] + 4, top);
  const beacon = lamp(looks, 2.5);
  beacon.group.position.set(at[0] + 14, at[1] + 4, top);
  group.add(ctl.group, dial.group, beacon.group);
  let on: boolean | null = null;
  return {
    tick(live: boolean, level: number) {
      ctl.update(ctx.now());
      dial.set(0.4 + 0.45 * level);
      if (live !== on) { on = live; beacon.set(live); }
    },
  };
}
