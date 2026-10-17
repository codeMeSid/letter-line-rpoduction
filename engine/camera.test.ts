import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig, FOV, fitView, viewDir } from './camera';
import { FLIGHT_MS } from './campus';
import { LOOKS, type Vec3 } from './types';

const TAN = Math.tan((FOV * Math.PI) / 360);

const corners = (min: Vec3, max: Vec3) => {
  const out: THREE.Vector3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push(new THREE.Vector3(x, y, z));
  return out;
};

describe('viewDir', () => {
  it('is a unit vector from the -y side, and +x reads left→right', () => {
    for (const look of LOOKS) {
      const d = new THREE.Vector3(...viewDir(look));
      expect(d.length()).toBeCloseTo(1, 9);
      expect(d.y).toBeLessThan(0);
      const right = d.clone().negate().cross(new THREE.Vector3(0, 0, 1));
      expect(right.x).toBeGreaterThan(0);
    }
  });
  it('flat is true isometric', () => {
    const d = viewDir('flat');
    expect(Math.asin(d[2]) * (180 / Math.PI)).toBeCloseTo(35.264, 2);
  });
});

describe('fitView', () => {
  const min: Vec3 = [0, -300, 0];
  const max: Vec3 = [900, 0, 120];
  for (const ortho of [false, true]) {
    it(`keeps every corner on screen (${ortho ? 'ortho' : 'persp'})`, () => {
      const aspect = 16 / 9;
      const dir = new THREE.Vector3(...viewDir('realistic'));
      const { target, extent } = fitView(min, max, viewDir('realistic'), aspect, ortho);
      const t = new THREE.Vector3(...target);
      const cam = ortho
        ? new THREE.OrthographicCamera(-extent * aspect, extent * aspect, extent, -extent, -10000, 10000)
        : new THREE.PerspectiveCamera(FOV, aspect, 1, 20000);
      cam.up.set(0, 0, 1);
      cam.position.copy(t).addScaledVector(dir, ortho ? 3000 : extent);
      cam.lookAt(t);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      for (const c of corners(min, max)) {
        const p = c.clone().project(cam);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1.0001);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1.0001);
      }
    });
  }
});

describe('CameraRig', () => {
  it('follow mode converges on the newest job', () => {
    let newest: Vec3 = [500, -100, 22];
    const rig = new CameraRig({ overview: () => ({ min: [0, -300, 0], max: [900, 0, 120] }), newest: () => newest, busiest: () => null, followSpan: () => 400 });
    rig.resize(1280, 720, 1);
    rig.snap();
    rig.mode = 'follow';
    for (let i = 0; i < 300; i++) rig.update(1 / 60, i * 16);
    expect(rig.center().x).toBeCloseTo(500, 0);
    newest = [100, -100, 22];
    for (let i = 0; i < 300; i++) rig.update(1 / 60, 5000 + i * 16);
    expect(rig.center().x).toBeCloseTo(100, 0);
  });
  it('keeps the on-screen scale continuous across look switches (no update between)', () => {
    const rig = new CameraRig({ overview: () => ({ min: [0, -300, 0], max: [900, 0, 120] }), newest: () => null, busiest: () => null, followSpan: () => 400 });
    rig.resize(1280, 720, 2);
    rig.snap();
    // pointScale() feeds the particle shader, which divides by view depth in perspective only, so the
    // comparable quantity is pixels per world unit at the target plane (persp: pointScale / distance = pointScale * tan * aspect / halfWidth).
    const state = () => {
      const { halfWidth } = rig.center();
      const aspect = 1280 / 720;
      const px = rig.isOrtho() ? rig.pointScale() : (rig.pointScale() * TAN * aspect) / halfWidth;
      return { halfWidth, px };
    };
    const near = (a: number, b: number) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(1e-6);
    let before = state();
    for (const look of ['flat', 'realistic', 'cutaway', 'lineart'] as const) {
      rig.setLook(look);
      const after = state();
      near(after.halfWidth, before.halfWidth);
      near(after.px, before.px);
      before = after;
    }
  });
  describe('OrbitControls', () => {
    const noop = () => {};
    const dom = () => ({
      addEventListener: noop, removeEventListener: noop, style: {}, clientWidth: 1280, clientHeight: 800,
      getRootNode: () => ({ addEventListener: noop, removeEventListener: noop }),
      ownerDocument: { addEventListener: noop, removeEventListener: noop },
    }) as unknown as HTMLElement;
    const rigWithControls = () => {
      const rig = new CameraRig({ overview: () => ({ min: [0, -300, 0], max: [900, 0, 120] }), newest: () => null, busiest: () => null, followSpan: () => 400 });
      rig.resize(1280, 800, 1);
      rig.snap();
      rig.attach(dom());
      return { rig, c: rig['controls']! };
    };
    it('a right-drag pan sticks: the rig hands its target to the controls on start only', () => {
      const { rig, c } = rigWithControls();
      const x0 = rig.center().x;
      c.dispatchEvent({ type: 'start' });
      for (let i = 0; i < 3; i++) {
        c.target.x += 50; // what OrbitControls' pan does on pointermove, between frames
        c.object.position.x += 50;
        c.update();
        rig.update(1 / 60, i * 16);
      }
      expect(rig.center().x).toBeCloseTo(x0 + 150, 6);
    });
    describe('with a mutable overview (flights)', () => {
      const A = { min: [0, -300, 0] as Vec3, max: [900, 0, 100] as Vec3 };
      const B = { min: [3000, -300, 0] as Vec3, max: [3900, 0, 100] as Vec3 };
      const mk = () => {
        const ref = { box: A };
        const rig = new CameraRig({ overview: () => ref.box, newest: () => null, busiest: () => null, followSpan: () => 400 });
        rig.resize(1280, 800, 1);
        rig.snap();
        rig.attach(dom());
        return { rig, ref, c: rig['controls']! };
      };
      it('a flight started inside the hold window lands on the new overview and stays there', () => {
        const { rig, ref, c } = mk();
        c.dispatchEvent({ type: 'start' }); // orbit / wheel, then let go: the 4 s hold window is open
        c.dispatchEvent({ type: 'end' });
        ref.box = B;
        rig.fly(A, 0);
        for (let t = 0; t <= FLIGHT_MS; t += 100) rig.update(1 / 60, t);
        expect(rig.flying).toBe(false);
        expect(rig.center().x).toBeCloseTo(3450, 3);
        for (let i = 0; i < 30; i++) rig.update(1 / 60, FLIGHT_MS + 16 * (i + 1)); // still inside the old hold window
        expect(rig.center().x).toBeCloseTo(3450, 3);
      });
      it('a user orbit before fly(): the view direction eases to the goal in the pull-out, no snap at the start', () => {
        const { rig, ref, c } = mk();
        c.dispatchEvent({ type: 'start' });
        const off = c.object.position.clone().sub(c.target).applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.6);
        c.object.position.copy(c.target).add(off);
        rig.update(1 / 60, 0); // dragging: the rig adopts the orbit
        c.dispatchEvent({ type: 'end' });
        const orbit = rig['dir'].clone();
        const goal = new THREE.Vector3(...viewDir('realistic'));
        expect(orbit.angleTo(goal)).toBeGreaterThan(0.3);
        ref.box = B;
        rig.fly(A, 1000);
        rig.update(1 / 60, 1000);
        expect(rig['dir'].distanceTo(orbit)).toBeLessThan(1e-9);
        rig.update(1 / 60, 1000 + FLIGHT_MS * 0.125);
        const mid = rig['dir'].clone();
        expect(mid.angleTo(orbit)).toBeGreaterThan(0.05);
        expect(mid.angleTo(goal)).toBeGreaterThan(0.05);
        rig.update(1 / 60, 1000 + FLIGHT_MS * 0.25);
        expect(rig['dir'].distanceTo(goal)).toBeLessThan(1e-9);
      });
      it('the shake is not applied (nor adopted) while the user holds the camera', () => {
        const { rig, c } = mk();
        rig.update(1 / 60, 0);
        const p0 = rig.active().position.clone();
        rig.shake(1);
        rig.update(1 / 60, 16);
        expect(rig.active().position.distanceTo(p0)).toBeGreaterThan(0.5); // free camera: kicked
        c.dispatchEvent({ type: 'start' });
        for (let i = 0; i < 5; i++) rig.update(1 / 60, 32 + i * 16);
        expect(rig.active().position.distanceTo(p0)).toBeLessThan(1e-3);
        c.dispatchEvent({ type: 'end' });
        for (let i = 0; i < 120; i++) rig.update(1 / 60, 200 + i * 16);
        expect(rig.active().position.distanceTo(p0)).toBeLessThan(1e-3); // and nothing was baked in
      });
    });
    it('clamps: never below the floor plane, sane dolly distance and ortho zoom', () => {
      const { rig, c } = rigWithControls();
      expect(c.maxPolarAngle).toBeLessThan(Math.PI / 2);
      expect(c.maxPolarAngle).toBeGreaterThan(Math.PI / 2 - 0.1);
      expect(c.minDistance).toBeGreaterThan(0);
      expect(c.maxDistance).toBeLessThan(Infinity);
      rig.setLook('flat');
      c.dispatchEvent({ type: 'start' });
      rig.ortho.zoom = 1e4; // wheel in, far past any sane close-up
      rig.update(1 / 60, 0);
      const inMost = rig.center().halfWidth;
      expect(inMost).toBeGreaterThan(20);
      rig.ortho.zoom = 1e-4; // wheel out
      rig.update(1 / 60, 16);
      expect(rig.center().halfWidth).toBeLessThan(1e4);
      expect(rig.center().halfWidth).toBeGreaterThan(inMost);
    });
  });
  it('the perspective near plane is at least 1 and grows with the view distance', () => {
    const ref = { box: { min: [0, -300, 0] as Vec3, max: [900, 0, 100] as Vec3 } };
    const rig = new CameraRig({ overview: () => ref.box, newest: () => null, busiest: () => null, followSpan: () => 400 });
    rig.resize(1280, 800, 1);
    rig.snap();
    const near = rig.persp.near;
    expect(near).toBeGreaterThanOrEqual(1);
    ref.box = { min: [0, -300, 0], max: [8000, 0, 100] };
    rig.snap();
    expect(rig.persp.near).toBeGreaterThan(near);
  });
  it('switches projection with the look', () => {
    const rig = new CameraRig({ overview: () => ({ min: [0, 0, 0], max: [100, 100, 100] }), newest: () => null, busiest: () => null, followSpan: () => 400 });
    rig.setLook('flat');
    expect(rig.isOrtho()).toBe(true);
    rig.setLook('realistic');
    expect(rig.isOrtho()).toBe(false);
  });
});

describe('CameraRig.fly', () => {
  const mk = (box: { min: Vec3; max: Vec3 }) => {
    const ref = { box };
    const rig = new CameraRig({ overview: () => ref.box, newest: () => null, busiest: () => null, followSpan: () => 400 });
    rig.setLook('flat');
    rig.resize(1280, 800, 1);
    rig.snap();
    return { rig, ref };
  };
  const A = { min: [0, -300, 0] as Vec3, max: [900, 0, 100] as Vec3 };
  const B = { min: [3000, -300, 0] as Vec3, max: [3900, 0, 100] as Vec3 };
  it('pulls out on A, pans, and lands exactly on the new overview', () => {
    const { rig, ref } = mk(A);
    const start = rig.center();
    ref.box = B;
    rig.fly(A, 1000);
    expect(rig.flying).toBe(true);
    rig.update(1 / 60, 1000);
    expect(rig.center().x).toBeCloseTo(start.x, 6);
    rig.update(1 / 60, 1000 + FLIGHT_MS * 0.5);
    expect(rig.center().halfWidth).toBeGreaterThan(start.halfWidth * 1.2);
    rig.update(1 / 60, 1000 + FLIGHT_MS);
    expect(rig.flying).toBe(false);
    expect(rig.center().x).toBeCloseTo(3450, 3);
    expect(rig.center().halfWidth).toBeCloseTo(start.halfWidth, 3);
  });
  it('fly twice: the second flight starts from the current pose (no jump)', () => {
    const { rig, ref } = mk(A);
    ref.box = B;
    rig.fly(A, 0);
    rig.update(1 / 60, FLIGHT_MS * 0.5);
    const mid = rig.center();
    ref.box = A;
    rig.fly(B, FLIGHT_MS * 0.5);
    rig.update(1 / 60, FLIGHT_MS * 0.5);
    expect(rig.center().x).toBeCloseTo(mid.x, 6);
    expect(rig.center().halfWidth).toBeCloseTo(mid.halfWidth, 6);
  });
  it('shake offsets the camera briefly, then settles back', () => {
    const { rig } = mk(A);
    rig.update(1 / 60, 0);
    const p0 = rig.active().position.clone();
    rig.shake(1);
    rig.update(1 / 60, 16);
    expect(rig.active().position.distanceTo(p0)).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) rig.update(1 / 60, 32 + i * 16);
    expect(rig.active().position.distanceTo(p0)).toBeLessThan(0.01);
  });
});
