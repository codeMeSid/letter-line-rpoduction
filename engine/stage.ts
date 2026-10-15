import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Looks } from './looks';
import type { Vec3 } from './types';

export interface Stage {
  setLook(looks: Looks): void;
  /** Fit the sun's shadow camera around a world box. */
  fitShadow(min: Vec3, max: Vec3): void;
  dispose(): void;
}

const SUN_DIR = new THREE.Vector3(-0.45, -0.6, 1).normalize(); // high, from front-left

/** Lights, environment map, background and tone mapping per look. */
export function createStage(gl: THREE.WebGLRenderer, scene: THREE.Scene): Stage {
  const hemi = new THREE.HemisphereLight(0xdfe8f0, 0x2a2622, 0.7);
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(hemi, sun, sun.target);
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
    fitShadow(min, max) {
      const c = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
      const r = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 + 40;
      sun.target.position.copy(c);
      sun.position.copy(c).addScaledVector(SUN_DIR, 1500);
      const cam = sun.shadow.camera;
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
      cam.near = 10; cam.far = 3200;
      cam.updateProjectionMatrix();
    },
    dispose() {
      env.dispose();
      pmrem.dispose();
      scene.remove(hemi, sun, sun.target);
    },
  };
}
