import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { EdgePass } from './edgePass';
import type { Look, Quality } from './types';

type Cam = THREE.PerspectiveCamera | THREE.OrthographicCamera;

export interface Post {
  render(camera: Cam): void;
  setSize(w: number, h: number, pixelRatio: number): void;
  /** realistic/cutaway: render→bloom(high)→output; lineart: render→edge→bloom(high)→output; flat: render→output. */
  configure(look: Look, quality: Quality, edge: THREE.Color): void;
  dispose(): void;
}

export function createPost(gl: THREE.WebGLRenderer, scene: THREE.Scene): Post {
  const composer = new EffectComposer(gl);
  const initial = new THREE.PerspectiveCamera();
  const renderPass = new RenderPass(scene, initial);
  const edge = new EdgePass(scene, initial);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 0.9);
  const output = new OutputPass();
  return {
    render(camera) {
      renderPass.camera = camera;
      edge.camera = camera;
      composer.render();
    },
    setSize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
    },
    configure(look, quality, edgeColor) {
      while (composer.passes.length) composer.removePass(composer.passes[0]);
      composer.addPass(renderPass);
      if (look === 'lineart') {
        edge.edgeColor.copy(edgeColor);
        composer.addPass(edge);
      }
      if (quality === 'high' && look !== 'flat') composer.addPass(bloom);
      composer.addPass(output);
    },
    dispose() {
      edge.dispose();
      bloom.dispose();
      output.dispose();
      composer.dispose();
    },
  };
}
