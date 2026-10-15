import * as THREE from 'three';
import type { Quality } from './types';

export interface Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  size(): { w: number; h: number };
  setQuality(q: Quality): void;
  resize(): void;
  dispose(): void;
}

/** One WebGL canvas filling `root`. Pixel ratio capped at 2 (1 on low quality); shadows off on low. */
export function createRenderer(root: HTMLElement, quality: Quality): Renderer {
  const gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.shadowMap.type = THREE.PCFShadowMap;
  gl.localClippingEnabled = true;
  root.appendChild(gl.domElement);
  const scene = new THREE.Scene();
  let w = 1;
  let h = 1;
  const quality_ = (q: Quality) => {
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : 1));
    gl.shadowMap.enabled = q === 'high';
  };
  const resize = () => {
    w = Math.max(1, root.clientWidth);
    h = Math.max(1, root.clientHeight);
    gl.setSize(w, h);
  };
  quality_(quality);
  resize();
  return {
    gl, scene,
    size: () => ({ w, h }),
    setQuality: (q) => { quality_(q); resize(); },
    resize,
    dispose: () => { gl.dispose(); gl.domElement.remove(); },
  };
}
