'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CameraRig, type CameraMode } from '@/engine/camera';
import { createLoop } from '@/engine/loop';
import { Looks, MATERIAL_ROLES, type LookOptions } from '@/engine/looks';
import { ParticleSystem } from '@/engine/particles';
import { ParticlesView } from '@/engine/particlesView';
import { createPost } from '@/engine/post';
import { createRenderer } from '@/engine/renderer';
import { settingsStore } from '@/engine/settings';
import { createStage } from '@/engine/stage';
import { LOOKS, type Vec3 } from '@/engine/types';

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
const SWATCH_X0 = -((MATERIAL_ROLES.length - 1) / 2) * SWATCH_STEP;
/** The swatch row plus its particle emitter: what the overview camera frames. */
const ROW_BOX: { min: Vec3; max: Vec3 } = {
  min: [SWATCH_X0 - 20, -20, 0],
  max: [SWATCH_X0 + MATERIAL_ROLES.length * SWATCH_STEP + 20, 20, 30],
};
const MODES: CameraMode[] = ['overview', 'cinematic'];

/** One rounded box per material role, +x apart; sprays spark + sand at the row's end. */
function swatchRow({ scene, looks, particles }: BenchCtx): BenchRow {
  const group = new THREE.Group();
  const x0 = SWATCH_X0;
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

/** Cutaway look: keep y >= 0, so the swatches show their halved interior. */
const CUT_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** Dev bench: every material role under every look, plus particles. Grows a row per task. */
export default function Bench() {
  const rootRef = useRef<HTMLDivElement>(null);
  const restyleRef = useRef<((patch: Partial<LookOptions>) => void) | null>(null);
  const modeRef = useRef<((m: CameraMode) => void) | null>(null);
  const [mode, setMode] = useState<CameraMode>('overview');
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

    const rig = new CameraRig({ overview: () => ROW_BOX, newest: () => null, busiest: () => null, followSpan: () => 400 });
    const post = createPost(r.gl, r.scene);
    const sync = () => {
      const { w, h } = r.size();
      const pr = r.gl.getPixelRatio();
      rig.resize(w, h, pr);
      post.setSize(w, h, pr);
    };
    const configure = () => {
      const o = looks.opts;
      rig.setLook(o.look);
      post.configure(o.look, o.quality, looks.edgeColor());
      r.gl.clippingPlanes = o.look === 'cutaway' ? [CUT_PLANE] : [];
    };
    sync();
    configure();
    rig.attach(r.gl.domElement);
    rig.snap();

    const loop = createLoop(() => 1);
    loop.add({
      update(simDt, realDt, now) {
        for (const row of rows) row.update?.(simDt);
        particles.update(simDt);
        view.sync();
        rig.update(realDt, now);
        view.setProjection(rig.pointScale(), rig.isOrtho());
        post.render(rig.active());
        return true; // the emitter never stops
      },
    });

    restyleRef.current = (patch) => {
      const next = { ...looks.opts, ...patch };
      if (patch.quality) {
        r.setQuality(patch.quality);
        sync();
      }
      looks.set(next);
      looks.apply(r.scene);
      stage.setLook(looks);
      view.refresh();
      for (const row of rows) row.restyle?.();
      configure();
      setOpts(next);
    };
    modeRef.current = (m) => {
      rig.mode = m;
      setMode(m);
    };
    const onResize = () => { r.resize(); sync(); loop.wake(); };
    const onVisible = () => loop.wake();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      restyleRef.current = null;
      modeRef.current = null;
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
      loop.dispose();
      for (const row of rows) row.dispose?.();
      floor.geometry.dispose();
      rig.dispose();
      post.dispose();
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
          {MODES.map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => modeRef.current?.(m)}>
              {m}
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
