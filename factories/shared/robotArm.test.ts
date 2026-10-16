import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../../engine/looks';
import { RobotArm } from './robotArm';
import type { Vec3 } from '../../engine/types';

describe('RobotArm', () => {
  it('gripper tip reaches reachable targets (hierarchy signs match the IK)', () => {
    const arm = new RobotArm(new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' }));
    const targets: Vec3[] = [[120, 0, 40], [0, -100, 30], [-80, 60, 120], [60, 60, 10]];
    for (const t of targets) {
      for (let i = 0; i < 200; i++) arm.reach(t, 1 / 30, 30);
      arm.group.updateMatrixWorld(true);
      const p = arm.tip.getWorldPosition(new THREE.Vector3());
      expect(p.distanceTo(new THREE.Vector3(...t)), `${t}`).toBeLessThan(0.5);
    }
  });
  it('reports unreachable targets', () => {
    const arm = new RobotArm(new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' }));
    expect(arm.reach([900, 0, 0], 1 / 30)).toBe(false);
  });
  describe('hardware seating', () => {
    const arm = new RobotArm(new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' }));
    /** Box of a mesh in its parent's frame (a motor and its link share a parent, so pose and yaw drop out). */
    const local = (name: string) => {
      const m = arm.group.getObjectByName(name) as THREE.Mesh;
      expect(m, name).toBeDefined();
      m.updateMatrix();
      m.geometry.computeBoundingBox();
      return m.geometry.boundingBox!.clone().applyMatrix4(m.matrix);
    };

    it.each([['shoulder', 'upper'], ['elbow', 'fore'], ['wrist', 'wrist']])('%s motor sits flush on the -y face of its link', (joint, link) => {
      const face = local(`link-${link}`).min.y;
      const m = local(`motor-${joint}`);
      expect(m.max.y).toBeGreaterThanOrEqual(face - 0.01); // touching, not floating
      expect(m.max.y).toBeLessThanOrEqual(face + 0.01); // and not buried in the link
      expect(m.min.y).toBeLessThan(face - 10); // body extends outward
    });
    it.each([['upper', 'upper'], ['fore', 'fore']])('%s conduit sits on the top of its link', (c, link) => {
      const top = local(`link-${link}`).max.z;
      const b = local(`conduit-${c}`);
      expect(b.min.z).toBeGreaterThanOrEqual(top - 0.01);
      expect(b.min.z).toBeLessThanOrEqual(top + 0.01);
    });
  });
});
