import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { EdgePass } from './edgePass';
import type { Look, Quality } from './types';

type Cam = THREE.PerspectiveCamera | THREE.OrthographicCamera;

export interface Post {
  render(camera: Cam): void;
  setSize(w: number, h: number, pixelRatio: number): void;
  /** See `chain`. */
  configure(look: Look, quality: Quality, edge: THREE.Color): void;
  dispose(): void;
}

export type PassName = 'render' | 'edge' | 'bloom' | 'output';

/** realistic/cutaway: render→bloom(high only)→output; lineart: render→edge→output; flat: render→output. */
export function chain(look: Look, quality: Quality): PassName[] {
  const out: PassName[] = ['render'];
  if (look === 'lineart') out.push('edge');
  if (quality === 'high' && (look === 'realistic' || look === 'cutaway')) out.push('bloom');
  out.push('output');
  return out;
}

export function createPost(gl: THREE.WebGLRenderer, scene: THREE.Scene): Post {
  // Always 4x MSAA: the composer's own targets are not multisampled, so the canvas `antialias` flag would not apply.
  const composer = new EffectComposer(gl, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  const initial = new THREE.PerspectiveCamera();
  const passes: Record<PassName, Pass> = {
    render: new RenderPass(scene, initial),
    edge: new EdgePass(scene, initial),
    bloom: new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 0.9),
    output: new OutputPass(),
  };
  const renderPass = passes.render as RenderPass;
  const edge = passes.edge as EdgePass;
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
      edge.edgeColor.copy(edgeColor);
      for (const name of chain(look, quality)) composer.addPass(passes[name]);
    },
    dispose() {
      for (const p of Object.values(passes)) p.dispose();
      composer.dispose();
    },
  };
}
