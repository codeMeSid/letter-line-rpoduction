import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SUN_NOON, type Sky } from './dayNight';
import type { Looks } from './looks';
import type { Vec3 } from './types';

export interface Stage {
  setLook(looks: Looks): void;
  /** Day/night: scales the sun and hemisphere lights of the current look, moves/tints the sun, dims the background. Call after `setLook`. */
  setSky(sky: Sky, looks: Looks): void;
  /** Fit the sun's shadow camera around a world box. */
  fitShadow(min: Vec3, max: Vec3): void;
  /** Muzzle flash: a brief warm point light at `pos` (decays over ~0.12 s as `tick` runs). */
  flash(pos: Vec3): void;
  tick(dt: number): void;
  dispose(): void;
}

const FLASH_T = 0.12;     // seconds the muzzle flash lasts
const FLASH_PEAK = 60000; // candela at the first frame (physical point light, decay 2); tuned so the gun and nearby shelf light up

const NIGHT_BG = new THREE.Color(0x070a14);
const SUN_DIST = 1500;

/** Lights, environment map, background and tone mapping per look. */
export function createStage(gl: THREE.WebGLRenderer, scene: THREE.Scene): Stage {
  const hemi = new THREE.HemisphereLight(0xdfe8f0, 0x2a2622, 0.7);
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  // always in the scene at intensity 0, so the light count never changes and no shader recompiles
  const muzzle = new THREE.PointLight(0xffd9a0, 0, 500, 2);
  let flashT = 0;
  const sunDir = new THREE.Vector3(...SUN_NOON); // high, from front-left at noon
  const centre = new THREE.Vector3();
  const bg = new THREE.Color();
  scene.add(hemi, sun, sun.target, muzzle);
  const pmrem = new THREE.PMREMGenerator(gl);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  return {
    setLook(looks) {
      const { look } = looks.opts;
      const lit = look === 'realistic' || look === 'cutaway';
      scene.background = looks.background();
      scene.environment = lit ? env : null;
      scene.environmentIntensity = 0.6;
      gl.toneMapping = lit ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
      gl.toneMappingExposure = 1;
      hemi.intensity = look === 'flat' ? 1.2 : 0.7;
      sun.intensity = look === 'flat' ? 1.8 : 2.4;
    },
    setSky(sky, looks) {
      const flat = looks.opts.look === 'flat';
      sun.color.setHex(sky.sunColor);
      sun.intensity = (flat ? 1.8 : 2.4) * sky.sunScale;
      hemi.intensity = (flat ? 1.2 : 0.7) * sky.hemiScale;
      sunDir.set(...sky.sunDir);
      sun.position.copy(centre).addScaledVector(sunDir, SUN_DIST);
      if (looks.opts.look !== 'lineart') scene.background = bg.copy(looks.background()).lerp(NIGHT_BG, 0.75 * sky.night);
    },
    fitShadow(min, max) {
      const c = centre.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
      const r = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 + 40;
      sun.target.position.copy(c);
      sun.position.copy(c).addScaledVector(sunDir, SUN_DIST);
      const cam = sun.shadow.camera;
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
      cam.near = 10; cam.far = 3200;
      cam.updateProjectionMatrix();
    },
    flash(pos) {
      muzzle.position.set(pos[0], pos[1], pos[2]);
      flashT = FLASH_T;
    },
    tick(dt) {
      muzzle.intensity = (FLASH_PEAK * Math.max(0, flashT)) / FLASH_T;
      flashT = Math.max(0, flashT - dt);
    },
    dispose() {
      env.dispose();
      pmrem.dispose();
      scene.remove(hemi, sun, sun.target, muzzle);
    },
  };
}
