import * as THREE from 'three';
import type { Plot } from '../engine/campus';
import type { Looks } from '../engine/looks';
import { cube } from '../factories/shared/building';
import { disposeTree, housing, merged } from '../factories/shared/parts';

const MARGIN = 300;           // slab beyond the first/last plot
const Y0 = -1000;
const Y1 = 600;
const ROAD_Y = -760;          // front road centre line
const ROAD_W = 120;
const TOP = -0.5;             // road surface (the slab top is -1, the factory floors 0)

/** The campus ground: a concrete slab under every plot, a front road and a cross road in each ROAD gap, with lane dashes. */
export function buildGround(looks: Looks, plots: readonly Plot[]): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group();
  const gx0 = plots[0].x0 - MARGIN;
  const gx1 = plots[plots.length - 1].x1 + MARGIN;

  const slab = housing(looks, gx1 - gx0, Y1 - Y0, 2, 'concrete', 2);
  slab.position.set((gx0 + gx1) / 2, (Y0 + Y1) / 2, -3);
  slab.castShadow = false;
  group.add(slab);

  const roads = [cube(gx0, gx1, ROAD_Y - ROAD_W / 2, ROAD_Y + ROAD_W / 2, -1, TOP)];
  const dashes: THREE.BufferGeometry[] = [];
  for (let x = gx0 + 35; x < gx1; x += 70) dashes.push(cube(x - 15, x + 15, ROAD_Y - 1.5, ROAD_Y + 1.5, -0.8, -0.2));
  // cross roads fill each gap between neighbouring plots, from the front road to the back of the slab
  for (let i = 0; i + 1 < plots.length; i++) {
    const a = plots[i].x1;
    const b = plots[i + 1].x0;
    const c = (a + b) / 2;
    roads.push(cube(a, b, ROAD_Y, Y1, -1, TOP));
    for (let y = ROAD_Y + 50; y < Y1; y += 70) dashes.push(cube(c - 1.5, c + 1.5, y - 15, y + 15, -0.8, -0.2));
  }
  for (const [gs, role] of [[roads, 'rubber'], [dashes, 'paint-accent']] as const) {
    const m = merged(looks, gs, role);
    m.castShadow = false;
    group.add(m);
  }
  return { group, dispose: () => disposeTree(group) };
}
