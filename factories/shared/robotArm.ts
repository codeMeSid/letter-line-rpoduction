import * as THREE from 'three';
import type { Looks } from '../../engine/looks';
import type { Vec3 } from '../../engine/types';
import { solveArm, type ArmDims, type ArmPose } from './ik';
import { beam, column, disposeTree, flange, housing } from './parts';

export const ARM: ArmDims = { shoulderZ: 60, upper: 100, fore: 95 };
/** Wrist pivot → gripper tip, pointing straight down. */
export const WRIST = 26;

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Industrial 6-axis-looking arm (yaw, shoulder, elbow, wrist pitch kept so the gripper points down,
 * wrist roll cosmetic). Local frame: base on the floor at (0,0,0), z up.
 * Hierarchy: group → base → yawG(rot z) → shoulderG(z=shoulderZ, rot y = -shoulder) → upper link along +x
 *   → elbowG(x=upper, rot y = +elbow) → fore link along +x → wristG(x=fore, rot y = π/2 + shoulder - elbow)
 *   → gripper along +x (length WRIST) → tip (Object3D at x=WRIST).
 */
export class RobotArm {
  readonly group = new THREE.Group();
  readonly tip = new THREE.Object3D();
  private yawG = new THREE.Group();
  private shoulderG = new THREE.Group();
  private elbowG = new THREE.Group();
  private wristG = new THREE.Group();
  private fingers: THREE.Mesh[] = [];
  private p: ArmPose = { yaw: 0, shoulder: 0.9, elbow: 1.6, reach: true };

  constructor(looks: Looks, private d: ArmDims = ARM) {
    const base = housing(looks, 40, 40, 12, 'paint-accent', 3);
    const turret = column(looks, 12, d.shoulderZ - 12, 'paint-accent', 24);
    turret.position.z = 12;
    const collar = flange(looks, 22, 8, 'steel'); // bolted turret ring on the base
    collar.position.z = 12;
    this.group.add(base, collar, this.yawG);
    this.yawG.add(turret, this.shoulderG);
    this.shoulderG.position.z = d.shoulderZ;
    const upperLink = housing(looks, d.upper, 14, 14, 'paint-accent', 4);
    upperLink.position.set(d.upper / 2, 0, -7);
    const motor = column(looks, 9, 22, 'steel', 20);
    motor.rotation.x = Math.PI / 2;
    motor.position.set(0, -11, 0);
    // Cable conduit riding along the top of each link.
    const conduit = beam(looks, [12, 5, 9.5], [d.upper - 12, 5, 9.5], 3, 'steel');
    this.shoulderG.add(upperLink, motor, conduit, this.elbowG);
    this.elbowG.position.x = d.upper;
    const foreLink = housing(looks, d.fore, 11, 11, 'paint-accent', 3.5);
    foreLink.position.set(d.fore / 2, 0, -5.5);
    const elbowMotor = column(looks, 7, 18, 'steel', 20);
    elbowMotor.rotation.x = Math.PI / 2;
    elbowMotor.position.set(0, -9, 0);
    const foreConduit = beam(looks, [10, 4, 8], [d.fore - 8, 4, 8], 2.5, 'steel');
    this.elbowG.add(foreLink, elbowMotor, foreConduit, this.wristG);
    this.wristG.position.x = d.fore;
    const wrist = housing(looks, WRIST - 8, 9, 9, 'steel', 2);
    wrist.position.set((WRIST - 8) / 2, 0, -4.5);
    const wristMotor = column(looks, 6, 12, 'steel', 16); // wrist roll drive (cosmetic)
    wristMotor.rotation.x = Math.PI / 2;
    wristMotor.position.set(0, -6, 0);
    this.wristG.add(wrist, wristMotor, this.tip);
    for (const s of [-1, 1]) {
      const f = housing(looks, 8, 2, 7, 'rubber', 0.5);
      f.position.set(WRIST - 4, s * 4, -3.5);
      this.fingers.push(f);
      this.wristG.add(f);
    }
    this.tip.position.x = WRIST;
    this.applyPose();
  }

  pose(): ArmPose { return this.p; }

  /** Damp joints toward the IK solution that puts the gripper tip at `tip` (arm-local). False if out of reach. */
  reach(tip: Vec3, dt: number, rate = 8): boolean {
    const goal = solveArm([tip[0], tip[1], tip[2] + WRIST], this.d);
    const a = 1 - Math.exp(-rate * dt);
    this.p = {
      yaw: this.p.yaw + wrapPi(goal.yaw - this.p.yaw) * a,
      shoulder: this.p.shoulder + (goal.shoulder - this.p.shoulder) * a,
      elbow: this.p.elbow + (goal.elbow - this.p.elbow) * a,
      reach: goal.reach,
    };
    this.applyPose();
    return goal.reach;
  }

  /** 0 = open, 1 = closed. */
  grip(closed: number): void {
    const s = 4 - 2.5 * Math.min(1, Math.max(0, closed));
    this.fingers[0].position.y = -s;
    this.fingers[1].position.y = s;
  }

  /** Dispose every geometry and detach from the scene. */
  dispose(): void {
    disposeTree(this.group);
  }

  private applyPose(): void {
    this.yawG.rotation.z = this.p.yaw;
    this.shoulderG.rotation.y = -this.p.shoulder;
    this.elbowG.rotation.y = this.p.elbow;
    this.wristG.rotation.y = Math.PI / 2 + this.p.shoulder - this.p.elbow;
  }
}
