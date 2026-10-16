import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

/**
 * Crease strength = 1 - dot(n, n') between the view normals CREASE_R CSS px either side of a pixel (0.1 is about 25 degrees).
 * Tuned on the bench at 1280x800, overview camera, RoundedBox r=3 swatches (~2.3 px per world unit): each edge reads as one
 * 2-3 px line, flat faces stay clean, silhouettes stay with the depth term. It is a screen-space measure, so bevels wider than
 * about 2 x CREASE_R px (zoomed-in cameras) fall below CREASE_LO and only the silhouette remains.
 */
const CREASE_R = 3;
const CREASE_LO = 0.4;
const CREASE_HI = 0.6;
/** Neighbours count as the same surface when their view depth differs by less than this fraction of the distance. */
const SURFACE = 0.005;

const FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tDiffuse;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float pixelRatio;
uniform vec3 edgeColor;
uniform float cameraNear;
uniform float cameraFar;
uniform bool ortho;
varying vec2 vUv;
const vec2 AXES[4] = vec2[4](vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0), vec2(1.0, -1.0));
const vec2 DIRS[4] = vec2[4](vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0));
float viewZ(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return ortho ? orthographicDepthToViewZ(d, cameraNear, cameraFar) : perspectiveDepthToViewZ(d, cameraNear, cameraFar);
}
vec3 normalAt(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
void main() {
  vec2 cpx = pixelRatio / resolution; // one CSS pixel, so lines weigh the same at any devicePixelRatio
  float zc = viewZ(vUv);
  float dz = 0.0;
  for (int i = 0; i < 4; i++) dz += abs(viewZ(vUv + DIRS[i] * cpx) - zc);
  // Creases: the sharpest normal turn across the pixel, between opposite same-surface neighbours along 4 axes.
  float crease = 0.0;
  float tol = ${SURFACE.toFixed(3)} * max(-zc, 1.0);
  for (int i = 0; i < 4; i++) {
    vec2 o = AXES[i] * ${CREASE_R.toFixed(1)} * cpx;
    float z0 = viewZ(vUv - o);
    float z1 = viewZ(vUv + o);
    if (abs(z0 - zc) < tol && abs(z1 - zc) < tol) crease = max(crease, 1.0 - dot(normalAt(vUv - o), normalAt(vUv + o)));
  }
  float depthEdge = smoothstep(0.015, 0.04, dz / max(-zc, 1.0));
  float creaseEdge = smoothstep(${CREASE_LO.toFixed(2)}, ${CREASE_HI.toFixed(2)}, crease);
  float e = max(depthEdge, creaseEdge);
  vec4 c = texture2D(tDiffuse, vUv);
  gl_FragColor = vec4(mix(c.rgb, edgeColor, e), c.a);
}`;
const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Line-art look: neighbour depth difference (silhouettes) + neighbour normal difference (creases) of layer 0 (particles excluded), drawn over the colour. */
export class EdgePass extends Pass {
  readonly edgeColor = new THREE.Color();
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  private normalMat = new THREE.MeshNormalMaterial();
  private mat: THREE.ShaderMaterial;
  private quad: FullScreenQuad;

  constructor(private scene: THREE.Scene, camera: THREE.PerspectiveCamera | THREE.OrthographicCamera) {
    super();
    this.camera = camera;
    this.target.depthTexture = new THREE.DepthTexture(1, 1);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tNormal: { value: null }, tDepth: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) }, edgeColor: { value: new THREE.Color() },
        cameraNear: { value: 1 }, cameraFar: { value: 1000 }, ortho: { value: false },
        pixelRatio: { value: 1 },
      },
      vertexShader: VERT, fragmentShader: FRAG,
    });
    this.quad = new FullScreenQuad(this.mat);
  }

  setSize(w: number, h: number): void {
    this.target.setSize(w, h);
    (this.mat.uniforms.resolution.value as THREE.Vector2).set(w, h);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const cam = this.camera;
    const mask = cam.layers.mask;
    const bg = this.scene.background;
    const shadows = renderer.shadowMap.autoUpdate;
    cam.layers.set(0);
    this.scene.background = null;
    this.scene.overrideMaterial = this.normalMat;
    renderer.shadowMap.autoUpdate = false; // the colour pass already refreshed the shadow map this frame
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, cam);
    renderer.shadowMap.autoUpdate = shadows;
    this.scene.overrideMaterial = null;
    this.scene.background = bg;
    cam.layers.mask = mask;
    const u = this.mat.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tNormal.value = this.target.texture;
    u.tDepth.value = this.target.depthTexture;
    u.pixelRatio.value = renderer.getPixelRatio();
    u.cameraNear.value = cam.near;
    u.cameraFar.value = cam.far;
    u.ortho.value = (cam as THREE.OrthographicCamera).isOrthographicCamera === true;
    (u.edgeColor.value as THREE.Color).copy(this.edgeColor);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.target.dispose();
    this.normalMat.dispose();
    this.mat.dispose();
    this.quad.dispose();
  }
}
