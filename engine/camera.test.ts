import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig, FOV, fitView, viewDir } from './camera';
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
  it('switches projection with the look', () => {
    const rig = new CameraRig({ overview: () => ({ min: [0, 0, 0], max: [100, 100, 100] }), newest: () => null, busiest: () => null, followSpan: () => 400 });
    rig.setLook('flat');
    expect(rig.isOrtho()).toBe(true);
    rig.setLook('realistic');
    expect(rig.isOrtho()).toBe(false);
  });
});
