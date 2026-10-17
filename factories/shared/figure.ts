import * as THREE from 'three';
import type { Looks } from '../../engine/looks';
import { box, column, disposeTree, housing, lathe } from './parts';

export interface Figure {
  /** Feet on z = 0 (standing), facing +x, about 43 tall. The caller moves and turns this group. */
  group: THREE.Group;
  /** `walk` = gait phase (rad), 0 = standing straight; `arm` = 0..1 raises the right arm forward and up; `seated` = hips at 18, thighs forward, shins down. No allocation. */
  pose(walk: number, arm: number, seated?: boolean): void;
  dispose(): void;
}

const HIP_Z = 20;
const SHOULDER_Z = 33;
const THIGH = 9;
const SHIN = 11;          // knee to sole (boot included)
const SEAT_DROP = -2;     // hips 20 -> 18 when seated
const SWING = 0.5;        // leg and arm swing amplitude (rad)
const FOLD = 1.2;         // peak knee fold (rad) is FOLD / 2
const RAISE = 2.2;        // right arm lift at arm = 1 (rad)
const WHEEL_REACH = -0.9; // seated: both hands forward-down to the wheel

/**
 * A low-poly worker: boots, trousers, hi-vis vest with a reflective band, bare head under a hard hat with a visor,
 * arms with hands. Pivots (named for tests and callers): hip-l/r, knee-l/r, shoulder-l/r; meshes head, boot-l/r, hand-l/r.
 * Parts: paint-accent hat, copper vest, steel band, paint clothes, rubber boots, sand skin.
 */
export function figure(looks: Looks): Figure {
  const group = new THREE.Group();
  const body = new THREE.Group(); // bobs / sits; the outer group stays exactly where the caller put it
  group.add(body);
  const put = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.position.set(x, y, z); return o; };
  const named = <T extends THREE.Object3D>(o: T, name: string): T => { o.name = name; return o; };

  // legs: thigh on the hip pivot, shin and boot on the knee pivot (a straight leg when both are 0)
  const hips: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  const boots: THREE.Object3D[] = [];
  for (const [s, n] of [[1, 'l'], [-1, 'r']] as const) {
    const hip = named(put(new THREE.Group(), 0, s * 2.8, HIP_Z), `hip-${n}`);
    const knee = named(put(new THREE.Group(), 0, 0, -THIGH), `knee-${n}`);
    hip.add(put(box(looks, 5, 5, THIGH, 'paint'), 0, 0, -THIGH), knee);
    // the ankle pivot is counter-rotated each pose so the sole stays flat; the toe sits 1.2 ahead of the shin
    const ankle = put(new THREE.Group(), 0, 0, -SHIN);
    ankle.add(named(put(housing(looks, 8, 5.4, 3.5, 'rubber', 1), 1.2, 0, 0), `boot-${n}`));
    knee.add(put(box(looks, 5, 5, SHIN - 2.5, 'paint'), 0, 0, -(SHIN - 2.5)), ankle);
    boots.push(ankle);
    body.add(hip);
    hips.push(hip);
    knees.push(knee);
  }

  // torso, hi-vis vest with its reflective band, neck, head, hard hat
  body.add(put(housing(looks, 7, 11.6, 3, 'paint', 1), 0, 0, HIP_Z - 2.5)); // pelvis: sits on the seat when seated
  body.add(put(housing(looks, 7, 12, 15, 'paint', 1.5), 0, 0, 19));
  body.add(put(housing(looks, 7.8, 12.8, 11, 'copper', 1.5), 0, 0, 22));
  body.add(put(box(looks, 8.1, 13.1, 1.1, 'steel'), 0, 0, 26.5));
  body.add(put(column(looks, 1.6, 2.6, 'sand', 8), 0, 0, 33.6));
  body.add(named(put(looks.part(new THREE.SphereGeometry(4.5, 16, 12), 'sand'), 0.3, 0, 38), 'head'));
  const R = 4.8;
  const dome = Array.from({ length: 6 }, (_, k): [number, number] => [R * Math.cos((k * Math.PI) / 10), R * Math.sin((k * Math.PI) / 10)]);
  body.add(put(lathe(looks, dome, 'paint-accent', 20), 0.3, 0, 38.8));
  body.add(put(column(looks, 6.2, 0.8, 'paint-accent', 20), 0.3, 0, 38.6));
  body.add(put(box(looks, 3, 7, 0.8, 'paint-accent'), 6.9, 0, 38.6)); // visor

  // arms: sleeve on the shoulder pivot, bare hand at its end
  const shoulders: THREE.Group[] = [];
  for (const [s, n] of [[1, 'l'], [-1, 'r']] as const) {
    const sh = named(put(new THREE.Group(), 0, s * 8, SHOULDER_Z), `shoulder-${n}`);
    sh.add(
      put(box(looks, 4, 4, 13, 'paint'), 0, 0, -13),
      named(put(looks.part(new THREE.SphereGeometry(2.2, 10, 8), 'sand'), 0, 0, -14.4), `hand-${n}`),
    );
    body.add(sh);
    shoulders.push(sh);
  }

  const fig: Figure = {
    group,
    pose(walk, arm, seated = false) {
      const s = Math.sin(walk);
      const c = Math.cos(walk);
      // walking: the body dips as the legs spread, so the planted foot stays on the floor (a bob, not a hover)
      body.position.z = seated ? SEAT_DROP : -HIP_Z * (1 - Math.cos(SWING * s));
      if (seated) {
        hips[0].rotation.y = hips[1].rotation.y = -Math.PI / 2;
        knees[0].rotation.y = knees[1].rotation.y = Math.PI / 2;
        shoulders[0].rotation.y = shoulders[1].rotation.y = WHEEL_REACH;
      } else {
        hips[0].rotation.y = SWING * s;
        hips[1].rotation.y = -SWING * s;
        // the knee folds only while the swinging leg is still behind the hip (so its foot clears the floor); straight at walk = 0
        knees[0].rotation.y = FOLD * Math.max(0, -c) * Math.max(0, s);
        knees[1].rotation.y = FOLD * Math.max(0, c) * Math.max(0, -s);
        shoulders[0].rotation.y = -SWING * s;
        shoulders[1].rotation.y = SWING * s;
      }
      shoulders[1].rotation.y -= arm * RAISE;
      for (let i = 0; i < 2; i++) boots[i].rotation.y = -(hips[i].rotation.y + knees[i].rotation.y); // soles stay flat
    },
    dispose() { disposeTree(group); },
  };
  fig.pose(0, 0);
  return fig;
}
