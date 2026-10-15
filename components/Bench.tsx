'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createLoop } from '@/engine/loop';
import { Looks, MATERIAL_ROLES, type LookOptions } from '@/engine/looks';
import { ParticleSystem } from '@/engine/particles';
import { PARTICLE_LAYER, ParticlesView } from '@/engine/particlesView';
import { createRenderer } from '@/engine/renderer';
import { settingsStore } from '@/engine/settings';
import { createStage } from '@/engine/stage';
import { LOOKS } from '@/engine/types';

/** Everything a bench row may touch. */
interface BenchCtx {
  scene: THREE.Scene;
  looks: Looks;
  particles: ParticleSystem;
}

/** One row of the bench. Add a row = write a `(ctx) => BenchRow` and append it to ROWS. */
interface BenchRow {
  /** Every frame, sim seconds. */
  update?(dt: number): void;
  /** Look changed (after `looks.apply(scene)`): rebuild any own() materials. */
  restyle?(): void;
  dispose?(): void;
}

const SWATCH_STEP = 40;

/** One rounded box per material role, +x apart; sprays spark + sand at the row's end. */
function swatchRow({ scene, looks, particles }: BenchCtx): BenchRow {
  const group = new THREE.Group();
  const x0 = -((MATERIAL_ROLES.length - 1) / 2) * SWATCH_STEP;
  MATERIAL_ROLES.forEach((role, i) => {
    const box = looks.part(new RoundedBoxGeometry(24, 24, 24, 3, 3), role);
    box.position.set(x0 + i * SWATCH_STEP, 0, 12);
    group.add(box);
  });
  scene.add(group);
  const end: [number, number, number] = [x0 + MATERIAL_ROLES.length * SWATCH_STEP, 0, 8];
  return {
    update() {
      particles.emit('spark', { pos: end, count: 2, vel: [0, 0, 140] });
      particles.emit('sand', { pos: end, count: 2, vel: [0, 0, 70] });
    },
    dispose() {
      group.removeFromParent();
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}

const ROWS: ((ctx: BenchCtx) => BenchRow)[] = [swatchRow];

const FOV = 32;
const HALF_WIDTH = 340; // world units kept in view horizontally
const VIEW_DIR = new THREE.Vector3(0, -0.9, 0.42).normalize();

/** Dev bench: every material role under every look, plus particles. Grows a row per task. */
export default function Bench() {
  const rootRef = useRef<HTMLDivElement>(null);
  const restyleRef = useRef<((patch: Partial<LookOptions>) => void) | null>(null);
  const [opts, setOpts] = useState<LookOptions>(() => {
    const s = settingsStore.getState();
    return { look: s.look, theme: s.theme, colorMode: s.colorMode, quality: s.quality };
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const r = createRenderer(root, opts.quality);
    const looks = new Looks(opts);
    const stage = createStage(r.gl, r.scene);
    stage.setLook(looks);
    const particles = new ParticleSystem();
    const view = new ParticlesView(particles, (k) => looks.particleColor(k));
    r.scene.add(view.group);

    const floor = looks.part(new THREE.BoxGeometry(760, 240, 4).translate(0, 0, -2), 'concrete');
    r.scene.add(floor);
    stage.fitShadow([-380, -120, 0], [380, 120, 60]);
    const ctx: BenchCtx = { scene: r.scene, looks, particles };
    const rows = ROWS.map((row) => row(ctx));

    const cam = new THREE.PerspectiveCamera(FOV, 1, 1, 5000);
    cam.up.set(0, 0, 1);
    cam.layers.enable(PARTICLE_LAYER);
    const fit = () => {
      const { w, h } = r.size();
      cam.aspect = w / h;
      const dist = Math.max(500, HALF_WIDTH / (Math.tan((FOV * Math.PI) / 360) * cam.aspect));
      cam.position.copy(VIEW_DIR).multiplyScalar(dist).add(new THREE.Vector3(0, 0, 10));
      cam.lookAt(0, 0, 10);
      cam.updateProjectionMatrix();
    };
    fit();

    const loop = createLoop(() => 1);
    loop.add({
      update(simDt) {
        for (const row of rows) row.update?.(simDt);
        particles.update(simDt);
        view.sync();
        view.setProjection((r.size().h * r.gl.getPixelRatio()) / (2 * Math.tan((FOV * Math.PI) / 360)), false);
        r.gl.render(r.scene, cam);
        return true; // the emitter never stops
      },
    });

    restyleRef.current = (patch) => {
      const next = { ...looks.opts, ...patch };
      if (patch.quality) r.setQuality(patch.quality);
      looks.set(next);
      looks.apply(r.scene);
      stage.setLook(looks);
      view.refresh();
      for (const row of rows) row.restyle?.();
      setOpts(next);
    };
    const onResize = () => { r.resize(); fit(); loop.wake(); };
    const onVisible = () => loop.wake();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      restyleRef.current = null;
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
      loop.dispose();
      for (const row of rows) row.dispose?.();
      floor.geometry.dispose();
      view.dispose();
      looks.dispose();
      stage.dispose();
      r.dispose();
    };
    // `opts` only seeds the first mount; later changes go through restyleRef.
  }, []);

  const set = (patch: Partial<LookOptions>) => restyleRef.current?.(patch);
  return (
    <>
      <div ref={rootRef} className="stage" />
      <div className="bench-ui">
        <div className="bench-bar">
          {LOOKS.map((look) => (
            <button key={look} type="button" aria-pressed={opts.look === look} onClick={() => set({ look })}>
              {look}
            </button>
          ))}
          <button type="button" aria-pressed={opts.theme === 'light'} onClick={() => set({ theme: opts.theme === 'dark' ? 'light' : 'dark' })}>
            theme: {opts.theme}
          </button>
          <button type="button" aria-pressed={opts.quality === 'low'} onClick={() => set({ quality: opts.quality === 'high' ? 'low' : 'high' })}>
            quality: {opts.quality}
          </button>
        </div>
        <div className="bench-caption">{MATERIAL_ROLES.map((role, i) => `${i + 1} ${role}`).join(' · ')}</div>
      </div>
    </>
  );
}
