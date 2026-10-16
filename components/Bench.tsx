'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { AudioBus } from '@/audio/bus';
import { CameraRig, type CameraMode } from '@/engine/camera';
import { createLoop } from '@/engine/loop';
import { Looks, MATERIAL_ROLES, type LookOptions } from '@/engine/looks';
import { ParticleSystem } from '@/engine/particles';
import { ParticlesView } from '@/engine/particlesView';
import { createPost } from '@/engine/post';
import { createRenderer } from '@/engine/renderer';
import { settingsStore } from '@/engine/settings';
import { createStage } from '@/engine/stage';
import type { ProductHandle } from '@/engine/product';
import type { StationDef } from '@/engine/station';
import { LOOKS, type Job, type Vec3 } from '@/engine/types';
import { letterProduct, LETTER_STAGES } from '@/factories/letter/product';
import { cooling } from '@/factories/letter/stations/cooling';
import { moulder } from '@/factories/letter/stations/moulder';
import { pour } from '@/factories/letter/stations/pour';
import { shakeout } from '@/factories/letter/stations/shakeout';
import { buildConveyor } from '@/factories/shared/conveyor';
import { BELT_TOP } from '@/factories/shared/dims';
import {
  beam, column, disposeTree, flange, gauge, gear, hazardBand, housing, legs, panel, pipe, piston, railing,
} from '@/factories/shared/parts';
import { RobotArm } from '@/factories/shared/robotArm';

/** Everything a bench row may touch. */
interface BenchCtx {
  scene: THREE.Scene;
  looks: Looks;
  particles: ParticleSystem;
  /** The letter view's scrubber state, written by the HTML controls and read every frame. */
  live: { current: LiveLetter };
}

/** `scrub` 0..7: the integer part picks the letter stage, the fraction is t. `stationT` < 0 runs the station row; 0..1 freezes every station at that t. */
interface LiveLetter { scrub: number; char: string; stationT: number }

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
type Box = { min: Vec3; max: Vec3 };
const MODES: CameraMode[] = ['overview', 'cinematic'];

/** Task 11 station row: the letter stations side by side at y = STATION_Y, each working a looping job. */
const STATION_Y = 300;
const STATION_DEFS: StationDef[] = [moulder, pour, cooling, shakeout];
const STATION_XS = [-240, -80, 80, 240];
const stationView = (x0: number, x1: number) => ({
  frame: { min: [x0, STATION_Y - 60, 0], max: [x1, STATION_Y + 60, 150] },
  shadow: { min: [-360, STATION_Y - 80, 0], max: [360, STATION_Y + 100, 170] },
  cut: STATION_Y,
}) satisfies { frame: Box; shadow: Box; cut: number };

/** What the overview camera frames, the world box the sun's shadow map covers, and where the cutaway look slices (keeps y >= cut). */
const VIEWS = {
  swatches: { frame: ROW_BOX, shadow: { min: [-380, -120, 0], max: [380, 120, 60] }, cut: 0 },
  line: { frame: { min: [-40, -330, 0], max: [660, -120, 170] }, shadow: { min: [-40, -330, 0], max: [660, -100, 170] }, cut: -200 },
  machine: { frame: { min: [-360, -310, 0], max: [-30, -100, 110] }, shadow: { min: [-360, -310, 0], max: [-30, -100, 110] }, cut: -250 },
  detail: { frame: { min: [-325, -290, 10], max: [-105, -240, 80] }, shadow: { min: [-360, -310, 0], max: [-30, -100, 110] }, cut: -250 },
  letter: { frame: { min: [-235, -465, 0], max: [235, -337, 38] }, shadow: { min: [-250, -480, 0], max: [250, -330, 60] }, cut: -1000 },
  stations: stationView(-320, 320),
  moulder: stationView(STATION_XS[0] - 75, STATION_XS[0] + 75),
  pour: stationView(STATION_XS[1] - 75, STATION_XS[1] + 75),
  cooling: stationView(STATION_XS[2] - 75, STATION_XS[2] + 75),
  shakeout: stationView(STATION_XS[3] - 75, STATION_XS[3] + 75),
} satisfies Record<string, { frame: Box; shadow: Box; cut: number }>;
type ViewKey = keyof typeof VIEWS;
const VIEW_KEYS = Object.keys(VIEWS) as ViewKey[];
/** Views of the station row cut like the real Scene: per object (machines only, products stay whole). */
const LOCAL_CUT = new Set<ViewKey>(['stations', 'moulder', 'pour', 'cooling', 'shakeout']);

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

/**
 * Task 8 parts row at y = -160: conveyor + robot arm (the "line" view) and a small machine island of
 * gantry press, control box, flange + pipe, gear, gauges, hazard band and railing (the "machine" view).
 */
function partsRow({ scene, looks }: BenchCtx): BenchRow {
  const root = new THREE.Group();
  scene.add(root);
  const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z = 0): T => {
    o.position.set(x, y, z);
    root.add(o);
    return o;
  };

  const conveyor = buildConveyor(looks, [[0, -160, 22], [300, -160, 22], [300, -280, 22]], { extendStart: 20, extendEnd: 20 });
  root.add(conveyor.group);
  const arm = new RobotArm(looks);
  at(arm.group, 450, -200);

  // Press: gantry on flanged feet, hydraulic cylinder over an anvil, hazard marking in front.
  for (const x of [-285, -215]) {
    at(column(looks, 3.5, 96), x, -160);
    at(flange(looks, 9, 6), x, -160);
  }
  root.add(beam(looks, [-285, -160, 93], [-215, -160, 93], 7)); // beam() positions itself
  const press = piston(looks, { body: 7, rod: 2.5, len: 34, stroke: 26 });
  at(press.group, -250, -160, 49.5);
  at(housing(looks, 30, 24, 22, 'steel', 3), -250, -160);
  at(hazardBand(looks, 70, 8, 1.2), -250, -190);

  // Machine body on legs with a gauge, hazard trim; control box on its own legs.
  at(legs(looks, 60, 44, 30), -300, -250, 30);
  at(housing(looks, 60, 44, 26, 'paint', 4), -300, -250, 30);
  at(hazardBand(looks, 52, 8, 1), -300, -263, 56);
  const g1 = gauge(looks, 7);
  at(g1.group, -285, -275.5, 43);
  at(legs(looks, 44, 10, 14, 3), -225, -250, 14);
  const ctl = panel(looks, 44, 58);
  at(ctl.group, -225, -250, 14);

  // Flanged pipe run: up, over, flanged end.
  at(flange(looks, 12, 6), -150, -250);
  root.add(pipe(looks, [[-150, -250, 3], [-150, -250, 70], [-108, -250, 70]], 4.6)); // world-space points
  const endFlange = at(flange(looks, 12, 6), -118, -250, 70);
  endFlange.rotation.y = Math.PI / 2;
  const g2 = gauge(looks, 6);
  at(g2.group, -150, -258.5, 45);

  // Gear on a pedestal.
  at(column(looks, 5, 22), -70, -250);
  const cog = at(gear(looks, 18, 14, 5), -70, -250, 22);

  root.add(railing(looks, [[-340, -300, 0], [-340, -110, 0], [-40, -110, 0]], 34));

  let t = 0;
  return {
    update(dt) {
      t += dt;
      looks.scrollBelts(dt * 80);
      conveyor.update(dt, 80);
      const a = t * 0.8;
      arm.reach([90 * Math.cos(a), 90 * Math.sin(a), 40 + 30 * Math.sin(t * 1.7)], dt);
      arm.grip(0.5 + 0.5 * Math.sin(t * 3));
      press.set(0.5 - 0.5 * Math.cos(t * 2));
      g1.set(0.5 + 0.5 * Math.sin(t * 0.9));
      g2.set(0.5 + 0.5 * Math.sin(t * 0.6 + 1));
      cog.rotation.z += dt * 1.2;
      ctl.update(t * 1000);
    },
    dispose() {
      disposeTree(root);
    },
  };
}

const LETTER_ROW_Y = -360;
const LETTER_LIVE_Y = -430;
const letterJob = (char: string): Job => ({
  id: 1, slotId: 1, char, isSpace: !char.trim(), special: 'none', product: 'letter', stage: LETTER_STAGES[0],
  phase: 'station', stationIndex: 0, progress: 0, pos: [0, 0, 0], defect: false, retries: 0,
});
/** Scrub position → [stage, t]. 7 = the last stage, finished. */
const scrubStage = (scrub: number): [string, number] => {
  const k = Math.min(LETTER_STAGES.length - 1, Math.max(0, Math.floor(scrub)));
  return [LETTER_STAGES[k], Math.min(1, scrub - k)];
};

/**
 * Task 10 letter row at y = -360: one 'A' per stage at shape(stage, 1), and a live letter in front
 * driven by the scrubber (range 0..7) and the char box.
 */
function letterRow({ scene, looks, live }: BenchCtx): BenchRow {
  const pc = { looks, marks: settingsStore.getState().letterMarks };
  const make = (char: string, x: number, y: number): ProductHandle => {
    const h = letterProduct.create(letterJob(char), pc);
    h.root.position.set(x, y, 0);
    scene.add(h.root);
    return h;
  };
  const fixed = LETTER_STAGES.map((stage, i) => {
    const h = make('A', (i - 3) * 62, LETTER_ROW_Y);
    h.shape(stage, 1);
    return h;
  });
  let char = live.current.char;
  let scrub = NaN;
  let liveH = make(char, 0, LETTER_LIVE_Y);
  return {
    update() {
      if (live.current.char !== char) {
        liveH.dispose();
        char = live.current.char;
        liveH = make(char, 0, LETTER_LIVE_Y);
        scrub = NaN;
      }
      if (live.current.scrub !== scrub) {
        scrub = live.current.scrub;
        liveH.shape(...scrubStage(scrub));
      }
    },
    restyle() {
      for (const h of [...fixed, liveH]) h.restyle();
    },
    dispose() {
      for (const h of [...fixed, liveH]) h.dispose();
    },
  };
}

const NO_AUDIO = { play() {}, loop: () => ({ setGain() {}, stop() {} }) } as unknown as AudioBus;
const STATION_CHARS = 'CAST';
const IDLE_GAP = 0.6; // s between jobs, so the idle ease-back shows

/**
 * Task 11 station row at y = STATION_Y on one belt: each station gets a real letter handle and a looping fake job
 * (t 0→1 over its duration, a short idle gap, then the product resets to shape(prevStage, 1)). Meshes are
 * cut-tagged like FactoryHost does. `live.stationT` >= 0 freezes every station at that t.
 */
function stationsRow({ scene, looks, particles, live }: BenchCtx): BenchRow {
  const root = new THREE.Group();
  scene.add(root);
  const xs = STATION_XS;
  const conveyor = buildConveyor(looks, [[xs[0] - 100, STATION_Y, BELT_TOP], [xs[xs.length - 1] + 100, STATION_Y, BELT_TOP]]);
  root.add(conveyor.group);
  let clock = 0;
  const pc = { looks, marks: settingsStore.getState().letterMarks };
  const rigs = STATION_DEFS.map((def, i) => {
    const origin: Vec3 = [xs[i], STATION_Y, BELT_TOP];
    const group = new THREE.Group();
    group.position.set(...origin);
    root.add(group);
    const inst = def.create({
      group, origin, looks, particles, audio: NO_AUDIO, settings: () => settingsStore.getState(), now: () => clock * 1000,
      placing: () => [], product: () => null, shelfSpan: () => ({ x0: 0, x1: 0, y: 0, z: 0 }),
    });
    group.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.userData.cut = true; });
    looks.apply(group);
    const prev = LETTER_STAGES[LETTER_STAGES.indexOf(def.outputStage as (typeof LETTER_STAGES)[number]) - 1];
    const job: Job = { ...letterJob(STATION_CHARS[i]), stationIndex: i, stage: prev, pos: origin };
    const product = letterProduct.create(job, pc);
    scene.add(product.root);
    let p = 0;
    let done = false;
    const start = () => {
      p = 0;
      done = false;
      product.shape(prev, 1);
      inst.begin(job, product);
    };
    start();
    return {
      inst,
      product,
      step(dt: number, frozen: number) {
        product.root.position.set(...origin); // the host positions the root before every station update
        if (frozen >= 0) return inst.update(dt, job, frozen, product);
        p += dt / def.duration;
        if (p <= 1) return inst.update(dt, job, p, product);
        if (!done) {
          inst.update(0, job, 1, product);
          inst.finish(job);
          done = true;
        }
        inst.update(dt, null, 0, null);
        if (p > 1 + IDLE_GAP / def.duration) start();
      },
    };
  });
  return {
    update(dt) {
      clock += dt;
      conveyor.update(dt, 80);
      for (const r of rigs) r.step(dt, live.current.stationT);
    },
    restyle() {
      for (const r of rigs) {
        r.inst.restyle?.();
        r.product.restyle();
      }
    },
    dispose() {
      for (const r of rigs) {
        r.inst.destroy();
        r.product.dispose();
      }
      conveyor.dispose();
      disposeTree(root);
    },
  };
}

const ROWS: ((ctx: BenchCtx) => BenchRow)[] = [swatchRow, partsRow, letterRow, stationsRow];

/** Cutaway look: keep y >= the view's cut, so the parts show their halved interior. */
const CUT_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** Dev bench: every material role under every look, plus particles. Grows a row per task. */
export default function Bench() {
  const rootRef = useRef<HTMLDivElement>(null);
  const restyleRef = useRef<((patch: Partial<LookOptions>) => void) | null>(null);
  const modeRef = useRef<((m: CameraMode) => void) | null>(null);
  const viewRef = useRef<((v: ViewKey) => void) | null>(null);
  const [mode, setMode] = useState<CameraMode>('overview');
  const [viewKey, setViewKey] = useState<ViewKey>('swatches');
  const liveRef = useRef<LiveLetter>({ scrub: 0, char: 'A', stationT: -0.05 });
  const [live, setLive] = useState<LiveLetter>(liveRef.current);
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

    const floor = looks.part(new THREE.BoxGeometry(1300, 940, 4).translate(150, -50, -2), 'concrete');
    r.scene.add(floor);
    stage.fitShadow(VIEWS.swatches.shadow.min, VIEWS.swatches.shadow.max);
    const ctx: BenchCtx = { scene: r.scene, looks, particles, live: liveRef };
    const rows = ROWS.map((row) => row(ctx));

    let frame: Box = VIEWS.swatches.frame;
    let current: ViewKey = 'swatches';
    CUT_PLANE.constant = -VIEWS.swatches.cut; // module-level plane: a remount must not inherit the last view's cut
    looks.cutPlane.constant = -VIEWS.swatches.cut;
    const clip = () => {
      r.gl.clippingPlanes = looks.opts.look === 'cutaway' && !LOCAL_CUT.has(current) ? [CUT_PLANE] : [];
    };
    const rig = new CameraRig({ overview: () => frame, newest: () => null, busiest: () => null, followSpan: () => 400 });
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
      clip();
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
    viewRef.current = (v) => {
      frame = VIEWS[v].frame;
      current = v;
      CUT_PLANE.constant = -VIEWS[v].cut;
      looks.cutPlane.constant = -VIEWS[v].cut;
      clip();
      stage.fitShadow(VIEWS[v].shadow.min, VIEWS[v].shadow.max);
      rig.snap();
      setViewKey(v);
    };
    const onResize = () => { r.resize(); sync(); loop.wake(); };
    const onVisible = () => loop.wake();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      restyleRef.current = null;
      modeRef.current = null;
      viewRef.current = null;
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
  const setLiveLetter = (patch: Partial<LiveLetter>) => {
    liveRef.current = { ...liveRef.current, ...patch };
    setLive(liveRef.current);
  };
  const [liveStage, liveT] = scrubStage(live.scrub);
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
          {VIEW_KEYS.map((v) => (
            <button key={v} type="button" aria-pressed={viewKey === v} onClick={() => viewRef.current?.(v)}>
              view: {v}
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
        {LOCAL_CUT.has(viewKey) && (
          <div className="bench-live">
            <label>
              {live.stationT < 0 ? 'stations: running' : `stations frozen at t ${live.stationT.toFixed(2)}`}
              <input
                type="range" min={-0.05} max={1} step={0.01} value={live.stationT}
                onChange={(e) => setLiveLetter({ stationT: Number(e.target.value) })}
              />
            </label>
          </div>
        )}
        {viewKey === 'letter' && (
          <div className="bench-live">
            <label>
              stage {liveStage} {liveT.toFixed(2)}
              <input
                type="range" min={0} max={LETTER_STAGES.length} step={0.01} value={live.scrub}
                onChange={(e) => setLiveLetter({ scrub: Number(e.target.value) })}
              />
            </label>
            <label>
              char
              <input type="text" maxLength={1} value={live.char} onChange={(e) => setLiveLetter({ char: e.target.value })} />
            </label>
          </div>
        )}
        <div className="bench-caption">{MATERIAL_ROLES.map((role, i) => `${i + 1} ${role}`).join(' · ')}</div>
      </div>
    </>
  );
}
